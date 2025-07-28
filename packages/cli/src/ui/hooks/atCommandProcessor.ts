/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PartListUnion, PartUnion } from '@google/genai';
import {
  Config,
  getErrorMessage,
  isNodeError,
  unescapePath,
} from '@iflytek/iflycode-core';
import {
  HistoryItem,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';

interface HandleAtCommandParams {
  query: string;
  config: Config;
  addItem: UseHistoryManagerReturn['addItem'];
  onDebugMessage: (message: string) => void;
  messageId: number;
  signal: AbortSignal;
}

interface HandleAtCommandResult {
  processedQuery: PartListUnion | null;
  shouldProceed: boolean;
}

interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}

/**
 * 解析查询字符串以查找所有 '@<path>' 命令和文本段。
 * 处理路径中使用 \ 转义的空格。
 */
function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;
    // 查找下一个未转义的 '@'
    while (nextSearchIndex < query.length) {
      if (
        query[nextSearchIndex] === '@' &&
        (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== '\\')
      ) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      // 没有更多 @
      if (currentIndex < query.length) {
        parts.push({ type: 'text', content: query.substring(currentIndex) });
      }
      break;
    }

    // 添加 @ 之前的文本
    if (atIndex > currentIndex) {
      parts.push({
        type: 'text',
        content: query.substring(currentIndex, atIndex),
      });
    }

    // 解析 @path
    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (/\s/.test(char)) {
        // 路径在第一个未转义的空白字符处结束
        break;
      }
      pathEndIndex++;
    }
    const rawAtPath = query.substring(atIndex, pathEndIndex);
    // unescapePath 期望包含 @ 符号，并会处理它。
    const atPath = unescapePath(rawAtPath);
    parts.push({ type: 'atPath', content: atPath });
    currentIndex = pathEndIndex;
  }
  // 过滤掉可能由连续的 @paths 或前导/尾随空格产生的空文本部分
  return parts.filter(
    (part) => !(part.type === 'text' && part.content.trim() === ''),
  );
}

/**
 * 处理可能包含一个或多个 '@<path>' 命令的用户输入。
 * 如果找到，则尝试使用 'read_many_files' 工具读取指定的文件/目录。
 * 用户查询会被修改以包含解析后的路径，并在结构化块中附加文件内容。
 *
 * @returns 一个对象，指示主钩子是否应继续进行 LLM 调用以及处理后的查询部分（包括文件内容）。
 */
export async function handleAtCommand({
  query,
  config,
  addItem,
  onDebugMessage,
  messageId: userMessageTimestamp,
  signal,
}: HandleAtCommandParams): Promise<HandleAtCommandResult> {
  const commandParts = parseAllAtCommands(query);
  const atPathCommandParts = commandParts.filter(
    (part) => part.type === 'atPath',
  );

  if (atPathCommandParts.length === 0) {
    addItem({ type: 'user', text: query }, userMessageTimestamp);
    return { processedQuery: [{ text: query }], shouldProceed: true };
  }

  addItem({ type: 'user', text: query }, userMessageTimestamp);

  // 获取中心化的文件发现服务
  const fileDiscovery = config.getFileService();
  const respectGitIgnore = config.getFileFilteringRespectGitIgnore();

  const pathSpecsToRead: string[] = [];
  const atPathToResolvedSpecMap = new Map<string, string>();
  const contentLabelsForDisplay: string[] = [];
  const ignoredPaths: string[] = [];

  const toolRegistry = await config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');
  const globTool = toolRegistry.getTool('glob');

  if (!readManyFilesTool) {
    addItem(
      { type: 'error', text: '错误：未找到 read_many_files 工具。' },
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  for (const atPathPart of atPathCommandParts) {
    const originalAtPath = atPathPart.content; // 例如，"@file.txt" 或 "@"

    if (originalAtPath === '@') {
      onDebugMessage(
        '检测到单独的 @，将在修改后的查询中作为文本处理。',
      );
      continue;
    }

    const pathName = originalAtPath.substring(1);
    if (!pathName) {
      // 如果 parseAllAtCommands 确保 @ 后有内容，这种情况理论上不会发生
      // 但作为保护措施：
      addItem(
        {
          type: 'error',
          text: `错误：无效的 @ 命令 '${originalAtPath}'。未指定路径。`,
        },
        userMessageTimestamp,
      );
      // 决定这是否是整个命令的致命错误，还是只跳过这个 @ 部分
      // 现在，让我们严格处理，如果一个 @path 格式错误就失败整个命令。
      return { processedQuery: null, shouldProceed: false };
    }

    // 检查路径是否应根据过滤选项被忽略
    if (fileDiscovery.shouldIgnoreFile(pathName, { respectGitIgnore })) {
      const reason = respectGitIgnore ? 'git-ignored' : 'custom-ignored';
      onDebugMessage(`路径 ${pathName} 是 ${reason} 的，将被跳过。`);
      ignoredPaths.push(pathName);
      continue;
    }

    let currentPathSpec = pathName;
    let resolvedSuccessfully = false;

    try {
      const absolutePath = path.resolve(config.getTargetDir(), pathName);
      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        currentPathSpec = pathName.endsWith('/')
          ? `${pathName}**`
          : `${pathName}/**`;
        onDebugMessage(
          `路径 ${pathName} 解析为目录，使用 glob: ${currentPathSpec}`,
        );
      } else {
        onDebugMessage(`路径 ${pathName} 解析为文件: ${currentPathSpec}`);
      }
      resolvedSuccessfully = true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        if (config.getEnableRecursiveFileSearch() && globTool) {
          onDebugMessage(
            `路径 ${pathName} 未直接找到，尝试 glob 搜索。`,
          );
          try {
            const globResult = await globTool.execute(
              { pattern: `**/*${pathName}*`, path: config.getTargetDir() },
              signal,
            );
            if (
              globResult.llmContent &&
              typeof globResult.llmContent === 'string' &&
              !globResult.llmContent.startsWith('No files found') &&
              !globResult.llmContent.startsWith('Error:')
            ) {
              const lines = globResult.llmContent.split('\n');
              if (lines.length > 1 && lines[1]) {
                const firstMatchAbsolute = lines[1].trim();
                currentPathSpec = path.relative(
                  config.getTargetDir(),
                  firstMatchAbsolute,
                );
                onDebugMessage(
                  `Glob 搜索 ${pathName} 找到 ${firstMatchAbsolute}，使用相对路径: ${currentPathSpec}`,
                );
                resolvedSuccessfully = true;
              } else {
                onDebugMessage(
                  `Glob 搜索 '**/*${pathName}*' 未返回可用路径。路径 ${pathName} 将被跳过。`,
                );
              }
            } else {
              onDebugMessage(
                `Glob 搜索 '**/*${pathName}*' 未找到文件或出现错误。路径 ${pathName} 将被跳过。`,
              );
            }
          } catch (globError) {
            console.error(
              `Glob 搜索 ${pathName} 时出错: ${getErrorMessage(globError)}`,
            );
            onDebugMessage(
              `Glob 搜索 ${pathName} 时出错。路径 ${pathName} 将被跳过。`,
            );
          }
        } else {
          onDebugMessage(
            `未找到 glob 工具。路径 ${pathName} 将被跳过。`,
          );
        }
      } else {
        console.error(
          `获取路径状态时出错 ${pathName}: ${getErrorMessage(error)}`,
        );
        onDebugMessage(
          `获取路径状态时出错 ${pathName}。路径 ${pathName} 将被跳过。`,
        );
      }
    }

    if (resolvedSuccessfully) {
      pathSpecsToRead.push(currentPathSpec);
      atPathToResolvedSpecMap.set(originalAtPath, currentPathSpec);
      contentLabelsForDisplay.push(pathName);
    }
  }

  // 为 LLM 构造查询的初始部分
  let initialQueryText = '';
  for (let i = 0; i < commandParts.length; i++) {
    const part = commandParts[i];
    if (part.type === 'text') {
      initialQueryText += part.content;
    } else {
      // type === 'atPath'
      const resolvedSpec = atPathToResolvedSpecMap.get(part.content);
      if (
        i > 0 &&
        initialQueryText.length > 0 &&
        !initialQueryText.endsWith(' ') &&
        resolvedSpec
      ) {
        // 如果前一部分是文本且未以空格结尾，或者前一部分是 @path，则添加空格
        const prevPart = commandParts[i - 1];
        if (
          prevPart.type === 'text' ||
          (prevPart.type === 'atPath' &&
            atPathToResolvedSpecMap.has(prevPart.content))
        ) {
          initialQueryText += ' ';
        }
      }
      if (resolvedSpec) {
        initialQueryText += `@${resolvedSpec}`;
      } else {
        // 如果未解析用于读取（例如单独的 @ 或被跳过的无效路径），
        // 将原始的 @-字符串加回去，确保如果不是第一个元素则添加间距。
        if (
          i > 0 &&
          initialQueryText.length > 0 &&
          !initialQueryText.endsWith(' ') &&
          !part.content.startsWith(' ')
        ) {
          initialQueryText += ' ';
        }
        initialQueryText += part.content;
      }
    }
  }
  initialQueryText = initialQueryText.trim();

  // 通知用户被忽略的路径
  if (ignoredPaths.length > 0) {
    const ignoreType = respectGitIgnore ? 'git-ignored' : 'custom-ignored';
    onDebugMessage(
      `忽略了 ${ignoredPaths.length} 个 ${ignoreType} 文件: ${ignoredPaths.join(', ')}`,
    );
  }

  // 单独 "@" 或完全无效的 @-命令导致 initialQueryText 为空的回退处理
  if (pathSpecsToRead.length === 0) {
    onDebugMessage('在 @ 命令中未找到有效的文件路径进行读取。');
    if (initialQueryText === '@' && query.trim() === '@') {
      // 如果唯一的内容是单独的 @，传递原始查询（可能包含空格）
      return { processedQuery: [{ text: query }], shouldProceed: true };
    } else if (!initialQueryText && query) {
      // 如果所有 @-命令都无效且没有周围文本，传递原始查询
      return { processedQuery: [{ text: query }], shouldProceed: true };
    }
    // 否则，继续处理不涉及文件读取的（可能已修改的）查询文本
    return {
      processedQuery: [{ text: initialQueryText || query }],
      shouldProceed: true,
    };
  }

  const processedQueryParts: PartUnion[] = [{ text: initialQueryText }];

  const toolArgs = {
    paths: pathSpecsToRead,
    respect_git_ignore: respectGitIgnore, // 使用配置设置
  };
  let toolCallDisplay: IndividualToolCallDisplay;

  try {
    const result = await readManyFilesTool.execute(toolArgs, signal);
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Success,
      resultDisplay:
        result.returnDisplay ||
        `成功读取: ${contentLabelsForDisplay.join(', ')}`,
      confirmationDetails: undefined,
    };

    if (Array.isArray(result.llmContent)) {
      const fileContentRegex = /^--- (.*?) ---\n\n([\s\S]*?)\n\n$/;
      processedQueryParts.push({
        text: '\n--- 来自引用文件的内容 ---',
      });
      for (const part of result.llmContent) {
        if (typeof part === 'string') {
          const match = fileContentRegex.exec(part);
          if (match) {
            const filePathSpecInContent = match[1]; // 这是一个解析后的路径规范
            const fileActualContent = match[2].trim();
            processedQueryParts.push({
              text: `\n来自 @${filePathSpecInContent} 的内容:\n`,
            });
            processedQueryParts.push({ text: fileActualContent });
          } else {
            processedQueryParts.push({ text: part });
          }
        } else {
          // part 是一个 Part 对象。
          processedQueryParts.push(part);
        }
      }
      processedQueryParts.push({ text: '\n--- 内容结束 ---' });
    } else {
      onDebugMessage(
        'read_many_files 工具未返回内容或返回空内容。',
      );
    }

    addItem(
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );
    return { processedQuery: processedQueryParts, shouldProceed: true };
  } catch (error: unknown) {
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Error,
      resultDisplay: `读取文件时出错 (${contentLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };
    addItem(
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }
}