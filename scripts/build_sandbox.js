/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// 根据 Apache 许可证 2.0 版（“许可证”）获得许可；
// 除非符合许可证要求，否则您不得使用此文件。
// 您可以获得许可证的副本在以下网址：
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// 除非适用法律要求或书面同意，根据许可证分发的软件
// 是基于“按原样”分发的，不附带任何明示或暗示的担保。
// 请参阅许可证了解具体的语言管理权限和限制。

import { execSync } from 'child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import cliPkgJson from '../packages/cli/package.json' with { type: 'json' };

const argv = yargs(hideBin(process.argv))
  .option('s', {
    alias: 'skip-npm-install-build',
    type: 'boolean',
    default: false,
    description: '跳过 npm install + npm run build',
  })
  .option('f', {
    alias: 'dockerfile',
    type: 'string',
    description: '使用 <dockerfile> 构建自定义镜像',
  })
  .option('i', {
    alias: 'image',
    type: 'string',
    description: '使用 <image> 名称构建自定义镜像',
  }).argv;

let sandboxCommand;
try {
  sandboxCommand = execSync('node scripts/sandbox_command.js')
    .toString()
    .trim();
} catch {
  console.warn('错误：无法检测到沙箱容器命令');
  process.exit(0);
}

if (sandboxCommand === 'sandbox-exec') {
  console.warn(
    '警告：基于容器的沙箱已禁用（请参阅 README.md#sandboxing）',
  );
  process.exit(0);
}

console.log(`使用 ${sandboxCommand} 进行沙箱处理`);

const baseImage = cliPkgJson.config.sandboxImageUri;
const customImage = argv.i;
const baseDockerfile = 'Dockerfile';
const customDockerfile = argv.f;

if (!baseImage?.length) {
  console.warn(
    'gemini-cli/packages/cli/package.json 中未指定默认镜像标签',
  );
}

if (!argv.s) {
  execSync('npm install', { stdio: 'inherit' });
  execSync('npm run build --workspaces', { stdio: 'inherit' });
}

console.log('正在打包 @google/gemini-cli ...');
const cliPackageDir = join('packages', 'cli');
rmSync(join(cliPackageDir, 'dist', 'google-gemini-cli-*.tgz'), { force: true });
execSync(
  `npm pack -w @google/gemini-cli --pack-destination ./packages/cli/dist`,
  {
    stdio: 'ignore',
  },
);

console.log('正在打包 @google/gemini-cli-core ...');
const corePackageDir = join('packages', 'core');
rmSync(join(corePackageDir, 'dist', 'google-gemini-cli-core-*.tgz'), {
  force: true,
});
execSync(
  `npm pack -w @google/gemini-cli-core --pack-destination ./packages/core/dist`,
  { stdio: 'ignore' },
);

const packageVersion = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
).version;

chmodSync(
  join(cliPackageDir, 'dist', `google-gemini-cli-${packageVersion}.tgz`),
  0o755,
);
chmodSync(
  join(corePackageDir, 'dist', `google-gemini-cli-core-${packageVersion}.tgz`),
  0o755,
);

const buildStdout = process.env.VERBOSE ? 'inherit' : 'ignore';

function buildImage(imageName, dockerfile) {
  console.log(`正在构建 ${imageName} ...（首次可能较慢）`);
  const buildCommand =
    sandboxCommand === 'podman'
      ? `${sandboxCommand} build --authfile=<(echo '{}')`
      : `${sandboxCommand} build`;

  const npmPackageVersion = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
  ).version;

  const imageTag =
    process.env.GEMINI_SANDBOX_IMAGE_TAG || imageName.split(':')[1];
  const finalImageName = `${imageName.split(':')[0]}:${imageTag}`;

  execSync(
    `${buildCommand} ${
      process.env.BUILD_SANDBOX_FLAGS || ''
    } --build-arg CLI_VERSION_ARG=${npmPackageVersion} -f "${dockerfile}" -t "${finalImageName}" .`,
    { stdio: buildStdout, shell: '/bin/bash' },
  );
  console.log(`已构建 ${finalImageName}`);
  if (existsSync('/workspace/final_image_uri.txt')) {
    // 发布步骤仅支持一个镜像。如果我们构建多个镜像，只有最后一个会被发布。
    // 抛出错误以明确此失败。
    throw new Error(
      'CI 工件文件 /workspace/final_image_uri.txt 已存在。拒绝覆盖。',
    );
  }
  writeFileSync('/workspace/final_image_uri.txt', finalImageName);
}

if (baseImage && baseDockerfile) {
  buildImage(baseImage, baseDockerfile);
}

if (customDockerfile && customImage) {
  buildImage(customImage, customDockerfile);
}

execSync(`${sandboxCommand} image prune -f`, { stdio: 'ignore' });