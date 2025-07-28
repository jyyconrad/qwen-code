/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 模块中 __dirname 的等价写法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');

function copyFiles(packageName, filesToCopy) {
  const packageDir = path.resolve(rootDir, 'packages', packageName);
  if (!fs.existsSync(packageDir)) {
    console.error(`错误：未在 ${packageDir} 找到包目录`);
    process.exit(1);
  }

  console.log(`正在准备包：${packageName}`);
  for (const [source, dest] of Object.entries(filesToCopy)) {
    const sourcePath = path.resolve(rootDir, source);
    const destPath = path.resolve(packageDir, dest);
    try {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`已复制 ${source} 到 packages/${packageName}/`);
    } catch (err) {
      console.error(`复制 ${source} 时出错：`, err);
      process.exit(1);
    }
  }
}

// 准备 'core' 包
copyFiles('core', {
  'README.md': 'README.md',
  LICENSE: 'LICENSE',
  '.npmrc': '.npmrc',
});

// 准备 'cli' 包
copyFiles('cli', {
  'README.md': 'README.md',
  LICENSE: 'LICENSE',
});

console.log('所有包均已成功准备。');