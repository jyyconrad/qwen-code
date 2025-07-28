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
// 是按“原样”分发的，不附带任何明示或暗示的担保。
// 请参阅许可证以了解特定语言的管理权限和限制。

import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

// 检查构建状态，将警告写入文件以便应用程序在需要时显示
execSync('node ./scripts/check-build-status.js', {
  stdio: 'inherit',
  cwd: root,
});

const nodeArgs = [];
let sandboxCommand = undefined;
try {
  sandboxCommand = execSync('node scripts/sandbox_command.js', {
    cwd: root,
  })
    .toString()
    .trim();
} catch {
  // 忽略
}
// 如果启用了调试且禁用了沙箱，则使用 --inspect-brk 标志
// 注意：使用沙箱时，此标志会传递给沙箱内的二进制文件
// 在沙箱内应设置 SANDBOX，sandbox_command.js 应该失败
if (process.env.DEBUG && !sandboxCommand) {
  if (process.env.SANDBOX) {
    const port = process.env.DEBUG_PORT || '9229';
    nodeArgs.push(`--inspect-brk=0.0.0.0:${port}`);
  } else {
    nodeArgs.push('--inspect-brk');
  }
}

nodeArgs.push('./packages/cli');
nodeArgs.push(...process.argv.slice(2));

const env = {
  ...process.env,
  CLI_VERSION: pkg.version,
  DEV: 'true',
};

if (process.env.DEBUG) {
  // 如果未设置此选项，调试器将暂停外部进程而不是重新启动的进程，
  // 这会使调试变得更加困难。
  env.GEMINI_CLI_NO_RELAUNCH = 'true';
}
const child = spawn('node', nodeArgs, { stdio: 'inherit', env });

child.on('close', (code) => {
  process.exit(code);
});