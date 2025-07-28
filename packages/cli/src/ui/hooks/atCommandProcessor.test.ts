/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import type { Mocked } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import { Config, FileDiscoveryService } from '@iflytek/iflycode-core';
import { ToolCallStatus } from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import * as fsPromises from 'fs/promises';
import type { Stats } from 'fs';

const mockGetToolRegistry = vi.fn();
const mockGetTargetDir = vi.fn();
const mockConfig = {
  getToolRegistry: mockGetToolRegistry,
  getTargetDir: mockGetTargetDir,
  isSandboxed: vi.fn(() => false),
  getFileService: vi.fn(),
  getFileFilteringRespectGitIgnore: vi.fn(() => true),
  getEnableRecursiveFileSearch: vi.fn(() => true),
} as unknown as Config;

const mockReadManyFilesExecute = vi.fn();
const mockReadManyFilesTool = {
  name: 'read_many_files',
  displayName: '读取多个文件',
  description: '读取多个文件。',
  execute: mockReadManyFilesExecute,
  getDescription: vi.fn((params) => `读取文件: ${params.paths.join(', ')}`),
};

const mockGlobExecute = vi.fn();
const mockGlobTool = {
  name: 'glob',
  displayName: 'Glob 工具',
  execute: mockGlobExecute,
  getDescription: vi.fn(() => 'Glob 工具描述'),
};

const mockAddItem: Mock<UseHistoryManagerReturn['addItem']> = vi.fn();
const mockOnDebugMessage: Mock<(message: string) => void> = vi.fn();

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    stat: vi.fn(),
  };
});

vi.mock('@iflytek/iflycode-core', async () => {
  const actual = await vi.importActual('@iflytek/iflycode-core');
  return {
    ...actual,
    FileDiscoveryService: vi.fn(),
  };
});

describe('handleAtCommand', () => {
  let abortController: AbortController;
  let mockFileDiscoveryService: Mocked<FileDiscoveryService>;

  beforeEach(() => {
    vi.resetAllMocks();
    abortController = new AbortController();
    mockGetTargetDir.mockReturnValue('/test/dir');
    mockGetToolRegistry.mockReturnValue({
      getTool: vi.fn((toolName: string) => {
        if (toolName === 'read_many_files') return mockReadManyFilesTool;
        if (toolName === 'glob') return mockGlobTool;
        return undefined;
      }),
    });
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => false,
    } as Stats);
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: '',
      returnDisplay: '',
    });
    mockGlobExecute.mockResolvedValue({
      llmContent: '未找到文件',
      returnDisplay: '',
    });

    // 模拟 FileDiscoveryService
    mockFileDiscoveryService = {
      initialize: vi.fn(),
      shouldIgnoreFile: vi.fn(() => false),
      filterFiles: vi.fn((files) => files),
      getIgnoreInfo: vi.fn(() => ({ gitIgnored: [] })),
      isGitRepository: vi.fn(() => true),
    };
    vi.mocked(FileDiscoveryService).mockImplementation(
      () => mockFileDiscoveryService,
    );

    // 模拟 getFileService 以返回模拟的 FileDiscoveryService
    mockConfig.getFileService = vi
      .fn()
      .mockReturnValue(mockFileDiscoveryService);
  });

  afterEach(() => {
    abortController.abort();
  });

  it('如果没有 @ 命令，则直接传递查询', async () => {
    const query = '常规用户查询';
    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 123,
      signal: abortController.signal,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      123,
    );
    expect(result.processedQuery).toEqual([{ text: query }]);
    expect(result.shouldProceed).toBe(true);
    expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
  });

  it('如果只有单独的 @ 符号，则传递原始查询', async () => {
    const queryWithSpaces = '  @  ';
    const result = await handleAtCommand({
      query: queryWithSpaces,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 124,
      signal: abortController.signal,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: queryWithSpaces },
      124,
    );
    expect(result.processedQuery).toEqual([{ text: queryWithSpaces }]);
    expect(result.shouldProceed).toBe(true);
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      '检测到单独的 @，将在修改后的查询中作为文本处理。',
    );
  });

  it('应处理有效的文本文件路径', async () => {
    const filePath = 'path/to/file.txt';
    const query = `@${filePath}`;
    const fileContent = '这是文件内容。';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${filePath} ---\n\n${fileContent}\n\n`],
      returnDisplay: '读取了 1 个文件。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      125,
    );
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [filePath], respect_git_ignore: true },
      abortController.signal,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: [expect.objectContaining({ status: ToolCallStatus.Success })],
      }),
      125,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${filePath}` },
      { text: '\n--- 来自引用文件的内容 ---' },
      { text: `\n来自 @${filePath} 的内容:\n` },
      { text: fileContent },
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('应处理有效的目录路径并转换为 glob', async () => {
    const dirPath = 'path/to/dir';
    const query = `@${dirPath}`;
    const resolvedGlob = `${dirPath}/**`;
    const fileContent = '目录内容。';
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
    } as Stats);
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${resolvedGlob} ---\n\n${fileContent}\n\n`],
      returnDisplay: '读取目录内容。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 126,
      signal: abortController.signal,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      126,
    );
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [resolvedGlob], respect_git_ignore: true },
      abortController.signal,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `路径 ${dirPath} 解析为目录，使用 glob: ${resolvedGlob}`,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${resolvedGlob}` },
      { text: '\n--- 来自引用文件的内容 ---' },
      { text: `\n来自 @${resolvedGlob} 的内容:\n` },
      { text: fileContent },
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('应处理有效的图像文件路径（目前作为文本内容）', async () => {
    const imagePath = 'path/to/image.png';
    const query = `@${imagePath}`;
    // 对于 @-commands，read_many_files 预期返回文本或结构化文本。
    // 如果它返回实际的图像 Part，测试和处理将不同。
    // 当前 read_many_files 对图像的实现返回文本中的 base64。
    const imageFileTextContent = '[path/to/image.png 的 base64 图像数据]';
    const imagePart = {
      mimeType: 'image/png',
      inlineData: imageFileTextContent,
    };
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [imagePart],
      returnDisplay: '读取了 1 张图像。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 127,
      signal: abortController.signal,
    });
    expect(result.processedQuery).toEqual([
      { text: `@${imagePath}` },
      { text: '\n--- 来自引用文件的内容 ---' },
      imagePart,
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('应处理在 @command 前后带有文本的查询', async () => {
    const textBefore = '解释这个: ';
    const filePath = 'doc.md';
    const textAfter = ' 详细说明。';
    const query = `${textBefore}@${filePath}${textAfter}`;
    const fileContent = 'Markdown 内容。';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${filePath} ---\n\n${fileContent}\n\n`],
      returnDisplay: '读取了 1 个文档。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 128,
      signal: abortController.signal,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      128,
    );
    expect(result.processedQuery).toEqual([
      { text: `${textBefore}@${filePath}${textAfter}` },
      { text: '\n--- 来自引用文件的内容 ---' },
      { text: `\n来自 @${filePath} 的内容:\n` },
      { text: fileContent },
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('应正确处理带有转义空格的路径', async () => {
    const rawPath = 'path/to/my\\ file.txt';
    const unescapedPath = 'path/to/my file.txt';
    const query = `@${rawPath}`;
    const fileContent = '带空格文件的内容。';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${unescapedPath} ---\n\n${fileContent}\n\n`],
      returnDisplay: '读取了 1 个文件。',
    });

    await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 129,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [unescapedPath], respect_git_ignore: true },
      abortController.signal,
    );
  });

  it('应处理多个 @file 引用', async () => {
    const file1 = 'file1.txt';
    const content1 = '内容 file1';
    const file2 = 'file2.md';
    const content2 = '内容 file2';
    const query = `@${file1} @${file2}`;

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${file2} ---\n\n${content2}\n\n`,
      ],
      returnDisplay: '读取了 2 个文件。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 130,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, file2], respect_git_ignore: true },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${file1} @${file2}` },
      { text: '\n--- 来自引用文件的内容 ---' },
      { text: `\n来自 @${file1} 的内容:\n` },
      { text: content1 },
      { text: `\n来自 @${file2} 的内容:\n` },
      { text: content2 },
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('应处理带有交错文本的多个 @file 引用', async () => {
    const text1 = '检查 ';
    const file1 = 'f1.txt';
    const content1 = 'C1';
    const text2 = ' 和 ';
    const file2 = 'f2.md';
    const content2 = 'C2';
    const text3 = ' 请。';
    const query = `${text1}@${file1}${text2}@${file2}${text3}`;

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${file2} ---\n\n${content2}\n\n`,
      ],
      returnDisplay: '读取了 2 个文件。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 131,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, file2], respect_git_ignore: true },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      { text: `${text1}@${file1}${text2}@${file2}${text3}` },
      { text: '\n--- 来自引用文件的内容 ---' },
      { text: `\n来自 @${file1} 的内容:\n` },
      { text: content1 },
      { text: `\n来自 @${file2} 的内容:\n` },
      { text: content2 },
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('应处理有效、无效和单独 @ 引用的混合', async () => {
    const file1 = 'valid1.txt';
    const content1 = '有效内容 1';
    const invalidFile = 'nonexistent.txt';
    const query = `查看 @${file1} 然后 @${invalidFile} 还有单独的 @ 符号, 然后 @valid2.glob`;
    const file2Glob = 'valid2.glob';
    const resolvedFile2 = 'resolved/valid2.actual';
    const content2 = 'Glob 内容';

    // 为 file1 模拟 fs.stat（有效）
    vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
      if (p.toString().endsWith(file1))
        return { isDirectory: () => false } as Stats;
      if (p.toString().endsWith(invalidFile))
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      // 对于 valid2.glob，stat 将失败，触发 glob
      if (p.toString().endsWith(file2Glob))
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { isDirectory: () => false } as Stats; // 默认
    });

    // 模拟 glob 为 valid2.glob 查找 resolvedFile2
    mockGlobExecute.mockImplementation(async (params) => {
      if (params.pattern.includes('valid2.glob')) {
        return {
          llmContent: `找到文件:\n${mockGetTargetDir()}/${resolvedFile2}`,
          returnDisplay: '找到 1 个文件',
        };
      }
      return { llmContent: '未找到文件', returnDisplay: '' };
    });

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${resolvedFile2} ---\n\n${content2}\n\n`,
      ],
      returnDisplay: '读取了 2 个文件。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 132,
      signal: abortController.signal,
    });

    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, resolvedFile2], respect_git_ignore: true },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      // 原始查询有 @nonexistent.txt 和 @，但解析后有 @resolved/valid2.actual
      {
        text: `查看 @${file1} 然后 @${invalidFile} 还有单独的 @ 符号, 然后 @${resolvedFile2}`,
      },
      { text: '\n--- 来自引用文件的内容 ---' },
      { text: `\n来自 @${file1} 的内容:\n` },
      { text: content1 },
      { text: `\n来自 @${resolvedFile2} 的内容:\n` },
      { text: content2 },
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `路径 ${invalidFile} 未直接找到，尝试 glob 搜索。`,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `对 '**/*${invalidFile}*' 的 Glob 搜索未找到文件或出现错误。路径 ${invalidFile} 将被跳过。`,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      '检测到单独的 @，将在修改后的查询中作为文本处理。',
    );
  });

  it('如果所有 @paths 都无效或为单独 @，则返回原始查询', async () => {
    const query = '检查 @nonexistent.txt 和 @ 也';
    vi.mocked(fsPromises.stat).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    mockGlobExecute.mockResolvedValue({
      llmContent: '未找到文件',
      returnDisplay: '',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 133,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
    // 修改后的查询字符串将是 "检查 @nonexistent.txt 和 @ 也"，因为没有解析到用于读取的路径。
    expect(result.processedQuery).toEqual([
      { text: '检查 @nonexistent.txt 和 @ 也' },
    ]);

    expect(result.shouldProceed).toBe(true);
  });

  it('应不区分大小写地处理文件路径', async () => {
    // const actualFilePath = 'path/to/MyFile.txt'; // 未使用，llmContent 中的路径应与 queryPath 匹配
    const queryPath = 'path/to/myfile.txt'; // 不同大小写
    const query = `@${queryPath}`;
    const fileContent = '这是不区分大小写的文件内容。';

    // 模拟 fs.stat 以在查找 myfile.txt 时"找到" MyFile.txt
    // 这模拟了一个不区分大小写的文件系统或解析
    vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
      if (p.toString().toLowerCase().endsWith('myfile.txt')) {
        return {
          isDirectory: () => false,
          // 如果你的代码使用了其他 Stats 属性，你可能需要添加它们
        } as Stats;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${queryPath} ---\n\n${fileContent}\n\n`],
      returnDisplay: '读取了 1 个文件。',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 134, // 新的 messageId
      signal: abortController.signal,
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      134,
    );
    // atCommandProcessor 在调用 read_many_files 之前解析路径。
    // 我们期望它使用 fs.stat "找到" 的路径。
    // 在真正的不区分大小写的文件系统中，stat(myfile.txt) 可能会返回 MyFile.txt 的信息。
    // 关键是使用*某个*指向内容的有效路径。
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      // 根据路径解析和 fs.stat 模拟的交互方式，
      // 这可能是 queryPath 或 actualFilePath。
      // 对于这个测试，我们假设处理器使用 stat "成功" 的路径。
      // 如果底层文件系统/统计是真正不区分大小写的，它可能会解析为 actualFilePath。
      // 如果模拟更简单，如果 stat(queryPath) 成功，它可能会使用 queryPath。
      // 最重要的是使用*某个*能导致内容的路径版本。
      // 假设它使用查询中的路径，如果 stat 确认它存在（即使磁盘上大小写不同）
      { paths: [queryPath], respect_git_ignore: true },
      abortController.signal,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: [expect.objectContaining({ status: ToolCallStatus.Success })],
      }),
      134,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${queryPath}` }, // 查询使用输入路径
      { text: '\n--- 来自引用文件的内容 ---' },
      { text: `\n来自 @${queryPath} 的内容:\n` }, // 内容显示也使用输入路径
      { text: fileContent },
      { text: '\n--- 内容结束 ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  describe('git 感知过滤', () => {
    it('应跳过 @ 命令中的 git 忽略文件', async () => {
      const gitIgnoredFile = 'node_modules/package.json';
      const query = `@${gitIgnoredFile}`;

      // 模拟文件发现服务报告此文件为 git 忽略
      mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
        (path: string, options?: { respectGitIgnore?: boolean }) =>
          path === gitIgnoredFile && options?.respectGitIgnore !== false,
      );

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 200,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        gitIgnoredFile,
        { respectGitIgnore: true },
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `路径 ${gitIgnoredFile} 被 git 忽略，将被跳过。`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        '忽略了 1 个 git 忽略的文件: node_modules/package.json',
      );
      expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
      expect(result.processedQuery).toEqual([{ text: query }]);
      expect(result.shouldProceed).toBe(true);
    });

    it('应正常处理非 git 忽略文件', async () => {
      const validFile = 'src/index.ts';
      const query = `@${validFile}`;
      const fileContent = 'console.log("Hello world");';

      mockFileDiscoveryService.shouldIgnoreFile.mockReturnValue(false);
      mockReadManyFilesExecute.mockResolvedValue({
        llmContent: [`--- ${validFile} ---\n\n${fileContent}\n\n`],
        returnDisplay: '读取了 1 个文件。',
      });

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 201,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        validFile,
        { respectGitIgnore: true },
      );
      expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
        { paths: [validFile], respect_git_ignore: true },
        abortController.signal,
      );
      expect(result.processedQuery).toEqual([
        { text: `@${validFile}` },
        { text: '\n--- 来自引用文件的内容 ---' },
        { text: `\n来自 @${validFile} 的内容:\n` },
        { text: fileContent },
        { text: '\n--- 内容结束 ---' },
      ]);
      expect(result.shouldProceed).toBe(true);
    });

    it('应处理混合的 git 忽略和有效文件', async () => {
      const validFile = 'README.md';
      const gitIgnoredFile = '.env';
      const query = `@${validFile} @${gitIgnoredFile}`;
      const fileContent = '# 项目 README';

      mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
        (path: string, options?: { respectGitIgnore?: boolean }) =>
          path === gitIgnoredFile && options?.respectGitIgnore !== false,
      );
      mockReadManyFilesExecute.mockResolvedValue({
        llmContent: [`--- ${validFile} ---\n\n${fileContent}\n\n`],
        returnDisplay: '读取了 1 个文件。',
      });

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 202,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        validFile,
        { respectGitIgnore: true },
      );
      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        gitIgnoredFile,
        { respectGitIgnore: true },
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `路径 ${gitIgnoredFile} 被 git 忽略，将被跳过。`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        '忽略了 1 个 git 忽略的文件: .env',
      );
      expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
        { paths: [validFile], respect_git_ignore: true },
        abortController.signal,
      );
      expect(result.processedQuery).toEqual([
        { text: `@${validFile} @${gitIgnoredFile}` },
        { text: '\n--- 来自引用文件的内容 ---' },
        { text: `\n来自 @${validFile} 的内容:\n` },
        { text: fileContent },
        { text: '\n--- 内容结束 ---' },
      ]);
      expect(result.shouldProceed).toBe(true);
    });

    it('应始终忽略 .git 目录文件', async () => {
      const gitFile = '.git/config';
      const query = `@${gitFile}`;

      mockFileDiscoveryService.shouldIgnoreFile.mockReturnValue(true);

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 203,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        gitFile,
        { respectGitIgnore: true },
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `路径 ${gitFile} 被 git 忽略，将被跳过。`,
      );
      expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
      expect(result.processedQuery).toEqual([{ text: query }]);
      expect(result.shouldProceed).toBe(true);
    });
  });

  describe('当递归文件搜索被禁用时', () => {
    beforeEach(() => {
      vi.mocked(mockConfig.getEnableRecursiveFileSearch).mockReturnValue(false);
    });

    it('对于不存在的文件不应使用 glob 搜索', async () => {
      const invalidFile = 'nonexistent.txt';
      const query = `@${invalidFile}`;

      vi.mocked(fsPromises.stat).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 300,
        signal: abortController.signal,
      });

      expect(mockGlobExecute).not.toHaveBeenCalled();
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `未找到 Glob 工具。路径 ${invalidFile} 将被跳过。`,
      );
      expect(result.processedQuery).toEqual([{ text: query }]);
      expect(result.shouldProceed).toBe(true);
    });
  });
});