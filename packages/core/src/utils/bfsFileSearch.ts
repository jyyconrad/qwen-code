/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Dirent } from 'fs';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

// 简单的控制台记录器。
// TODO: 集成更强大的服务器端记录器。
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG] [BfsFileSearch]', ...args),
};

interface BfsFileSearchOptions {
  fileName: string;
  ignoreDirs?: string[];
  maxDirs?: number;
  debug?: boolean;
  fileService?: FileDiscoveryService;
}

/**
 * 在目录结构中对特定文件执行广度优先搜索。
 *
 * @param rootDir 开始搜索的目录。
 * @param options 搜索的配置。
 * @returns 解析为找到文件的路径数组的 Promise。
 */
export async function bfsFileSearch(
  rootDir: string,
  options: BfsFileSearchOptions,
): Promise<string[]> {
  const {
    fileName,
    ignoreDirs = [],
    maxDirs = Infinity,
    debug = false,
    fileService,
  } = options;
  const foundFiles: string[] = [];
  const queue: string[] = [rootDir];
  const visited = new Set<string>();
  let scannedDirCount = 0;

  while (queue.length > 0 && scannedDirCount < maxDirs) {
    const currentDir = queue.shift()!;
    if (visited.has(currentDir)) {
      continue;
    }
    visited.add(currentDir);
    scannedDirCount++;

    if (debug) {
      logger.debug(`扫描中 [${scannedDirCount}/${maxDirs}]: ${currentDir}`);
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      // 忽略无法读取的目录错误（例如，权限问题）
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (fileService?.shouldGitIgnoreFile(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!ignoreDirs.includes(entry.name)) {
          queue.push(fullPath);
        }
      } else if (entry.isFile() && entry.name === fileName) {
        foundFiles.push(fullPath);
      }
    }
  }

  return foundFiles;
}