/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// 用于导入处理的简单控制台记录器
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    console.debug('[DEBUG] [ImportProcessor]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN] [ImportProcessor]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) =>
    console.error('[ERROR] [ImportProcessor]', ...args),
};

/**
 * 用于跟踪导入处理状态以防止循环导入的接口
 */
interface ImportState {
  processedFiles: Set<string>;
  maxDepth: number;
  currentDepth: number;
  currentFile?: string; // 跟踪当前正在处理的文件
}

/**
 * 处理 GEMINI.md 内容中的导入语句
 * 支持 @path/to/file.md 语法从其他文件导入内容
 *
 * @param content - 要处理导入的内容
 * @param basePath - 当前文件所在的目录路径
 * @param debugMode - 是否启用调试日志
 * @param importState - 循环导入预防的状态跟踪
 * @returns 处理后解析了导入的内容
 */
export async function processImports(
  content: string,
  basePath: string,
  debugMode: boolean = false,
  importState: ImportState = {
    processedFiles: new Set(),
    maxDepth: 10,
    currentDepth: 0,
  },
): Promise<string> {
  if (importState.currentDepth >= importState.maxDepth) {
    if (debugMode) {
      logger.warn(
        `已达到最大导入深度 (${importState.maxDepth})。停止导入处理。`,
      );
    }
    return content;
  }

  // 正则表达式匹配 @path/to/file 导入（支持任何文件扩展名）
  // 支持 @path/to/file.md 和 @./path/to/file.md 语法
  const importRegex = /@([./]?[^\s\n]+\.[^\s\n]+)/g;

  let processedContent = content;
  let match: RegExpExecArray | null;

  // 处理内容中的所有导入
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    // 验证导入路径以防止路径遍历攻击
    if (!validateImportPath(importPath, basePath, [basePath])) {
      processedContent = processedContent.replace(
        match[0],
        `<!-- 导入失败: ${importPath} - 路径遍历尝试 -->`,
      );
      continue;
    }

    // 检查导入是否为非 md 文件并警告
    if (!importPath.endsWith('.md')) {
      logger.warn(
        `导入处理器仅支持 .md 文件。尝试导入非 md 文件: ${importPath}。这将失败。`,
      );
      // 将导入替换为警告注释
      processedContent = processedContent.replace(
        match[0],
        `<!-- 导入失败: ${importPath} - 仅支持 .md 文件 -->`,
      );
      continue;
    }

    const fullPath = path.resolve(basePath, importPath);

    if (debugMode) {
      logger.debug(`正在处理导入: ${importPath} -> ${fullPath}`);
    }

    // 检查循环导入 - 如果我们已经在处理此文件
    if (importState.currentFile === fullPath) {
      if (debugMode) {
        logger.warn(`检测到循环导入: ${importPath}`);
      }
      // 将导入替换为警告注释
      processedContent = processedContent.replace(
        match[0],
        `<!-- 检测到循环导入: ${importPath} -->`,
      );
      continue;
    }

    // 检查是否已在此导入链中处理过此文件
    if (importState.processedFiles.has(fullPath)) {
      if (debugMode) {
        logger.warn(`此链中已处理过文件: ${importPath}`);
      }
      // 将导入替换为警告注释
      processedContent = processedContent.replace(
        match[0],
        `<!-- 文件已处理过: ${importPath} -->`,
      );
      continue;
    }

    // 通过查看导入链检查潜在的循环导入
    if (importState.currentFile) {
      const currentFileDir = path.dirname(importState.currentFile);
      const potentialCircularPath = path.resolve(currentFileDir, importPath);
      if (potentialCircularPath === importState.currentFile) {
        if (debugMode) {
          logger.warn(`检测到循环导入: ${importPath}`);
        }
        // 将导入替换为警告注释
        processedContent = processedContent.replace(
          match[0],
          `<!-- 检测到循环导入: ${importPath} -->`,
        );
        continue;
      }
    }

    try {
      // 检查文件是否存在
      await fs.access(fullPath);

      // 读取导入的文件内容
      const importedContent = await fs.readFile(fullPath, 'utf-8');

      if (debugMode) {
        logger.debug(`成功读取导入文件: ${fullPath}`);
      }

      // 递归处理导入内容中的导入
      const processedImportedContent = await processImports(
        importedContent,
        path.dirname(fullPath),
        debugMode,
        {
          ...importState,
          processedFiles: new Set([...importState.processedFiles, fullPath]),
          currentDepth: importState.currentDepth + 1,
          currentFile: fullPath, // 设置当前正在处理的文件
        },
      );

      // 将导入语句替换为处理后的内容
      processedContent = processedContent.replace(
        match[0],
        `<!-- 从以下位置导入: ${importPath} -->\n${processedImportedContent}\n<!-- 导入结束: ${importPath} -->`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (debugMode) {
        logger.error(`导入失败 ${importPath}: ${errorMessage}`);
      }

      // 将导入替换为错误注释
      processedContent = processedContent.replace(
        match[0],
        `<!-- 导入失败: ${importPath} - ${errorMessage} -->`,
      );
    }
  }

  return processedContent;
}

/**
 * 验证导入路径以确保它们是安全的且在允许的目录内
 *
 * @param importPath - 要验证的导入路径
 * @param basePath - 解析相对路径的基本目录
 * @param allowedDirectories - 允许的目录路径数组
 * @returns 导入路径是否有效
 */
export function validateImportPath(
  importPath: string,
  basePath: string,
  allowedDirectories: string[],
): boolean {
  // 拒绝 URL
  if (/^(file|https?):\/\//.test(importPath)) {
    return false;
  }

  const resolvedPath = path.resolve(basePath, importPath);

  return allowedDirectories.some((allowedDir) => {
    const normalizedAllowedDir = path.resolve(allowedDir);
    return resolvedPath.startsWith(normalizedAllowedDir);
  });
}