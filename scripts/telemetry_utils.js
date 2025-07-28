#!/usr/bin/env node

/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';
import net from 'net';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const projectHash = crypto
  .createHash('sha256')
  .update(projectRoot)
  .digest('hex');

// 用户级 .gemini 目录位于 home 中
const USER_GEMINI_DIR = path.join(os.homedir(), '.iflycode');
// 项目级 .gemini 目录位于工作区中
const WORKSPACE_GEMINI_DIR = path.join(projectRoot, '.iflycode');

// 遥测工件存储在用户 ~/.iflycode/tmp 下的哈希目录中
export const OTEL_DIR = path.join(USER_GEMINI_DIR, 'tmp', projectHash, 'otel');
export const BIN_DIR = path.join(OTEL_DIR, 'bin');

// 工作区设置保留在项目的 .gemini 目录中
export const WORKSPACE_SETTINGS_FILE = path.join(
  WORKSPACE_GEMINI_DIR,
  'settings.json',
);

export function getJson(url) {
  const tmpFile = path.join(
    os.tmpdir(),
    `gemini-cli-releases-${Date.now()}.json`,
  );
  try {
    execSync(
      `curl -sL -H "User-Agent: gemini-cli-dev-script" -o "${tmpFile}" "${url}"`,
      { stdio: 'pipe' },
    );
    const content = fs.readFileSync(tmpFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`无法从 ${url} 获取或解析 JSON`);
    throw e;
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

export function downloadFile(url, dest) {
  try {
    execSync(`curl -fL -sS -o "${dest}" "${url}"`, {
      stdio: 'pipe',
    });
    return dest;
  } catch (e) {
    console.error(`无法从 ${url} 下载文件`);
    throw e;
  }
}

export function findFile(startPath, filter) {
  if (!fs.existsSync(startPath)) {
    return null;
  }
  const files = fs.readdirSync(startPath);
  for (const file of files) {
    const filename = path.join(startPath, file);
    const stat = fs.lstatSync(filename);
    if (stat.isDirectory()) {
      const result = findFile(filename, filter);
      if (result) return result;
    } else if (filter(file)) {
      return filename;
    }
  }
  return null;
}

export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

export function readJsonFile(filePath) {
  if (!fileExists(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error(`解析 ${filePath} 中的 JSON 出错: ${e.message}`);
    return {};
  }
}

export function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function waitForPort(port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', (_) => {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`等待端口 ${port} 打开超时。`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.connect(port, 'localhost');
    };
    tryConnect();
  });
}

export async function ensureBinary(
  executableName,
  repo,
  assetNameCallback,
  binaryNameInArchive,
  isJaeger = false,
) {
  const executablePath = path.join(BIN_DIR, executableName);
  if (fileExists(executablePath)) {
    console.log(`✅ ${executableName} 已存在于 ${executablePath}`);
    return executablePath;
  }

  console.log(`🔍 未找到 ${executableName}。正在从 ${repo} 下载...`);

  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const ext = platform === 'windows' ? 'zip' : 'tar.gz';

  if (isJaeger && platform === 'windows' && arch === 'arm64') {
    console.warn(
      `⚠️ Jaeger 没有 Windows ARM64 版本的发布。跳过。`,
    );
    return null;
  }

  let release;
  let asset;

  if (isJaeger) {
    console.log(`🔍 正在查找最新的 Jaeger v2+ 资产...`);
    const releases = getJson(`https://api.github.com/repos/${repo}/releases`);
    const sortedReleases = releases
      .filter((r) => !r.prerelease && r.tag_name.startsWith('v'))
      .sort((a, b) => {
        const aVersion = a.tag_name.substring(1).split('.').map(Number);
        const bVersion = b.tag_name.substring(1).split('.').map(Number);
        for (let i = 0; i < Math.max(aVersion.length, bVersion.length); i++) {
          if ((aVersion[i] || 0) > (bVersion[i] || 0)) return -1;
          if ((aVersion[i] || 0) < (bVersion[i] || 0)) return 1;
        }
        return 0;
      });

    for (const r of sortedReleases) {
      const expectedSuffix =
        platform === 'windows'
          ? `-${platform}-${arch}.zip`
          : `-${platform}-${arch}.tar.gz`;
      const foundAsset = r.assets.find(
        (a) =>
          a.name.startsWith('jaeger-2.') && a.name.endsWith(expectedSuffix),
      );

      if (foundAsset) {
        release = r;
        asset = foundAsset;
        console.log(
          `⬇️  在发布版本 ${r.tag_name} 中找到 ${asset.name}，正在下载...`,
        );
        break;
      }
    }
    if (!asset) {
      throw new Error(
        `无法为平台 ${platform}/${arch} 找到合适的 Jaeger v2 资产。`,
      );
    }
  } else {
    release = getJson(`https://api.github.com/repos/${repo}/releases/latest`);
    const version = release.tag_name.startsWith('v')
      ? release.tag_name.substring(1)
      : release.tag_name;
    const assetName = assetNameCallback(version, platform, arch, ext);
    asset = release.assets.find((a) => a.name === assetName);
    if (!asset) {
      throw new Error(
        `无法为 ${repo} (版本 ${version}) 在平台 ${platform}/${arch} 上找到合适的资产。搜索内容: ${assetName}`,
      );
    }
  }

  const downloadUrl = asset.browser_download_url;
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gemini-cli-telemetry-'),
  );
  const archivePath = path.join(tmpDir, asset.name);

  try {
    console.log(`⬇️  正在下载 ${asset.name}...`);
    downloadFile(downloadUrl, archivePath);
    console.log(`📦 正在解压 ${asset.name}...`);

    const actualExt = asset.name.endsWith('.zip') ? 'zip' : 'tar.gz';

    if (actualExt === 'zip') {
      execSync(`unzip -o "${archivePath}" -d "${tmpDir}"`, { stdio: 'pipe' });
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: 'pipe' });
    }

    const nameToFind = binaryNameInArchive || executableName;
    const foundBinaryPath = findFile(tmpDir, (file) => {
      if (platform === 'windows') {
        return file === `${nameToFind}.exe`;
      }
      return file === nameToFind;
    });

    if (!foundBinaryPath) {
      throw new Error(
        `在解压的归档文件 ${tmpDir} 中找不到二进制文件 "${nameToFind}"。内容: ${fs.readdirSync(tmpDir).join(', ')}`,
      );
    }

    fs.renameSync(foundBinaryPath, executablePath);

    if (platform !== 'windows') {
      fs.chmodSync(executablePath, '755');
    }

    console.log(`✅ ${executableName} 已安装到 ${executablePath}`);
    return executablePath;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
  }
}

export function manageTelemetrySettings(
  enable,
  oTelEndpoint = 'http://localhost:4317',
  target = 'local',
  originalSandboxSettingToRestore,
) {
  const workspaceSettings = readJsonFile(WORKSPACE_SETTINGS_FILE);
  const currentSandboxSetting = workspaceSettings.sandbox;
  let settingsModified = false;

  if (typeof workspaceSettings.telemetry !== 'object') {
    workspaceSettings.telemetry = {};
  }

  if (enable) {
    if (workspaceSettings.telemetry.enabled !== true) {
      workspaceSettings.telemetry.enabled = true;
      settingsModified = true;
      console.log('⚙️  在工作区设置中启用遥测。');
    }
    if (workspaceSettings.sandbox !== false) {
      workspaceSettings.sandbox = false;
      settingsModified = true;
      console.log('✅ 为遥测禁用沙箱模式。');
    }
    if (workspaceSettings.telemetry.otlpEndpoint !== oTelEndpoint) {
      workspaceSettings.telemetry.otlpEndpoint = oTelEndpoint;
      settingsModified = true;
      console.log(`🔧 将遥测 OTLP 端点设置为 ${oTelEndpoint}。`);
    }
    if (workspaceSettings.telemetry.target !== target) {
      workspaceSettings.telemetry.target = target;
      settingsModified = true;
      console.log(`🎯 将遥测目标设置为 ${target}。`);
    }
  } else {
    if (workspaceSettings.telemetry.enabled === true) {
      delete workspaceSettings.telemetry.enabled;
      settingsModified = true;
      console.log('⚙️  在工作区设置中禁用遥测。');
    }
    if (workspaceSettings.telemetry.otlpEndpoint) {
      delete workspaceSettings.telemetry.otlpEndpoint;
      settingsModified = true;
      console.log('🔧 清除遥测 OTLP 端点。');
    }
    if (workspaceSettings.telemetry.target) {
      delete workspaceSettings.telemetry.target;
      settingsModified = true;
      console.log('🎯 清除遥测目标。');
    }
    if (Object.keys(workspaceSettings.telemetry).length === 0) {
      delete workspaceSettings.telemetry;
    }

    if (
      originalSandboxSettingToRestore !== undefined &&
      workspaceSettings.sandbox !== originalSandboxSettingToRestore
    ) {
      workspaceSettings.sandbox = originalSandboxSettingToRestore;
      settingsModified = true;
      console.log('✅ 恢复原始沙箱设置。');
    }
  }

  if (settingsModified) {
    writeJsonFile(WORKSPACE_SETTINGS_FILE, workspaceSettings);
    console.log('✅ 工作区设置已更新。');
  } else {
    console.log(
      enable
        ? '✅ 工作区设置已为遥测配置完成。'
        : '✅ 工作区设置已反映遥测已禁用。',
    );
  }
  return currentSandboxSetting;
}

export function registerCleanup(
  getProcesses,
  getLogFileDescriptors,
  originalSandboxSetting,
) {
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    console.log('\n👋 正在关闭...');

    manageTelemetrySettings(false, null, originalSandboxSetting);

    const processes = getProcesses ? getProcesses() : [];
    processes.forEach((proc) => {
      if (proc && proc.pid) {
        const name = path.basename(proc.spawnfile);
        try {
          console.log(`🛑 正在停止 ${name} (PID: ${proc.pid})...`);
          process.kill(proc.pid, 'SIGTERM');
          console.log(`✅ ${name} 已停止。`);
        } catch (e) {
          if (e.code !== 'ESRCH') {
            console.error(`停止 ${name} 出错: ${e.message}`);
          }
        }
      }
    });

    const logFileDescriptors = getLogFileDescriptors
      ? getLogFileDescriptors()
      : [];
    logFileDescriptors.forEach((fd) => {
      if (fd) {
        try {
          fs.closeSync(fd);
        } catch (_) {
          /* 无操作 */
        }
      }
    });
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
    cleanup();
    process.exit(1);
  });
}