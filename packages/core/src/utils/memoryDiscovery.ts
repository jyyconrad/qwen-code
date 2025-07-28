/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { bfsFileSearch } from './bfsFileSearch.js';
import {
  GEMINI_CONFIG_DIR,
  getAllGeminiMdFilenames,
} from '../tools/memoryTool.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { processImports } from './memoryImportProcessor.js';

// 简单的控制台日志记录器，类似于之前 CLI config.ts 中的日志记录器
// TODO: 如果可用/合适，集成更强大的服务器端日志记录器。
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    console.debug('[DEBUG] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) =>
    console.error('[ERROR] [MemoryDiscovery]', ...args),
};

const MAX_DIRECTORIES_TO_SCAN_FOR_MEMORY = 200;

interface GeminiFileContent {
  filePath: string;
  content: string | null;
}

async function findProjectRoot(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  while (true) {
    const gitPath = path.join(currentDir, '.git');
    try {
      const stats = await fs.stat(gitPath);
      if (stats.isDirectory()) {
        return currentDir;
      }
    } catch (error: unknown) {
      // 不记录 ENOENT 错误，因为当 .git 不存在时这是预期的
      // 在测试环境中也不记录错误，测试环境通常有模拟的 fs
      const isENOENT =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'ENOENT';

      // 仅在非测试环境中记录意外错误
      // process.env.NODE_ENV === 'test' 或 VITEST 是常见的测试环境标识
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;

      if (!isENOENT && !isTestEnv) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          const fsError = error as { code: string; message: string };
          logger.warn(
            `检查 .git 目录时出错 ${gitPath}: ${fsError.message}`,
          );
        } else {
          logger.warn(
            `检查 .git 目录时出现非标准错误 ${gitPath}: ${String(error)}`,
          );
        }
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

async function getGeminiMdFilePathsInternal(
  currentWorkingDirectory: string,
  userHomePath: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
): Promise<string[]> {
  const allPaths = new Set<string>();
  const geminiMdFilenames = getAllGeminiMdFilenames();

  for (const geminiMdFilename of geminiMdFilenames) {
    const resolvedCwd = path.resolve(currentWorkingDirectory);
    const resolvedHome = path.resolve(userHomePath);
    const globalMemoryPath = path.join(
      resolvedHome,
      GEMINI_CONFIG_DIR,
      geminiMdFilename,
    );

    if (debugMode)
      logger.debug(
        `从 CWD 开始搜索 ${geminiMdFilename}: ${resolvedCwd}`,
      );
    if (debugMode) logger.debug(`用户主目录: ${resolvedHome}`);

    try {
      await fs.access(globalMemoryPath, fsSync.constants.R_OK);
      allPaths.add(globalMemoryPath);
      if (debugMode)
        logger.debug(
          `找到可读的全局 ${geminiMdFilename}: ${globalMemoryPath}`,
        );
    } catch {
      if (debugMode)
        logger.debug(
          `全局 ${geminiMdFilename} 未找到或不可读: ${globalMemoryPath}`,
        );
    }

    const projectRoot = await findProjectRoot(resolvedCwd);
    if (debugMode)
      logger.debug(`确定项目根目录: ${projectRoot ?? 'None'}`);

    const upwardPaths: string[] = [];
    let currentDir = resolvedCwd;
    // 确定表示项目顶部或用户特定空间的目录。
    const ultimateStopDir = projectRoot
      ? path.dirname(projectRoot)
      : path.dirname(resolvedHome);

    while (currentDir && currentDir !== path.dirname(currentDir)) {
      // 循环直到文件系统根目录或 currentDir 为空
      if (debugMode) {
        logger.debug(
          `检查 ${geminiMdFilename} (向上扫描): ${currentDir}`,
        );
      }

      // 在从 CWD 向上扫描时跳过全局 .gemini 目录本身，
      // 因为全局路径是单独且明确地首先处理的。
      if (currentDir === path.join(resolvedHome, GEMINI_CONFIG_DIR)) {
        if (debugMode) {
          logger.debug(
            `向上扫描到达全局配置目录路径，停止向上搜索: ${currentDir}`,
          );
        }
        break;
      }

      const potentialPath = path.join(currentDir, geminiMdFilename);
      try {
        await fs.access(potentialPath, fsSync.constants.R_OK);
        // 仅当不是已添加的 globalMemoryPath 时才添加到 upwardPaths
        if (potentialPath !== globalMemoryPath) {
          upwardPaths.unshift(potentialPath);
          if (debugMode) {
            logger.debug(
              `找到可读的向上 ${geminiMdFilename}: ${potentialPath}`,
            );
          }
        }
      } catch {
        if (debugMode) {
          logger.debug(
            `向上 ${geminiMdFilename} 在以下位置未找到或不可读: ${currentDir}`,
          );
        }
      }

      // 停止条件：如果 currentDir 是 ultimateStopDir，则在此迭代后中断。
      if (currentDir === ultimateStopDir) {
        if (debugMode)
          logger.debug(
            `到达向上扫描的最终停止目录: ${currentDir}`,
          );
        break;
      }

      currentDir = path.dirname(currentDir);
    }
    upwardPaths.forEach((p) => allPaths.add(p));

    const downwardPaths = await bfsFileSearch(resolvedCwd, {
      fileName: geminiMdFilename,
      maxDirs: MAX_DIRECTORIES_TO_SCAN_FOR_MEMORY,
      debug: debugMode,
      fileService,
    });
    downwardPaths.sort(); // 排序以保持一致的顺序，尽管层次结构可能更复杂
    if (debugMode && downwardPaths.length > 0)
      logger.debug(
        `找到向下 ${geminiMdFilename} 文件 (已排序): ${JSON.stringify(
          downwardPaths,
        )}`,
      );
    // 仅当尚未包含时才添加向下路径（例如来自向上扫描）
    for (const dPath of downwardPaths) {
      allPaths.add(dPath);
    }
  }

  // 添加扩展上下文文件路径
  for (const extensionPath of extensionContextFilePaths) {
    allPaths.add(extensionPath);
  }

  const finalPaths = Array.from(allPaths);

  if (debugMode)
    logger.debug(
      `最终排序的 ${getAllGeminiMdFilenames()} 路径以供读取: ${JSON.stringify(
        finalPaths,
      )}`,
    );
  return finalPaths;
}

async function readGeminiMdFiles(
  filePaths: string[],
  debugMode: boolean,
): Promise<GeminiFileContent[]> {
  const results: GeminiFileContent[] = [];
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // 处理内容中的导入
      const processedContent = await processImports(
        content,
        path.dirname(filePath),
        debugMode,
      );

      results.push({ filePath, content: processedContent });
      if (debugMode)
        logger.debug(
          `成功读取并处理导入: ${filePath} (长度: ${processedContent.length})`,
        );
    } catch (error: unknown) {
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;
      if (!isTestEnv) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          `警告: 无法读取 ${getAllGeminiMdFilenames()} 文件 ${filePath}. 错误: ${message}`,
        );
      }
      results.push({ filePath, content: null }); // 仍然包含但内容为 null
      if (debugMode) logger.debug(`读取失败: ${filePath}`);
    }
  }
  return results;
}

function concatenateInstructions(
  instructionContents: GeminiFileContent[],
  // 需要 CWD 来解析显示标记的相对路径
  currentWorkingDirectoryForDisplay: string,
): string {
  return instructionContents
    .filter((item) => typeof item.content === 'string')
    .map((item) => {
      const trimmedContent = (item.content as string).trim();
      if (trimmedContent.length === 0) {
        return null;
      }
      const displayPath = path.isAbsolute(item.filePath)
        ? path.relative(currentWorkingDirectoryForDisplay, item.filePath)
        : item.filePath;
      return `--- 来自的上下文: ${displayPath} ---\n${trimmedContent}\n--- 来自的上下文结束: ${displayPath} ---`;
    })
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

/**
 * 加载分层的 GEMINI.md 文件并连接其内容。
 * 此函数供服务器使用。
 */
export async function loadServerHierarchicalMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode)
    logger.debug(
      `为 CWD 加载服务器分层内存: ${currentWorkingDirectory}`,
    );
  // 对于服务器，homedir() 指的是服务器进程的主目录。
  // 这与 MemoryTool 查找全局路径的方式一致。
  const userHomePath = homedir();
  const filePaths = await getGeminiMdFilePathsInternal(
    currentWorkingDirectory,
    userHomePath,
    debugMode,
    fileService,
    extensionContextFilePaths,
  );
  if (filePaths.length === 0) {
    if (debugMode) logger.debug('在层次结构中未找到 GEMINI.md 文件。');
    return { memoryContent: '', fileCount: 0 };
  }
  const contentsWithPaths = await readGeminiMdFiles(filePaths, debugMode);
  // 传递 CWD 用于连接内容中的相对路径显示
  const combinedInstructions = concatenateInstructions(
    contentsWithPaths,
    currentWorkingDirectory,
  );
  if (debugMode)
    logger.debug(
      `组合指令长度: ${combinedInstructions.length}`,
    );
  if (debugMode && combinedInstructions.length > 0)
    logger.debug(
      `组合指令 (片段): ${combinedInstructions.substring(0, 500)}...`,
    );
  return { memoryContent: combinedInstructions, fileCount: filePaths.length };
}