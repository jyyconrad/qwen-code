/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'os';
import * as crypto from 'crypto';

export const GEMINI_DIR = '.iflycode';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
const TMP_DIR_NAME = 'tmp';

/**
 * 将主目录替换为波浪号。
 * @param path - 要替换的路径。
 * @returns 替换后的路径。
 */
export function tildeifyPath(path: string): string {
  const homeDir = os.homedir();
  if (path.startsWith(homeDir)) {
    return path.replace(homeDir, '~');
  }
  return path;
}

/**
 * 如果路径字符串超过 maxLen，则缩短它，优先保留开始和结束部分。
 * 示例：/path/to/a/very/long/file.txt -> /path/.../long/file.txt
 */
export function shortenPath(filePath: string, maxLen: number = 35): string {
  if (filePath.length <= maxLen) {
    return filePath;
  }

  const parsedPath = path.parse(filePath);
  const root = parsedPath.root;
  const separator = path.sep;

  // 获取根目录*之后*的路径段
  const relativePath = filePath.substring(root.length);
  const segments = relativePath.split(separator).filter((s) => s !== ''); // 过滤掉空段

  // 处理根目录后没有段（例如 "/", "C:\"）或只有一个段的情况
  if (segments.length <= 1) {
    // 对于非常短的路径或单个段，回退到简单的开始/结束截断
    const keepLen = Math.floor((maxLen - 3) / 2);
    // 确保 keepLen 不为负数（如果 maxLen 非常小）
    if (keepLen <= 0) {
      return filePath.substring(0, maxLen - 3) + '...';
    }
    const start = filePath.substring(0, keepLen);
    const end = filePath.substring(filePath.length - keepLen);
    return `${start}...${end}`;
  }

  const firstDir = segments[0];
  const lastSegment = segments[segments.length - 1];
  const startComponent = root + firstDir;

  const endPartSegments: string[] = [];
  // 基础长度：分隔符 + "..." + 最后一个目录
  let currentLength = separator.length + lastSegment.length;

  // 反向遍历段（不包括第一个）
  for (let i = segments.length - 2; i >= 0; i--) {
    const segment = segments[i];
    // 如果添加此段所需的长度：当前长度 + 分隔符 + 段长度
    const lengthWithSegment = currentLength + separator.length + segment.length;

    if (lengthWithSegment <= maxLen) {
      endPartSegments.unshift(segment); // 添加到结束部分的开头
      currentLength = lengthWithSegment;
    } else {
      break;
    }
  }

  let result = endPartSegments.join(separator) + separator + lastSegment;

  if (currentLength > maxLen) {
    return result;
  }

  // 构造最终路径
  result = startComponent + separator + result;

  // 最终检查，如果结果仍然太长
  // 从开头截断结果字符串，并加上前缀 "..."。
  if (result.length > maxLen) {
    return '...' + result.substring(result.length - maxLen - 3);
  }

  return result;
}

/**
 * 计算从根目录到目标路径的相对路径。
 * 确保在计算前解析两个路径。
 * 如果目标路径与根目录相同，则返回 '.'。
 *
 * @param targetPath 目标路径（绝对或相对）。
 * @param rootDirectory 根目录的绝对路径。
 * @returns 从 rootDirectory 到 targetPath 的相对路径。
 */
export function makeRelative(
  targetPath: string,
  rootDirectory: string,
): string {
  const resolvedTargetPath = path.resolve(targetPath);
  const resolvedRootDirectory = path.resolve(rootDirectory);

  const relativePath = path.relative(resolvedRootDirectory, resolvedTargetPath);

  // 如果路径相同，path.relative 返回 ''，此时返回 '.' 
  return relativePath || '.';
}

/**
 * 转义文件路径中的空格。
 */
export function escapePath(filePath: string): string {
  let result = '';
  for (let i = 0; i < filePath.length; i++) {
    // 只转义尚未转义的空格。
    if (filePath[i] === ' ' && (i === 0 || filePath[i - 1] !== '\\')) {
      result += '\\ ';
    } else {
      result += filePath[i];
    }
  }
  return result;
}

/**
 * 取消转义文件路径中的空格。
 */
export function unescapePath(filePath: string): string {
  return filePath.replace(/\\ /g, ' ');
}

/**
 * 基于项目根路径生成项目的唯一哈希值。
 * @param projectRoot 项目根目录的绝对路径。
 * @returns 项目根路径的 SHA256 哈希值。
 */
export function getProjectHash(projectRoot: string): string {
  return crypto.createHash('sha256').update(projectRoot).digest('hex');
}

/**
 * 为项目生成唯一的临时目录路径。
 * @param projectRoot 项目根目录的绝对路径。
 * @returns 项目临时目录的路径。
 */
export function getProjectTempDir(projectRoot: string): string {
  const hash = getProjectHash(projectRoot);
  return path.join(os.homedir(), GEMINI_DIR, TMP_DIR_NAME, hash);
}