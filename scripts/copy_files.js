#!/usr/bin/env node

/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 版权所有 2025 Google LLC
//
// 根据 Apache 许可证 2.0 版（“许可证”）获得许可；
// 除非符合许可证要求，否则您不得使用此文件。
// 您可以在以下位置获得许可证副本：
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// 除非适用法律要求或书面同意，否则根据许可证分发的软件
// 是按“原样”分发的，不附带任何明示或暗示的担保或条件。
// 请参阅许可证了解特定语言的管理权限和限制。

import fs from 'fs';
import path from 'path';

const sourceDir = path.join('src');
const targetDir = path.join('dist', 'src');

const extensionsToCopy = ['.md', '.json', '.sb'];

function copyFilesRecursive(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const items = fs.readdirSync(source, { withFileTypes: true });

  for (const item of items) {
    const sourcePath = path.join(source, item.name);
    const targetPath = path.join(target, item.name);

    if (item.isDirectory()) {
      copyFilesRecursive(sourcePath, targetPath);
    } else if (extensionsToCopy.includes(path.extname(item.name))) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

if (!fs.existsSync(sourceDir)) {
  console.error(`未找到源目录 ${sourceDir}。`);
  process.exit(1);
}

copyFilesRecursive(sourceDir, targetDir);
console.log('文件复制成功。');