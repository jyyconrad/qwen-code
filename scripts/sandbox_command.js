/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// 根据 Apache 许可证 2.0 版（“许可证”）获得许可；
// 除非符合许可证要求，否则您不得使用此文件。
// 您可以在以下位置获取许可证副本：
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// 除非适用法律要求或书面同意，否则根据许可证分发的软件
// 是基于“按原样”分发的，不附带任何明示或暗示的担保。
// 请参阅许可证以了解特定语言的管理权限和限制。

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import stripJsonComments from 'strip-json-comments';
import os from 'os';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';

const argv = yargs(hideBin(process.argv)).option('q', {
  alias: 'quiet',
  type: 'boolean',
  default: false,
}).argv;

let geminiSandbox = process.env.GEMINI_SANDBOX;

if (!geminiSandbox) {
  const userSettingsFile = join(os.homedir(), '.iflycode', 'settings.json');
  if (existsSync(userSettingsFile)) {
    const settings = JSON.parse(
      stripJsonComments(readFileSync(userSettingsFile, 'utf-8')),
    );
    if (settings.sandbox) {
      geminiSandbox = settings.sandbox;
    }
  }
}

if (!geminiSandbox) {
  let currentDir = process.cwd();
  while (true) {
    const geminiEnv = join(currentDir, '.iflycode', '.env');
    const regularEnv = join(currentDir, '.env');
    if (existsSync(geminiEnv)) {
      dotenv.config({ path: geminiEnv, quiet: true });
      break;
    } else if (existsSync(regularEnv)) {
      dotenv.config({ path: regularEnv, quiet: true });
      break;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  geminiSandbox = process.env.GEMINI_SANDBOX;
}

geminiSandbox = (geminiSandbox || '').toLowerCase();

const commandExists = (cmd) => {
  const checkCommand = os.platform() === 'win32' ? 'where' : 'command -v';
  try {
    execSync(`${checkCommand} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    if (os.platform() === 'win32') {
      try {
        execSync(`${checkCommand} ${cmd}.exe`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
};

let command = '';
if (['1', 'true'].includes(geminiSandbox)) {
  if (commandExists('docker')) {
    command = 'docker';
  } else if (commandExists('podman')) {
    command = 'podman';
  } else {
    console.error(
      '错误：请安装 docker 或 podman，或在 GEMINI_SANDBOX 中指定命令',
    );
    process.exit(1);
  }
} else if (geminiSandbox && !['0', 'false'].includes(geminiSandbox)) {
  if (commandExists(geminiSandbox)) {
    command = geminiSandbox;
  } else {
    console.error(
      `错误：缺少沙箱命令 '${geminiSandbox}'（来自 GEMINI_SANDBOX）`,
    );
    process.exit(1);
  }
} else {
  if (os.platform() === 'darwin' && process.env.SEATBELT_PROFILE !== 'none') {
    if (commandExists('sandbox-exec')) {
      command = 'sandbox-exec';
    } else {
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
}

if (!argv.q) {
  console.log(command);
}
process.exit(0);