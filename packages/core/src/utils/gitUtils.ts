/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 检查目录是否在 Git 仓库中
 * @param directory 要检查的目录
 * @returns 如果目录在 Git 仓库中则返回 true，否则返回 false
 */
export function isGitRepository(directory: string): boolean {
  try {
    let currentDir = path.resolve(directory);

    while (true) {
      const gitDir = path.join(currentDir, '.git');

      // 检查 .git 是否存在（可能是目录或文件（适用于工作树））
      if (fs.existsSync(gitDir)) {
        return true;
      }

      const parentDir = path.dirname(currentDir);

      // 如果已到达根目录，则停止搜索
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }

    return false;
  } catch (_error) {
    // 如果发生任何文件系统错误，则假定不是 Git 仓库
    return false;
  }
}

/**
 * 查找 Git 仓库的根目录
 * @param directory 开始搜索的目录
 * @returns Git 仓库根路径，如果不在 Git 仓库中则返回 null
 */
export function findGitRoot(directory: string): string | null {
  try {
    let currentDir = path.resolve(directory);

    while (true) {
      const gitDir = path.join(currentDir, '.git');

      if (fs.existsSync(gitDir)) {
        return currentDir;
      }

      const parentDir = path.dirname(currentDir);

      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }

    return null;
  } catch (_error) {
    return null;
  }
}