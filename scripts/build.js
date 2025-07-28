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
// 除非适用法律要求或书面同意，否则根据许可证分发的软件
// 是基于“按原样”分发的，不附带任何明示或暗示的担保。
// 请参阅许可证以了解特定语言的管理权限和限制。

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// 如果 node_modules 被删除（例如通过 npm run clean 或 scripts/clean.js），则执行 npm install
if (!existsSync(join(root, 'node_modules'))) {
  execSync('npm install', { stdio: 'inherit', cwd: root });
}

// 构建所有工作区/包
execSync('npm run generate', { stdio: 'inherit', cwd: root });
execSync('npm run build --workspaces', { stdio: 'inherit', cwd: root });

// 如果启用了沙箱，也构建容器镜像
// 跳过 (-s) npm install + build，因为我们已经在上面执行过了
try {
  execSync('node scripts/sandbox_command.js -q', {
    stdio: 'inherit',
    cwd: root,
  });
  if (
    process.env.BUILD_SANDBOX === '1' ||
    process.env.BUILD_SANDBOX === 'true'
  ) {
    execSync('node scripts/build_sandbox.js -s', {
      stdio: 'inherit',
      cwd: root,
    });
  }
} catch {
  // 忽略
}