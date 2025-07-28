/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { quote } from 'shell-quote';
import {
  USER_SETTINGS_DIR,
  SETTINGS_DIRECTORY_NAME,
} from '../config/settings.js';
import { promisify } from 'util';
import { SandboxConfig } from '@iflytek/iflycode-core';

const execAsync = promisify(exec);

function getContainerPath(hostPath: string): string {
  if (os.platform() !== 'win32') {
    return hostPath;
  }
  const withForwardSlashes = hostPath.replace(/\\/g, '/');
  const match = withForwardSlashes.match(/^([A-Z]):\/(.*)/i);
  if (match) {
    return `/${match[1].toLowerCase()}/${match[2]}`;
  }
  return hostPath;
}

const LOCAL_DEV_SANDBOX_IMAGE_NAME = 'gemini-cli-sandbox';
const SANDBOX_NETWORK_NAME = 'gemini-cli-sandbox';
const SANDBOX_PROXY_NAME = 'gemini-cli-sandbox-proxy';
const BUILTIN_SEATBELT_PROFILES = [
  'permissive-open',
  'permissive-closed',
  'permissive-proxied',
  'restrictive-open',
  'restrictive-closed',
  'restrictive-proxied',
];

/**
 * 确定沙箱容器是否应使用当前用户的 UID 和 GID 运行。
 * 在使用 rootful Docker 且未配置 userns-remap 的 Linux 系统（尤其是基于 Debian/Ubuntu 的系统）上，
 * 这通常是必要的，以避免挂载卷时出现权限问题。
 *
 * 该行为由 `SANDBOX_SET_UID_GID` 环境变量控制：
 * - 如果 `SANDBOX_SET_UID_GID` 为 "1" 或 "true"，此函数返回 `true`。
 * - 如果 `SANDBOX_SET_UID_GID` 为 "0" 或 "false"，此函数返回 `false`。
 * - 如果未设置 `SANDBOX_SET_UID_GID`：
 *   - 在基于 Debian/Ubuntu 的 Linux 上，默认为 `true`。
 *   - 在其他操作系统上，或操作系统检测失败时，默认为 `false`。
 *
 * 有关以非 root 用户身份运行 Docker 容器的更多背景信息，请参见：
 * https://medium.com/redbubble/running-a-docker-container-as-a-non-root-user-7d2e00f8ee15
 *
 * @returns {Promise<boolean>} 一个解析为 true（如果应使用当前用户的 UID/GID）或 false 的 Promise。
 */
async function shouldUseCurrentUserInSandbox(): Promise<boolean> {
  const envVar = process.env.SANDBOX_SET_UID_GID?.toLowerCase().trim();

  if (envVar === '1' || envVar === 'true') {
    return true;
  }
  if (envVar === '0' || envVar === 'false') {
    return false;
  }

  // 如果未显式设置环境变量，则检查是否为基于 Debian/Ubuntu 的 Linux
  if (os.platform() === 'linux') {
    try {
      const osReleaseContent = await readFile('/etc/os-release', 'utf8');
      if (
        osReleaseContent.includes('ID=debian') ||
        osReleaseContent.includes('ID=ubuntu') ||
        osReleaseContent.match(/^ID_LIKE=.*debian.*/m) || // 涵盖衍生版本
        osReleaseContent.match(/^ID_LIKE=.*ubuntu.*/m) // 涵盖衍生版本
      ) {
        // 注意此处及以下我们使用 console.error 输出 stderr 上的信息消息
        console.error(
          'INFO: 在基于 Debian/Ubuntu 的 Linux 上默认使用当前用户 UID/GID。',
        );
        return true;
      }
    } catch (_err) {
      // 如果 /etc/os-release 不存在或不可读，则静默忽略。
      // 在这种情况下将应用默认值 (false)。
      console.warn(
        'Warning: 无法读取 /etc/os-release 以自动检测 Debian/Ubuntu 用于 UID/GID 默认值。',
      );
    }
  }
  return false; // 如果未满足其他条件，则默认为 false
}

// docker 不允许容器名称包含 ':' 或 '/'，因此我们
// 解析并删除这些字符，并使名称更短一些
function parseImageName(image: string): string {
  const [fullName, tag] = image.split(':');
  const name = fullName.split('/').at(-1) ?? 'unknown-image';
  return tag ? `${name}-${tag}` : name;
}

function ports(): string[] {
  return (process.env.SANDBOX_PORTS ?? '')
    .split(',')
    .filter((p) => p.trim())
    .map((p) => p.trim());
}

function entrypoint(workdir: string): string[] {
  const isWindows = os.platform() === 'win32';
  const containerWorkdir = getContainerPath(workdir);
  const shellCmds = [];
  const pathSeparator = isWindows ? ';' : ':';

  let pathSuffix = '';
  if (process.env.PATH) {
    const paths = process.env.PATH.split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pathSuffix) {
    shellCmds.push(`export PATH="$PATH${pathSuffix}";`);
  }

  let pythonPathSuffix = '';
  if (process.env.PYTHONPATH) {
    const paths = process.env.PYTHONPATH.split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pythonPathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pythonPathSuffix) {
    shellCmds.push(`export PYTHONPATH="$PYTHONPATH${pythonPathSuffix}";`);
  }

  const projectSandboxBashrc = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.bashrc',
  );
  if (fs.existsSync(projectSandboxBashrc)) {
    shellCmds.push(`source ${getContainerPath(projectSandboxBashrc)};`);
  }

  ports().forEach((p) =>
    shellCmds.push(
      `socat TCP4-LISTEN:${p},bind=$(hostname -i),fork,reuseaddr TCP4:127.0.0.1:${p} 2> /dev/null &`,
    ),
  );

  const cliArgs = process.argv.slice(2).map((arg) => quote([arg]));
  const cliCmd =
    process.env.NODE_ENV === 'development'
      ? process.env.DEBUG
        ? 'npm run debug --'
        : 'npm rebuild && npm run start --'
      : process.env.DEBUG
        ? `node --inspect-brk=0.0.0.0:${process.env.DEBUG_PORT || '9229'} $(which gemini)`
        : 'gemini';

  const args = [...shellCmds, cliCmd, ...cliArgs];

  return ['bash', '-c', args.join(' ')];
}

export async function start_sandbox(
  config: SandboxConfig,
  nodeArgs: string[] = [],
) {
  if (config.command === 'sandbox-exec') {
    // 禁用 BUILD_SANDBOX
    if (process.env.BUILD_SANDBOX) {
      console.error('ERROR: 使用 MacOS Seatbelt 时无法 BUILD_SANDBOX');
      process.exit(1);
    }
    const profile = (process.env.SEATBELT_PROFILE ??= 'permissive-open');
    let profileFile = new URL(`sandbox-macos-${profile}.sb`, import.meta.url)
      .pathname;
    // 如果配置文件名未被识别，则在项目设置目录下查找文件
    if (!BUILTIN_SEATBELT_PROFILES.includes(profile)) {
      profileFile = path.join(
        SETTINGS_DIRECTORY_NAME,
        `sandbox-macos-${profile}.sb`,
      );
    }
    if (!fs.existsSync(profileFile)) {
      console.error(
        `ERROR: 缺少 macos seatbelt 配置文件 '${profileFile}'`,
      );
      process.exit(1);
    }
    // 在 STDERR 上记录，以免混淆 STDOUT 上的输出
    console.error(`使用 macos seatbelt (配置文件: ${profile}) ...`);
    // 如果设置了 DEBUG，则转换为 NODE_OPTIONS 中的 --inspect-brk
    const nodeOptions = [
      ...(process.env.DEBUG ? ['--inspect-brk'] : []),
      ...nodeArgs,
    ].join(' ');

    const args = [
      '-D',
      `TARGET_DIR=${fs.realpathSync(process.cwd())}`,
      '-D',
      `TMP_DIR=${fs.realpathSync(os.tmpdir())}`,
      '-D',
      `HOME_DIR=${fs.realpathSync(os.homedir())}`,
      '-D',
      `CACHE_DIR=${fs.realpathSync(execSync(`getconf DARWIN_USER_CACHE_DIR`).toString().trim())}`,
      '-f',
      profileFile,
      'sh',
      '-c',
      [
        `SANDBOX=sandbox-exec`,
        `NODE_OPTIONS="${nodeOptions}"`,
        ...process.argv.map((arg) => quote([arg])),
      ].join(' '),
    ];
    // 如果设置了 GEMINI_SANDBOX_PROXY_COMMAND，则启动并设置代理
    const proxyCommand = process.env.GEMINI_SANDBOX_PROXY_COMMAND;
    let proxyProcess: ChildProcess | undefined = undefined;
    let sandboxProcess: ChildProcess | undefined = undefined;
    const sandboxEnv = { ...process.env };
    if (proxyCommand) {
      const proxy =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        'http://localhost:8877';
      sandboxEnv['HTTPS_PROXY'] = proxy;
      sandboxEnv['https_proxy'] = proxy; // 小写可能是必需的，例如用于 curl
      sandboxEnv['HTTP_PROXY'] = proxy;
      sandboxEnv['http_proxy'] = proxy;
      const noProxy = process.env.NO_PROXY || process.env.no_proxy;
      if (noProxy) {
        sandboxEnv['NO_PROXY'] = noProxy;
        sandboxEnv['no_proxy'] = noProxy;
      }
      proxyProcess = spawn(proxyCommand, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: true,
      });
      // 安装处理程序以在退出/信号时停止代理
      const stopProxy = () => {
        console.log('正在停止代理 ...');
        if (proxyProcess?.pid) {
          process.kill(-proxyProcess.pid, 'SIGTERM');
        }
      };
      process.on('exit', stopProxy);
      process.on('SIGINT', stopProxy);
      process.on('SIGTERM', stopProxy);

      // 注释掉因为它会干扰 ink 渲染
      // proxyProcess.stdout?.on('data', (data) => {
      //   console.info(data.toString());
      // });
      proxyProcess.stderr?.on('data', (data) => {
        console.error(data.toString());
      });
      proxyProcess.on('close', (code, signal) => {
        console.error(
          `ERROR: 代理命令 '${proxyCommand}' 退出，代码 ${code}，信号 ${signal}`,
        );
        if (sandboxProcess?.pid) {
          process.kill(-sandboxProcess.pid, 'SIGTERM');
        }
        process.exit(1);
      });
      console.log('等待代理启动 ...');
      await execAsync(
        `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
      );
    }
    // 生成子进程并让它继承 stdio
    sandboxProcess = spawn(config.command, args, {
      stdio: 'inherit',
    });
    await new Promise((resolve) => sandboxProcess?.on('close', resolve));
    return;
  }

  console.error(`进入沙箱 (命令: ${config.command}) ...`);

  // 确定 gemini-cli 的完整路径以区分链接与安装设置
  const gcPath = fs.realpathSync(process.argv[1]);

  const projectSandboxDockerfile = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.Dockerfile',
  );
  const isCustomProjectSandbox = fs.existsSync(projectSandboxDockerfile);

  const image = config.image;
  const workdir = path.resolve(process.cwd());
  const containerWorkdir = getContainerPath(workdir);

  // 如果设置了 BUILD_SANDBOX，则调用 gemini-cli 仓库下的 scripts/build_sandbox.js
  //
  // 注意这只能通过从 gemini-cli 仓库链接的二进制文件完成
  if (process.env.BUILD_SANDBOX) {
    if (!gcPath.includes('gemini-cli/packages/')) {
      console.error(
        'ERROR: 无法使用已安装的 gemini 二进制文件构建沙箱；' +
          '在 gemini-cli 仓库下运行 `npm link ./packages/cli` 以切换到链接的二进制文件。',
      );
      process.exit(1);
    } else {
      console.error('正在构建沙箱 ...');
      const gcRoot = gcPath.split('/packages/')[0];
      // 如果项目文件夹在项目设置文件夹下有 sandbox.Dockerfile，则使用它
      let buildArgs = '';
      const projectSandboxDockerfile = path.join(
        SETTINGS_DIRECTORY_NAME,
        'sandbox.Dockerfile',
      );
      if (isCustomProjectSandbox) {
        console.error(`使用 ${projectSandboxDockerfile} 构建沙箱`);
        buildArgs += `-f ${path.resolve(projectSandboxDockerfile)} -i ${image}`;
      }
      execSync(
        `cd ${gcRoot} && node scripts/build_sandbox.js -s ${buildArgs}`,
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            GEMINI_SANDBOX: config.command, // 如果通过标志启用沙箱（参见 cli 包下的 config.ts）
          },
        },
      );
    }
  }

  // 如果镜像缺失则停止
  if (!(await ensureSandboxImageIsPresent(config.command, image))) {
    const remedy =
      image === LOCAL_DEV_SANDBOX_IMAGE_NAME
        ? '尝试在 gemini-cli 仓库下运行 `npm run build:all` 或 `npm run build:sandbox` 以在本地构建，或检查镜像名称和网络连接。'
        : '请检查镜像名称、网络连接，或如果问题持续存在，请通知 gemini-cli-dev@google.com。';
    console.error(
      `ERROR: 沙箱镜像 '${image}' 缺失或无法拉取。${remedy}`,
    );
    process.exit(1);
  }

  // 使用交互模式并在退出时自动删除容器
  // 在容器内运行 init 二进制文件以转发信号并清理僵尸进程
  const args = ['run', '-i', '--rm', '--init', '--workdir', containerWorkdir];

  // 仅当 stdin 是 TTY 时才添加 TTY，即对于管道输入不在容器中初始化 TTY
  if (process.stdin.isTTY) {
    args.push('-t');
  }

  // 将当前目录挂载为沙箱中的工作目录（通过 --workdir 设置）
  args.push('--volume', `${workdir}:${containerWorkdir}`);

  // 在容器内挂载用户设置目录，如果缺失则创建
  // 注意沙箱内的用户/主目录会发生变化，我们在两个路径上都挂载以保持一致性
  const userSettingsDirOnHost = USER_SETTINGS_DIR;
  const userSettingsDirInSandbox = getContainerPath(
    `/home/node/${SETTINGS_DIRECTORY_NAME}`,
  );
  if (!fs.existsSync(userSettingsDirOnHost)) {
    fs.mkdirSync(userSettingsDirOnHost);
  }
  args.push('--volume', `${userSettingsDirOnHost}:${userSettingsDirInSandbox}`);
  if (userSettingsDirInSandbox !== userSettingsDirOnHost) {
    args.push(
      '--volume',
      `${userSettingsDirOnHost}:${getContainerPath(userSettingsDirOnHost)}`,
    );
  }

  // 将 os.tmpdir() 挂载为容器内的 os.tmpdir()
  args.push('--volume', `${os.tmpdir()}:${getContainerPath(os.tmpdir())}`);

  // 如果存在则挂载 gcloud 配置目录
  const gcloudConfigDir = path.join(os.homedir(), '.config', 'gcloud');
  if (fs.existsSync(gcloudConfigDir)) {
    args.push(
      '--volume',
      `${gcloudConfigDir}:${getContainerPath(gcloudConfigDir)}:ro`,
    );
  }

  // 如果设置了 GOOGLE_APPLICATION_CREDENTIALS 则挂载 ADC 文件
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const adcFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (fs.existsSync(adcFile)) {
      args.push('--volume', `${adcFile}:${getContainerPath(adcFile)}:ro`);
      args.push(
        '--env',
        `GOOGLE_APPLICATION_CREDENTIALS=${getContainerPath(adcFile)}`,
      );
    }
  }

  // 挂载 SANDBOX_MOUNTS 中列出的路径
  if (process.env.SANDBOX_MOUNTS) {
    for (let mount of process.env.SANDBOX_MOUNTS.split(',')) {
      if (mount.trim()) {
        // 将挂载解析为 from:to:opts
        let [from, to, opts] = mount.trim().split(':');
        to = to || from; // 默认在容器内挂载到相同路径
        opts = opts || 'ro'; // 默认为只读
        mount = `${from}:${to}:${opts}`;
        // 检查 from 路径是否为绝对路径
        if (!path.isAbsolute(from)) {
          console.error(
            `ERROR: SANDBOX_MOUNTS 中列出的路径 '${from}' 必须是绝对路径`,
          );
          process.exit(1);
        }
        // 检查主机上是否存在 from 路径
        if (!fs.existsSync(from)) {
          console.error(
            `ERROR: SANDBOX_MOUNTS 中缺少挂载路径 '${from}'`,
          );
          process.exit(1);
        }
        console.error(`SANDBOX_MOUNTS: ${from} -> ${to} (${opts})`);
        args.push('--volume', mount);
      }
    }
  }

  // 在沙箱上暴露环境指定的端口
  ports().forEach((p) => args.push('--publish', `${p}:${p}`));

  // 如果设置了 DEBUG，则暴露调试端口
  if (process.env.DEBUG) {
    const debugPort = process.env.DEBUG_PORT || '9229';
    args.push(`--publish`, `${debugPort}:${debugPort}`);
  }

  // 复制代理环境变量，将 localhost 替换为 SANDBOX_PROXY_NAME
  // 复制为大写和小写形式，因为某些工具需要
  // GEMINI_SANDBOX_PROXY_COMMAND 暗示 HTTPS_PROXY 除非设置了 HTTP_PROXY
  const proxyCommand = process.env.GEMINI_SANDBOX_PROXY_COMMAND;

  if (proxyCommand) {
    let proxy =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      'http://localhost:8877';
    proxy = proxy.replace('localhost', SANDBOX_PROXY_NAME);
    if (proxy) {
      args.push('--env', `HTTPS_PROXY=${proxy}`);
      args.push('--env', `https_proxy=${proxy}`); // 小写可能是必需的，例如用于 curl
      args.push('--env', `HTTP_PROXY=${proxy}`);
      args.push('--env', `http_proxy=${proxy}`);
    }
    const noProxy = process.env.NO_PROXY || process.env.no_proxy;
    if (noProxy) {
      args.push('--env', `NO_PROXY=${noProxy}`);
      args.push('--env', `no_proxy=${noProxy}`);
    }

    // 如果使用代理，则通过代理切换到内部网络
    if (proxy) {
      execSync(
        `${config.command} network inspect ${SANDBOX_NETWORK_NAME} || ${config.command} network create --internal ${SANDBOX_NETWORK_NAME}`,
      );
      args.push('--network', SANDBOX_NETWORK_NAME);
      // 如果设置了代理命令，则创建一个具有主机访问权限（即非内部）的独立网络
      // 我们将在连接到主机网络和内部网络的独立容器中运行代理
      // 这使得代理即使在具有主机<->vm<->容器隔离的 macOS 上的 rootless podman 也能工作
      if (proxyCommand) {
        execSync(
          `${config.command} network inspect ${SANDBOX_PROXY_NAME} || ${config.command} network create ${SANDBOX_PROXY_NAME}`,
        );
      }
    }
  }

  // 根据镜像命名容器，并添加数字后缀以避免冲突
  const imageName = parseImageName(image);
  let index = 0;
  const containerNameCheck = execSync(
    `${config.command} ps -a --format "{{.Names}}"`,
  )
    .toString()
    .trim();
  while (containerNameCheck.includes(`${imageName}-${index}`)) {
    index++;
  }
  const containerName = `${imageName}-${index}`;
  args.push('--name', containerName, '--hostname', containerName);

  // 复制 GEMINI_API_KEY(s)
  if (process.env.GEMINI_API_KEY) {
    args.push('--env', `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`);
  }
  if (process.env.GOOGLE_API_KEY) {
    args.push('--env', `GOOGLE_API_KEY=${process.env.GOOGLE_API_KEY}`);
  }

  // 复制 GOOGLE_GENAI_USE_VERTEXAI
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI) {
    args.push(
      '--env',
      `GOOGLE_GENAI_USE_VERTEXAI=${process.env.GOOGLE_GENAI_USE_VERTEXAI}`,
    );
  }

  // 复制 GOOGLE_CLOUD_PROJECT
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_PROJECT=${process.env.GOOGLE_CLOUD_PROJECT}`,
    );
  }

  // 复制 GOOGLE_CLOUD_LOCATION
  if (process.env.GOOGLE_CLOUD_LOCATION) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_LOCATION=${process.env.GOOGLE_CLOUD_LOCATION}`,
    );
  }

  // 复制 GEMINI_MODEL
  if (process.env.GEMINI_MODEL) {
    args.push('--env', `GEMINI_MODEL=${process.env.GEMINI_MODEL}`);
  }

  // 复制 TERM 和 COLORTERM 以尝试保持终端设置
  if (process.env.TERM) {
    args.push('--env', `TERM=${process.env.TERM}`);
  }
  if (process.env.COLORTERM) {
    args.push('--env', `COLORTERM=${process.env.COLORTERM}`);
  }

  // 如果在工作目录下复制 VIRTUAL_ENV
  // 并将 VIRTUAL_ENV 目录挂载替换为 <project_settings>/sandbox.venv
  // 沙箱可以使用 sandbox.bashrc 设置这个新的 VIRTUAL_ENV 目录（见下文）
  // 如果未设置，目录将为空，但这仍然比使用主机二进制文件更可取
  if (
    process.env.VIRTUAL_ENV?.toLowerCase().startsWith(workdir.toLowerCase())
  ) {
    const sandboxVenvPath = path.resolve(
      SETTINGS_DIRECTORY_NAME,
      'sandbox.venv',
    );
    if (!fs.existsSync(sandboxVenvPath)) {
      fs.mkdirSync(sandboxVenvPath, { recursive: true });
    }
    args.push(
      '--volume',
      `${sandboxVenvPath}:${getContainerPath(process.env.VIRTUAL_ENV)}`,
    );
    args.push(
      '--env',
      `VIRTUAL_ENV=${getContainerPath(process.env.VIRTUAL_ENV)}`,
    );
  }

  // 从 SANDBOX_ENV 复制附加环境变量
  if (process.env.SANDBOX_ENV) {
    for (let env of process.env.SANDBOX_ENV.split(',')) {
      if ((env = env.trim())) {
        if (env.includes('=')) {
          console.error(`SANDBOX_ENV: ${env}`);
          args.push('--env', env);
        } else {
          console.error(
            'ERROR: SANDBOX_ENV 必须是逗号分隔的 key=value 对列表',
          );
          process.exit(1);
        }
      }
    }
  }

  // 复制 NODE_OPTIONS
  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const allNodeOptions = [
    ...(existingNodeOptions ? [existingNodeOptions] : []),
    ...nodeArgs,
  ].join(' ');

  if (allNodeOptions.length > 0) {
    args.push('--env', `NODE_OPTIONS="${allNodeOptions}"`);
  }

  // 将 SANDBOX 设置为容器名称
  args.push('--env', `SANDBOX=${containerName}`);

  // 仅针对 podman，使用空的 --authfile 跳过不必要的认证刷新开销
  if (config.command === 'podman') {
    const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
    fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
    args.push('--authfile', emptyAuthFilePath);
  }

  // 确定是否应将当前用户的 UID/GID 传递给沙箱。
  // 有关更多详细信息，请参见 shouldUseCurrentUserInSandbox。
  let userFlag = '';
  const finalEntrypoint = entrypoint(workdir);

  if (process.env.GEMINI_CLI_INTEGRATION_TEST === 'true') {
    args.push('--user', 'root');
    userFlag = '--user root';
  } else if (await shouldUseCurrentUserInSandbox()) {
    // 为了让用户创建逻辑工作，容器必须以 root 身份启动。
    // 入口点脚本随后处理降权到正确的用户。
    args.push('--user', 'root');

    const uid = execSync('id -u').toString().trim();
    const gid = execSync('id -g').toString().trim();

    // 我们不将 --user 传递给主沙箱容器，而是让它
    // 以 root 身份启动，然后创建一个具有主机 UID/GID 的用户，
    // 最后切换到该用户运行 gemini 进程。这在 Linux 上是
    // 必要的，以确保用户存在于容器的 /etc/passwd 文件中，
    // 这是 os.userInfo() 所需要的。
    const username = 'gemini';
    const homeDir = getContainerPath(os.homedir());

    const setupUserCommands = [
      // 使用 -f 与 groupadd 避免组已存在时出错。
      `groupadd -f -g ${gid} ${username}`,
      // 仅在用户不存在时创建用户。使用 -o 用于非唯一 UID。
      `id -u ${username} &>/dev/null || useradd -o -u ${uid} -g ${gid} -d ${homeDir} -s /bin/bash ${username}`,
    ].join(' && ');

    const originalCommand = finalEntrypoint[2];
    const escapedOriginalCommand = originalCommand.replace(/'/g, "'\\''");

    // 使用 `su -p` 保留环境。
    const suCommand = `su -p ${username} -c '${escapedOriginalCommand}'`;

    // 入口点始终是 `['bash', '-c', '<command>']`，所以我们修改命令部分。
    finalEntrypoint[2] = `${setupUserCommands} && ${suCommand}`;

    // 我们仍然需要 userFlag 用于更简单的代理容器，它没有这个问题。
    userFlag = `--user ${uid}:${gid}`;
    // 当在沙箱中强制使用 UID 时，$HOME 可能被重置为 '/'，所以我们也要复制 $HOME。
    args.push('--env', `HOME=${os.homedir()}`);
  }

  // 推送容器镜像名称
  args.push(image);

  // 推送容器入口点（包括参数）
  args.push(...finalEntrypoint);

  // 如果设置了 GEMINI_SANDBOX_PROXY_COMMAND，则启动并设置代理
  let proxyProcess: ChildProcess | undefined = undefined;
  let sandboxProcess: ChildProcess | undefined = undefined;

  if (proxyCommand) {
    // 在独立容器中运行 proxyCommand
    const proxyContainerCommand = `${config.command} run --rm --init ${userFlag} --name ${SANDBOX_PROXY_NAME} --network ${SANDBOX_PROXY_NAME} -p 8877:8877 -v ${process.cwd()}:${workdir} --workdir ${workdir} ${image} ${proxyCommand}`;
    proxyProcess = spawn(proxyContainerCommand, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true,
    });
    // 安装处理程序以在退出/信号时停止代理
    const stopProxy = () => {
      console.log('正在停止代理容器 ...');
      execSync(`${config.command} rm -f ${SANDBOX_PROXY_NAME}`);
    };
    process.on('exit', stopProxy);
    process.on('SIGINT', stopProxy);
    process.on('SIGTERM', stopProxy);

    // 注释掉因为它会干扰 ink 渲染
    // proxyProcess.stdout?.on('data', (data) => {
    //   console.info(data.toString());
    // });
    proxyProcess.stderr?.on('data', (data) => {
      console.error(data.toString().trim());
    });
    proxyProcess.on('close', (code, signal) => {
      console.error(
        `ERROR: 代理容器命令 '${proxyContainerCommand}' 退出，代码 ${code}，信号 ${signal}`,
      );
      if (sandboxProcess?.pid) {
        process.kill(-sandboxProcess.pid, 'SIGTERM');
      }
      process.exit(1);
    });
    console.log('等待代理启动 ...');
    await execAsync(
      `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
    );
    // 将代理容器连接到沙箱网络
    // （解决不支持多个 --network 参数的旧版 docker 的问题）
    await execAsync(
      `${config.command} network connect ${SANDBOX_NETWORK_NAME} ${SANDBOX_PROXY_NAME}`,
    );
  }

  // 生成子进程并让它继承 stdio
  sandboxProcess = spawn(config.command, args, {
    stdio: 'inherit',
  });

  sandboxProcess.on('error', (err) => {
    console.error('沙箱进程错误:', err);
  });

  await new Promise<void>((resolve) => {
    sandboxProcess?.on('close', (code, signal) => {
      if (code !== 0) {
        console.log(
          `沙箱进程退出，代码: ${code}，信号: ${signal}`,
        );
      }
      resolve();
    });
  });
}

// 确保沙箱镜像存在的辅助函数
async function imageExists(sandbox: string, image: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ['images', '-q', image];
    const checkProcess = spawn(sandbox, args);

    let stdoutData = '';
    if (checkProcess.stdout) {
      checkProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
    }

    checkProcess.on('error', (err) => {
      console.warn(
        `无法启动 '${sandbox}' 命令进行镜像检查: ${err.message}`,
      );
      resolve(false);
    });

    checkProcess.on('close', (code) => {
      // 非零代码可能表示 docker 守护进程未运行等。
      // 主要成功指标是非空的 stdoutData。
      if (code !== 0) {
        // console.warn(`'${sandbox} images -q ${image}' 退出，代码 ${code}。`);
      }
      resolve(stdoutData.trim() !== '');
    });
  });
}

async function pullImage(sandbox: string, image: string): Promise<boolean> {
  console.info(`尝试使用 ${sandbox} 拉取镜像 ${image}...`);
  return new Promise((resolve) => {
    const args = ['pull', image];
    const pullProcess = spawn(sandbox, args, { stdio: 'pipe' });

    let stderrData = '';

    const onStdoutData = (data: Buffer) => {
      console.info(data.toString().trim()); // 显示拉取进度
    };

    const onStderrData = (data: Buffer) => {
      stderrData += data.toString();
      console.error(data.toString().trim()); // 显示命令本身的拉取错误/信息
    };

    const onError = (err: Error) => {
      console.warn(
        `无法启动 '${sandbox} pull ${image}' 命令: ${err.message}`,
      );
      cleanup();
      resolve(false);
    };

    const onClose = (code: number | null) => {
      if (code === 0) {
        console.info(`成功拉取镜像 ${image}。`);
        cleanup();
        resolve(true);
      } else {
        console.warn(
          `无法拉取镜像 ${image}。'${sandbox} pull ${image}' 退出，代码 ${code}。`,
        );
        if (stderrData.trim()) {
          // 详细信息已由上面的 stderr 监听器打印
        }
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      if (pullProcess.stdout) {
        pullProcess.stdout.removeListener('data', onStdoutData);
      }
      if (pullProcess.stderr) {
        pullProcess.stderr.removeListener('data', onStderrData);
      }
      pullProcess.removeListener('error', onError);
      pullProcess.removeListener('close', onClose);
      if (pullProcess.connected) {
        pullProcess.disconnect();
      }
    };

    if (pullProcess.stdout) {
      pullProcess.stdout.on('data', onStdoutData);
    }
    if (pullProcess.stderr) {
      pullProcess.stderr.on('data', onStderrData);
    }
    pullProcess.on('error', onError);
    pullProcess.on('close', onClose);
  });
}

async function ensureSandboxImageIsPresent(
  sandbox: string,
  image: string,
): Promise<boolean> {
  console.info(`检查沙箱镜像: ${image}`);
  if (await imageExists(sandbox, image)) {
    console.info(`在本地找到沙箱镜像 ${image}。`);
    return true;
  }

  console.info(`在本地未找到沙箱镜像 ${image}。`);
  if (image === LOCAL_DEV_SANDBOX_IMAGE_NAME) {
    // 用户需要自己构建镜像
    return false;
  }

  if (await pullImage(sandbox, image)) {
    // 尝试拉取后再次检查以确保
    if (await imageExists(sandbox, image)) {
      console.info(`拉取后沙箱镜像 ${image} 现在可用。`);
      return true;
    } else {
      console.warn(
        `拉取尝试后沙箱镜像 ${image} 仍然未找到。这可能表明镜像名称或注册表存在问题，或者拉取命令报告成功但未能使镜像可用。`,
      );
      return false;
    }
  }

  console.error(
    `检查和拉取尝试后无法获取沙箱镜像 ${image}。`,
  );
  return false; // 拉取命令失败或镜像仍然不存在
}