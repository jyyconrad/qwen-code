/**
 * @license
 * Copyright 2025 Google LLC
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
// 是基于“按原样”分发的，不附带任何明示或暗示的担保或条件。
// 请参阅许可证了解特定语言的管理权限和限制。

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

if (!process.cwd().includes('packages')) {
  console.error('必须从包目录调用');
  process.exit(1);
}

// 构建 typescript 文件
execSync('tsc --build', { stdio: 'inherit' });

// 复制 .{md,json} 文件
execSync('node ../../scripts/copy_files.js', { stdio: 'inherit' });

// 创建 dist/.last_build 文件
writeFileSync(join(process.cwd(), 'dist', '.last_build'), '');
process.exit(0);