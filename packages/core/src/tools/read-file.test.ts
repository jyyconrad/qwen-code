/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import { ReadFileTool, ReadFileToolParams } from './read-file.js';
import * as fileUtils from '../utils/fileUtils.js';
import path from 'path';
import os from 'os';
import fs from 'fs'; // 用于设置中的实际文件系统操作
import { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

// 模拟 fileUtils.processSingleFileContent
vi.mock('../utils/fileUtils', async () => {
  const actualFileUtils =
    await vi.importActual<typeof fileUtils>('../utils/fileUtils');
  return {
    ...actualFileUtils, // 展开实际实现
    processSingleFileContent: vi.fn(), // 模拟特定函数
  };
});

const mockProcessSingleFileContent = fileUtils.processSingleFileContent as Mock;

describe('ReadFileTool', () => {
  let tempRootDir: string;
  let tool: ReadFileTool;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    // 为每次测试运行创建一个唯一的临时根目录
    tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-file-tool-root-'),
    );
    fs.writeFileSync(
      path.join(tempRootDir, '.geminiignore'),
      ['foo.*'].join('\n'),
    );
    const fileService = new FileDiscoveryService(tempRootDir);
    const mockConfigInstance = {
      getFileService: () => fileService,
      getTargetDir: () => tempRootDir,
    } as unknown as Config;
    tool = new ReadFileTool(mockConfigInstance);
    mockProcessSingleFileContent.mockReset();
  });

  afterEach(() => {
    // 清理临时根目录
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  describe('validateToolParams', () => {
    it('应返回 null 表示参数有效（根目录内的绝对路径）', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('应返回 null 表示带有 offset 和 limit 的有效参数', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: 0,
        limit: 10,
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('应返回相对路径的错误', () => {
      const params: ReadFileToolParams = { absolute_path: 'test.txt' };
      expect(tool.validateToolParams(params)).toBe(
        `文件路径必须是绝对路径，但却是相对路径：test.txt。你必须提供一个绝对路径。`,
      );
    });

    it('应返回路径在根目录外的错误', () => {
      const outsidePath = path.resolve(os.tmpdir(), 'outside-root.txt');
      const params: ReadFileToolParams = { absolute_path: outsidePath };
      expect(tool.validateToolParams(params)).toMatch(
        /文件路径必须在根目录内/,
      );
    });

    it('应返回负数 offset 的错误', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: -1,
        limit: 10,
      };
      expect(tool.validateToolParams(params)).toBe(
        'Offset 必须是非负数',
      );
    });

    it('应返回非正数 limit 的错误', () => {
      const paramsZero: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: 0,
        limit: 0,
      };
      expect(tool.validateToolParams(paramsZero)).toBe(
        'Limit 必须是正数',
      );
      const paramsNegative: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: 0,
        limit: -5,
      };
      expect(tool.validateToolParams(paramsNegative)).toBe(
        'Limit 必须是正数',
      );
    });

    it('应返回模式验证失败的错误（例如缺少路径）', () => {
      const params = { offset: 0 } as unknown as ReadFileToolParams;
      expect(tool.validateToolParams(params)).toBe(
        `params 必须包含必需属性 'absolute_path'`,
      );
    });
  });

  describe('getDescription', () => {
    it('应返回缩短的相对路径', () => {
      const filePath = path.join(tempRootDir, 'sub', 'dir', 'file.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      // 假设 tempRootDir 类似于 /tmp/read-file-tool-root-XXXXXX
      // 相对路径将是 sub/dir/file.txt
      expect(tool.getDescription(params)).toBe('sub/dir/file.txt');
    });

    it('如果路径是根目录则应返回 .', () => {
      const params: ReadFileToolParams = { absolute_path: tempRootDir };
      expect(tool.getDescription(params)).toBe('.');
    });
  });

  describe('execute', () => {
    it('如果参数无效应返回验证错误', async () => {
      const params: ReadFileToolParams = { absolute_path: 'relative/path.txt' };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toBe(
        '错误：提供了无效参数。原因：文件路径必须是绝对路径，但却是相对路径：relative/path.txt。你必须提供一个绝对路径。',
      );
      expect(result.returnDisplay).toBe(
        '文件路径必须是绝对路径，但却是相对路径：relative/path.txt。你必须提供一个绝对路径。',
      );
    });

    it('如果 processSingleFileContent 失败应返回其错误', async () => {
      const filePath = path.join(tempRootDir, 'error.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const errorMessage = '模拟读取错误';
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: `读取文件 ${filePath} 出错：${errorMessage}`,
        returnDisplay: `读取文件 ${filePath} 出错：${errorMessage}`,
        error: errorMessage,
      });

      const result = await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        undefined,
        undefined,
      );
      expect(result.llmContent).toContain(errorMessage);
      expect(result.returnDisplay).toContain(errorMessage);
    });

    it('应为文本文件返回成功结果', async () => {
      const filePath = path.join(tempRootDir, 'textfile.txt');
      const fileContent = '这是一个测试文件。';
      const params: ReadFileToolParams = { absolute_path: filePath };
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: fileContent,
        returnDisplay: `读取文本文件：${path.basename(filePath)}`,
      });

      const result = await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        undefined,
        undefined,
      );
      expect(result.llmContent).toBe(fileContent);
      expect(result.returnDisplay).toBe(
        `读取文本文件：${path.basename(filePath)}`,
      );
    });

    it('应为图像文件返回成功结果', async () => {
      const filePath = path.join(tempRootDir, 'image.png');
      const imageData = {
        inlineData: { mimeType: 'image/png', data: 'base64...' },
      };
      const params: ReadFileToolParams = { absolute_path: filePath };
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: imageData,
        returnDisplay: `读取图像文件：${path.basename(filePath)}`,
      });

      const result = await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        undefined,
        undefined,
      );
      expect(result.llmContent).toEqual(imageData);
      expect(result.returnDisplay).toBe(
        `读取图像文件：${path.basename(filePath)}`,
      );
    });

    it('应将 offset 和 limit 传递给 processSingleFileContent', async () => {
      const filePath = path.join(tempRootDir, 'paginated.txt');
      const params: ReadFileToolParams = {
        absolute_path: filePath,
        offset: 10,
        limit: 5,
      };
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: '一些行',
        returnDisplay: '读取文本文件（分页）',
      });

      await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        10,
        5,
      );
    });

    it('如果路径被 .geminiignore 模式忽略应返回错误', async () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'foo.bar'),
      };
      const result = await tool.execute(params, abortSignal);
      expect(result.returnDisplay).toContain('foo.bar');
      expect(result.returnDisplay).not.toContain('foo.baz');
    });
  });
});