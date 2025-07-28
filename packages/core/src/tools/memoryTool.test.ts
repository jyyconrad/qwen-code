/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import {
  MemoryTool,
  setGeminiMdFilename,
  getCurrentGeminiMdFilename,
  getAllGeminiMdFilenames,
  DEFAULT_CONTEXT_FILENAME,
} from './memoryTool.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// 模拟依赖项
vi.mock('fs/promises');
vi.mock('os');

const MEMORY_SECTION_HEADER = '## Gemini Added Memories';

// 定义一个类型用于我们的 fsAdapter 以确保一致性
interface FsAdapter {
  readFile: (path: string, encoding: 'utf-8') => Promise<string>;
  writeFile: (path: string, data: string, encoding: 'utf-8') => Promise<void>;
  mkdir: (
    path: string,
    options: { recursive: boolean },
  ) => Promise<string | undefined>;
}

describe('MemoryTool', () => {
  const mockAbortSignal = new AbortController().signal;

  const mockFsAdapter: {
    readFile: Mock<FsAdapter['readFile']>;
    writeFile: Mock<FsAdapter['writeFile']>;
    mkdir: Mock<FsAdapter['mkdir']>;
  } = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/mock/home');
    mockFsAdapter.readFile.mockReset();
    mockFsAdapter.writeFile.mockReset().mockResolvedValue(undefined);
    mockFsAdapter.mkdir
      .mockReset()
      .mockResolvedValue(undefined as string | undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // 在每次测试后将 GEMINI_MD_FILENAME 重置为其原始值
    setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
  });

  describe('setGeminiMdFilename', () => {
    it('当提供有效的名称时应更新 currentGeminiMdFilename', () => {
      const newName = 'CUSTOM_CONTEXT.md';
      setGeminiMdFilename(newName);
      expect(getCurrentGeminiMdFilename()).toBe(newName);
    });

    it('如果新名称为空或仅包含空白字符，则不应更新 currentGeminiMdFilename', () => {
      const initialName = getCurrentGeminiMdFilename(); // 获取更改前的当前值
      setGeminiMdFilename('  ');
      expect(getCurrentGeminiMdFilename()).toBe(initialName);

      setGeminiMdFilename('');
      expect(getCurrentGeminiMdFilename()).toBe(initialName);
    });

    it('应处理文件名数组', () => {
      const newNames = ['CUSTOM_CONTEXT.md', 'ANOTHER_CONTEXT.md'];
      setGeminiMdFilename(newNames);
      expect(getCurrentGeminiMdFilename()).toBe('CUSTOM_CONTEXT.md');
      expect(getAllGeminiMdFilenames()).toEqual(newNames);
    });
  });

  describe('performAddMemoryEntry (静态方法)', () => {
    const testFilePath = path.join(
      '/mock/home',
      '.iflycode',
      DEFAULT_CONTEXT_FILENAME, // 在基本测试中使用默认值
    );

    it('如果文件不存在则应创建段落并保存事实', async () => {
      mockFsAdapter.readFile.mockRejectedValue({ code: 'ENOENT' }); // 模拟文件未找到
      const fact = 'The sky is blue';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.mkdir).toHaveBeenCalledWith(
        path.dirname(testFilePath),
        {
          recursive: true,
        },
      );
      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      expect(writeFileCall[0]).toBe(testFilePath);
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
      expect(writeFileCall[2]).toBe('utf-8');
    });

    it('如果文件为空则应创建段落并保存事实', async () => {
      mockFsAdapter.readFile.mockResolvedValue(''); // 模拟空文件
      const fact = 'The sky is blue';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('应向现有段落添加事实', async () => {
      const initialContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- Existing fact 1\n`;
      mockFsAdapter.readFile.mockResolvedValue(initialContent);
      const fact = 'New fact 2';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- Existing fact 1\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('应向现有的空段落添加事实', async () => {
      const initialContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n`; // 空段落
      mockFsAdapter.readFile.mockResolvedValue(initialContent);
      const fact = 'First fact in section';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('当存在其他 ## 段落时应正确添加事实并保持间距', async () => {
      const initialContent = `${MEMORY_SECTION_HEADER}\n- Fact 1\n\n## Another Section\nSome other text.`;
      mockFsAdapter.readFile.mockResolvedValue(initialContent);
      const fact = 'Fact 2';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      // 注意：实现确保如果内容存在则在末尾只有一个换行符。
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- Fact 1\n- ${fact}\n\n## Another Section\nSome other text.\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('应正确去除前导空格并添加以破折号开头的事实', async () => {
      mockFsAdapter.readFile.mockResolvedValue(`${MEMORY_SECTION_HEADER}\n`);
      const fact = '- - My fact with dashes';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- My fact with dashes\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('应处理来自 fsAdapter.writeFile 的错误', async () => {
      mockFsAdapter.readFile.mockResolvedValue('');
      mockFsAdapter.writeFile.mockRejectedValue(new Error('Disk full'));
      const fact = 'This will fail';
      await expect(
        MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter),
      ).rejects.toThrow('[MemoryTool] Failed to add memory entry: Disk full');
    });
  });

  describe('execute (实例方法)', () => {
    let memoryTool: MemoryTool;
    let performAddMemoryEntrySpy: Mock<typeof MemoryTool.performAddMemoryEntry>;

    beforeEach(() => {
      memoryTool = new MemoryTool();
      // 在这些测试中监视静态方法
      performAddMemoryEntrySpy = vi
        .spyOn(MemoryTool, 'performAddMemoryEntry')
        .mockResolvedValue(undefined) as Mock<
        typeof MemoryTool.performAddMemoryEntry
      >;
      // 需要类型转换因为 spyOn 返回 MockInstance
    });

    it('应具有正确的名称、显示名称、描述和模式', () => {
      expect(memoryTool.name).toBe('save_memory');
      expect(memoryTool.displayName).toBe('Save Memory');
      expect(memoryTool.description).toContain(
        '保存特定信息',
      );
      expect(memoryTool.schema).toBeDefined();
      expect(memoryTool.schema.name).toBe('save_memory');
      expect(memoryTool.schema.parameters?.properties?.fact).toBeDefined();
    });

    it('应使用正确参数调用 performAddMemoryEntry 并返回成功', async () => {
      const params = { fact: 'The sky is blue' };
      const result = await memoryTool.execute(params, mockAbortSignal);
      // 使用 getCurrentGeminiMdFilename 获取默认期望值，在测试中任何 setGeminiMdFilename 调用之前
      const expectedFilePath = path.join(
        '/mock/home',
        '.iflycode',
        getCurrentGeminiMdFilename(), // 这将是 DEFAULT_CONTEXT_FILENAME 除非在测试中被更改
      );

      // 对于此测试，我们期望传递实际的 fs 方法
      const expectedFsArgument = {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      };

      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        params.fact,
        expectedFilePath,
        expectedFsArgument,
      );
      const successMessage = `好的，我已经记住了："${params.fact}"`;
      expect(result.llmContent).toBe(
        JSON.stringify({ success: true, message: successMessage }),
      );
      expect(result.returnDisplay).toBe(successMessage);
    });

    it('如果事实为空则应返回错误', async () => {
      const params = { fact: ' ' }; // 空事实
      const result = await memoryTool.execute(params, mockAbortSignal);
      const errorMessage = '参数 "fact" 必须是非空字符串。';

      expect(performAddMemoryEntrySpy).not.toHaveBeenCalled();
      expect(result.llmContent).toBe(
        JSON.stringify({ success: false, error: errorMessage }),
      );
      expect(result.returnDisplay).toBe(`错误: ${errorMessage}`);
    });

    it('应处理来自 performAddMemoryEntry 的错误', async () => {
      const params = { fact: 'This will fail' };
      const underlyingError = new Error(
        '[MemoryTool] Failed to add memory entry: Disk full',
      );
      performAddMemoryEntrySpy.mockRejectedValue(underlyingError);

      const result = await memoryTool.execute(params, mockAbortSignal);

      expect(result.llmContent).toBe(
        JSON.stringify({
          success: false,
          error: `保存记忆失败。详情: ${underlyingError.message}`,
        }),
      );
      expect(result.returnDisplay).toBe(
        `保存记忆时出错: ${underlyingError.message}`,
      );
    });
  });
});