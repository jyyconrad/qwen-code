/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { processImports, validateImportPath } from './memoryImportProcessor.js';

// 模拟 fs/promises
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

// 模拟 console 方法以捕获警告
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

describe('memoryImportProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 模拟 console 方法
    console.warn = vi.fn();
    console.error = vi.fn();
    console.debug = vi.fn();
  });

  afterEach(() => {
    // 恢复 console 方法
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
  });

  describe('processImports', () => {
    it('应处理基本的 md 文件导入', async () => {
      const content = 'Some content @./test.md more content';
      const basePath = '/test/path';
      const importedContent = '# Imported Content\nThis is imported.';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(importedContent);

      const result = await processImports(content, basePath, true);

      expect(result).toContain('<!-- Imported from: ./test.md -->');
      expect(result).toContain(importedContent);
      expect(result).toContain('<!-- End of import from: ./test.md -->');
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.resolve(basePath, './test.md'),
        'utf-8',
      );
    });

    it('应警告并失败于非 md 文件导入', async () => {
      const content = 'Some content @./instructions.txt more content';
      const basePath = '/test/path';

      const result = await processImports(content, basePath, true);

      expect(console.warn).toHaveBeenCalledWith(
        '[WARN] [ImportProcessor]',
        '导入处理器仅支持 .md 文件。尝试导入非 md 文件: ./instructions.txt。这将失败。',
      );
      expect(result).toContain(
        '<!-- Import failed: ./instructions.txt - Only .md files are supported -->',
      );
      expect(mockedFs.readFile).not.toHaveBeenCalled();
    });

    it('应处理循环导入', async () => {
      const content = 'Content @./circular.md more content';
      const basePath = '/test/path';
      const circularContent = 'Circular @./main.md content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(circularContent);

      // 设置导入状态以模拟我们已经在处理 main.md
      const importState = {
        processedFiles: new Set<string>(),
        maxDepth: 10,
        currentDepth: 0,
        currentFile: '/test/path/main.md', // 模拟我们正在处理 main.md
      };

      const result = await processImports(content, basePath, true, importState);

      // 在处理嵌套导入时应检测到循环导入
      expect(result).toContain('<!-- Circular import detected: ./main.md -->');
    });

    it('应处理文件未找到错误', async () => {
      const content = 'Content @./nonexistent.md more content';
      const basePath = '/test/path';

      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const result = await processImports(content, basePath, true);

      expect(result).toContain(
        '<!-- Import failed: ./nonexistent.md - File not found -->',
      );
      expect(console.error).toHaveBeenCalledWith(
        '[ERROR] [ImportProcessor]',
        '无法导入 ./nonexistent.md: File not found',
      );
    });

    it('应遵守最大深度限制', async () => {
      const content = 'Content @./deep.md more content';
      const basePath = '/test/path';
      const deepContent = 'Deep @./deeper.md content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(deepContent);

      const importState = {
        processedFiles: new Set<string>(),
        maxDepth: 1,
        currentDepth: 1,
      };

      const result = await processImports(content, basePath, true, importState);

      expect(console.warn).toHaveBeenCalledWith(
        '[WARN] [ImportProcessor]',
        '已达到最大导入深度 (1)。停止导入处理。',
      );
      expect(result).toBe(content);
    });

    it('应递归处理嵌套导入', async () => {
      const content = 'Main @./nested.md content';
      const basePath = '/test/path';
      const nestedContent = 'Nested @./inner.md content';
      const innerContent = 'Inner content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(nestedContent)
        .mockResolvedValueOnce(innerContent);

      const result = await processImports(content, basePath, true);

      expect(result).toContain('<!-- Imported from: ./nested.md -->');
      expect(result).toContain('<!-- Imported from: ./inner.md -->');
      expect(result).toContain(innerContent);
    });

    it('应处理导入中的绝对路径', async () => {
      const content = 'Content @/absolute/path/file.md more content';
      const basePath = '/test/path';
      const importedContent = 'Absolute path content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(importedContent);

      const result = await processImports(content, basePath, true);

      expect(result).toContain(
        '<!-- Import failed: /absolute/path/file.md - Path traversal attempt -->',
      );
    });

    it('应处理同一内容中的多个导入', async () => {
      const content = 'Start @./first.md middle @./second.md end';
      const basePath = '/test/path';
      const firstContent = 'First content';
      const secondContent = 'Second content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(firstContent)
        .mockResolvedValueOnce(secondContent);

      const result = await processImports(content, basePath, true);

      expect(result).toContain('<!-- Imported from: ./first.md -->');
      expect(result).toContain('<!-- Imported from: ./second.md -->');
      expect(result).toContain(firstContent);
      expect(result).toContain(secondContent);
    });
  });

  describe('validateImportPath', () => {
    it('应拒绝 URL', () => {
      expect(
        validateImportPath('https://example.com/file.md', '/base', [
          '/allowed',
        ]),
      ).toBe(false);
      expect(
        validateImportPath('http://example.com/file.md', '/base', ['/allowed']),
      ).toBe(false);
      expect(
        validateImportPath('file:///path/to/file.md', '/base', ['/allowed']),
      ).toBe(false);
    });

    it('应允许允许目录内的路径', () => {
      expect(validateImportPath('./file.md', '/base', ['/base'])).toBe(true);
      expect(validateImportPath('../file.md', '/base', ['/allowed'])).toBe(
        false,
      );
      expect(
        validateImportPath('/allowed/sub/file.md', '/base', ['/allowed']),
      ).toBe(true);
    });

    it('应拒绝允许目录外的路径', () => {
      expect(
        validateImportPath('/forbidden/file.md', '/base', ['/allowed']),
      ).toBe(false);
      expect(validateImportPath('../../../file.md', '/base', ['/base'])).toBe(
        false,
      );
    });

    it('应处理多个允许的目录', () => {
      expect(
        validateImportPath('./file.md', '/base', ['/allowed1', '/allowed2']),
      ).toBe(false);
      expect(
        validateImportPath('/allowed1/file.md', '/base', [
          '/allowed1',
          '/allowed2',
        ]),
      ).toBe(true);
      expect(
        validateImportPath('/allowed2/file.md', '/base', [
          '/allowed1',
          '/allowed2',
        ]),
      ).toBe(true);
    });

    it('应正确处理相对路径', () => {
      expect(validateImportPath('file.md', '/base', ['/base'])).toBe(true);
      expect(validateImportPath('./file.md', '/base', ['/base'])).toBe(true);
      expect(validateImportPath('../file.md', '/base', ['/parent'])).toBe(
        false,
      );
    });

    it('应正确处理绝对路径', () => {
      expect(
        validateImportPath('/allowed/file.md', '/base', ['/allowed']),
      ).toBe(true);
      expect(
        validateImportPath('/forbidden/file.md', '/base', ['/allowed']),
      ).toBe(false);
    });
  });
});