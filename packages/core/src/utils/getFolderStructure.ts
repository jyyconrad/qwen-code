/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import { Dirent } from 'fs';
import * as path from 'path';
import { getErrorMessage, isNodeError } from './errors.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

const MAX_ITEMS = 200;
const TRUNCATION_INDICATOR = '...';
const DEFAULT_IGNORED_FOLDERS = new Set(['node_modules', '.git', 'dist']);

// --- 接口定义 ---

/** 用于自定义文件夹结构检索的选项。 */
interface FolderStructureOptions {
  /** 要显示的文件和文件夹的最大数量。默认为 200。 */
  maxItems?: number;
  /** 要完全忽略的文件夹名称集合。区分大小写。 */
  ignoredFolders?: Set<string>;
  /** 可选的正则表达式，用于按名称筛选包含的文件。 */
  fileIncludePattern?: RegExp;
  /** 用于筛选文件。 */
  fileService?: FileDiscoveryService;
  /** 是否使用 .gitignore 模式。 */
  respectGitIgnore?: boolean;
}

// 定义合并选项的类型，其中 fileIncludePattern 保持可选
type MergedFolderStructureOptions = Required<
  Omit<FolderStructureOptions, 'fileIncludePattern' | 'fileService'>
> & {
  fileIncludePattern?: RegExp;
  fileService?: FileDiscoveryService;
};

/** 表示文件夹及其内容的完整未过滤信息。 */
interface FullFolderInfo {
  name: string;
  path: string;
  files: string[];
  subFolders: FullFolderInfo[];
  totalChildren: number; // 在 BFS 扫描期间从此文件夹包含的文件和子文件夹数量
  totalFiles: number; // 在 BFS 扫描期间从此文件夹包含的文件数量
  isIgnored?: boolean; // 标志，用于稍后轻松识别被忽略的文件夹
  hasMoreFiles?: boolean; // 表示此特定文件夹的文件是否被截断
  hasMoreSubfolders?: boolean; // 表示此特定文件夹的子文件夹是否被截断
}

// --- 接口定义 ---

// --- 辅助函数 ---

async function readFullStructure(
  rootPath: string,
  options: MergedFolderStructureOptions,
): Promise<FullFolderInfo | null> {
  const rootName = path.basename(rootPath);
  const rootNode: FullFolderInfo = {
    name: rootName,
    path: rootPath,
    files: [],
    subFolders: [],
    totalChildren: 0,
    totalFiles: 0,
  };

  const queue: Array<{ folderInfo: FullFolderInfo; currentPath: string }> = [
    { folderInfo: rootNode, currentPath: rootPath },
  ];
  let currentItemCount = 0;
  // 如果我们不只是列出其内容，则将根节点本身计为一项

  const processedPaths = new Set<string>(); // 为避免处理相同路径（如果符号链接创建循环）

  while (queue.length > 0) {
    const { folderInfo, currentPath } = queue.shift()!;

    if (processedPaths.has(currentPath)) {
      continue;
    }
    processedPaths.add(currentPath);

    if (currentItemCount >= options.maxItems) {
      // 如果根节点本身导致我们超出限制，我们实际上无法显示任何内容。
      // 否则，此文件夹将不会被进一步处理。
      // 将其加入队列的父级应已设置其自己的 hasMoreSubfolders 标志。
      continue;
    }

    let entries: Dirent[];
    try {
      const rawEntries = await fs.readdir(currentPath, { withFileTypes: true });
      // 按名称对条目进行字母排序以确保处理顺序一致
      entries = rawEntries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: unknown) {
      if (
        isNodeError(error) &&
        (error.code === 'EACCES' || error.code === 'ENOENT')
      ) {
        console.warn(
          `警告: 无法读取目录 ${currentPath}: ${error.message}`,
        );
        if (currentPath === rootPath && error.code === 'ENOENT') {
          return null; // 根目录本身不存在
        }
        // 对于子目录上的其他 EACCES/ENOENT 错误，只需跳过它们。
        continue;
      }
      throw error;
    }

    const filesInCurrentDir: string[] = [];
    const subFoldersInCurrentDir: FullFolderInfo[] = [];

    // 首先处理当前目录中的文件
    for (const entry of entries) {
      if (entry.isFile()) {
        if (currentItemCount >= options.maxItems) {
          folderInfo.hasMoreFiles = true;
          break;
        }
        const fileName = entry.name;
        const filePath = path.join(currentPath, fileName);
        if (options.respectGitIgnore && options.fileService) {
          if (options.fileService.shouldGitIgnoreFile(filePath)) {
            continue;
          }
        }
        if (
          !options.fileIncludePattern ||
          options.fileIncludePattern.test(fileName)
        ) {
          filesInCurrentDir.push(fileName);
          currentItemCount++;
          folderInfo.totalFiles++;
          folderInfo.totalChildren++;
        }
      }
    }
    folderInfo.files = filesInCurrentDir;

    // 然后处理目录并将其加入队列
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // 检查添加此目录本身是否会达到或超过 maxItems
        // (currentItemCount 指的是在此之前已添加的项目)
        if (currentItemCount >= options.maxItems) {
          folderInfo.hasMoreSubfolders = true;
          break; // 已达到限制，无法添加此文件夹或任何更多文件夹
        }
        // 如果添加此文件夹使我们恰好达到限制，并且它可能有子项，
        // 最好为父级显示 '...'，除非这是最后一个项目槽位。
        // 此逻辑很棘手。让我们尝试一个更简单的：如果我们无法添加此项目，则标记并跳出。

        const subFolderName = entry.name;
        const subFolderPath = path.join(currentPath, subFolderName);

        let isIgnoredByGit = false;
        if (options.respectGitIgnore && options.fileService) {
          if (options.fileService.shouldGitIgnoreFile(subFolderPath)) {
            isIgnoredByGit = true;
          }
        }

        if (options.ignoredFolders.has(subFolderName) || isIgnoredByGit) {
          const ignoredSubFolder: FullFolderInfo = {
            name: subFolderName,
            path: subFolderPath,
            files: [],
            subFolders: [],
            totalChildren: 0,
            totalFiles: 0,
            isIgnored: true,
          };
          subFoldersInCurrentDir.push(ignoredSubFolder);
          currentItemCount++; // 计算被忽略的文件夹本身
          folderInfo.totalChildren++; // 也计入父级的子项
          continue;
        }

        const subFolderNode: FullFolderInfo = {
          name: subFolderName,
          path: subFolderPath,
          files: [],
          subFolders: [],
          totalChildren: 0,
          totalFiles: 0,
        };
        subFoldersInCurrentDir.push(subFolderNode);
        currentItemCount++;
        folderInfo.totalChildren++; // 计入父级的子项

        // 添加到队列中以便稍后处理其子项
        queue.push({ folderInfo: subFolderNode, currentPath: subFolderPath });
      }
    }
    folderInfo.subFolders = subFoldersInCurrentDir;
  }

  return rootNode;
}

/**
 * 使用 BFS 读取目录结构，遵守 maxItems 限制。
 * @param node 简化结构中的当前节点。
 * @param indent 当前缩进字符串。
 * @param isLast 兄弟节点指示符。
 * @param builder 用于构建字符串行的数组。
 */
function formatStructure(
  node: FullFolderInfo,
  currentIndent: string,
  isLastChildOfParent: boolean,
  isProcessingRootNode: boolean,
  builder: string[],
): void {
  const connector = isLastChildOfParent ? '└───' : '├───';

  // 结构的根节点（最初传递给 getFolderStructure 的节点）
  // 不会使用连接线本身打印，只会打印其名称作为标题。
  // 其子项相对于该概念根节点打印。
  // 被忽略的根节点会使用连接线打印。
  if (!isProcessingRootNode || node.isIgnored) {
    builder.push(
      `${currentIndent}${connector}${node.name}/${node.isIgnored ? TRUNCATION_INDICATOR : ''}`,
    );
  }

  // 确定此节点子项的缩进。
  // 如果此节点是整个结构的根节点，则其子项在连接线前不缩进。
  // 否则，子项的缩进从当前节点的缩进扩展。
  const indentForChildren = isProcessingRootNode
    ? ''
    : currentIndent + (isLastChildOfParent ? '    ' : '│   ');

  // 渲染当前节点的文件
  const fileCount = node.files.length;
  for (let i = 0; i < fileCount; i++) {
    const isLastFileAmongSiblings =
      i === fileCount - 1 &&
      node.subFolders.length === 0 &&
      !node.hasMoreSubfolders;
    const fileConnector = isLastFileAmongSiblings ? '└───' : '├───';
    builder.push(`${indentForChildren}${fileConnector}${node.files[i]}`);
  }
  if (node.hasMoreFiles) {
    const isLastIndicatorAmongSiblings =
      node.subFolders.length === 0 && !node.hasMoreSubfolders;
    const fileConnector = isLastIndicatorAmongSiblings ? '└───' : '├───';
    builder.push(`${indentForChildren}${fileConnector}${TRUNCATION_INDICATOR}`);
  }

  // 渲染当前节点的子文件夹
  const subFolderCount = node.subFolders.length;
  for (let i = 0; i < subFolderCount; i++) {
    const isLastSubfolderAmongSiblings =
      i === subFolderCount - 1 && !node.hasMoreSubfolders;
    // 子项永远不会是最初处理的根节点。
    formatStructure(
      node.subFolders[i],
      indentForChildren,
      isLastSubfolderAmongSiblings,
      false,
      builder,
    );
  }
  if (node.hasMoreSubfolders) {
    builder.push(`${indentForChildren}└───${TRUNCATION_INDICATOR}`);
  }
}

// --- 主要导出函数 ---

/**
 * 生成目录结构的字符串表示，
 * 限制显示的项目数量。被忽略的文件夹会显示
 * 后跟 '...' 而不是其内容。
 *
 * @param directory 目录的绝对或相对路径。
 * @param options 可选的配置设置。
 * @returns 解析为格式化文件夹结构字符串的 Promise。
 */
export async function getFolderStructure(
  directory: string,
  options?: FolderStructureOptions,
): Promise<string> {
  const resolvedPath = path.resolve(directory);
  const mergedOptions: MergedFolderStructureOptions = {
    maxItems: options?.maxItems ?? MAX_ITEMS,
    ignoredFolders: options?.ignoredFolders ?? DEFAULT_IGNORED_FOLDERS,
    fileIncludePattern: options?.fileIncludePattern,
    fileService: options?.fileService,
    respectGitIgnore: options?.respectGitIgnore ?? true,
  };

  try {
    // 1. 使用 BFS 读取结构，遵守 maxItems 限制
    const structureRoot = await readFullStructure(resolvedPath, mergedOptions);

    if (!structureRoot) {
      return `错误: 无法读取目录 "${resolvedPath}"。请检查路径和权限。`;
    }

    // 2. 将结构格式化为字符串
    const structureLines: string[] = [];
    // 为初始调用传递 true 表示是根节点
    formatStructure(structureRoot, '', true, true, structureLines);

    // 3. 构建最终输出字符串
    const displayPath = resolvedPath.replace(/\\/g, '/');

    let disclaimer = '';
    // 检查是否在任何地方发生了截断或是否存在被忽略的文件夹。
    // 简单检查：如果任何节点指示有更多文件/子文件夹，或被忽略。
    let truncationOccurred = false;
    function checkForTruncation(node: FullFolderInfo) {
      if (node.hasMoreFiles || node.hasMoreSubfolders || node.isIgnored) {
        truncationOccurred = true;
      }
      if (!truncationOccurred) {
        for (const sub of node.subFolders) {
          checkForTruncation(sub);
          if (truncationOccurred) break;
        }
      }
    }
    checkForTruncation(structureRoot);

    if (truncationOccurred) {
      disclaimer = `带有 ${TRUNCATION_INDICATOR} 标记的文件夹或文件包含未显示的更多项目，已被忽略，或已达到显示限制 (${mergedOptions.maxItems} 个项目)。`;
    }

    const summary =
      `最多显示 ${mergedOptions.maxItems} 个项目（文件 + 文件夹）。 ${disclaimer}`.trim();

    const output = `${summary}\n\n${displayPath}/\n${structureLines.join('\n')}`;
    return output;
  } catch (error: unknown) {
    console.error(`获取 ${resolvedPath} 的文件夹结构时出错:`, error);
    return `处理目录 "${resolvedPath}" 时出错: ${getErrorMessage(error)}`;
  }
}