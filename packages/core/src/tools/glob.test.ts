/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GlobTool, GlobToolParams, GlobPath, sortFileEntries } from './glob.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest'; // 移除了 vi
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { Config } from '../config/config.js';

describe('GlobTool', () => {
  let tempRootDir: string; // 这将是 GlobTool 实例的 rootDirectory
  let globTool: GlobTool;
  const abortSignal = new AbortController().signal;

  // 用于测试的模拟配置
  const mockConfig = {
    getFileService: () => new FileDiscoveryService(tempRootDir),
    getFileFilteringRespectGitIgnore: () => true,
    getTargetDir: () => tempRootDir,
  } as unknown as Config;

  beforeEach(async () => {
    // 为每次测试运行创建一个唯一的根目录
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-tool-root-'));
    globTool = new GlobTool(mockConfig);

    // 在此根目录中创建一些测试文件和目录
    // 顶层文件
    await fs.writeFile(path.join(tempRootDir, 'fileA.txt'), 'contentA');
    await fs.writeFile(path.join(tempRootDir, 'FileB.TXT'), 'contentB'); // 不同大小写用于测试

    // 子目录及其内部文件
    await fs.mkdir(path.join(tempRootDir, 'sub'));
    await fs.writeFile(path.join(tempRootDir, 'sub', 'fileC.md'), 'contentC');
    await fs.writeFile(path.join(tempRootDir, 'sub', 'FileD.MD'), 'contentD'); // 不同大小写

    // 更深层的子目录
    await fs.mkdir(path.join(tempRootDir, 'sub', 'deep'));
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      'contentE',
    );

    // 用于 mtime 排序测试的文件
    await fs.writeFile(path.join(tempRootDir, 'older.sortme'), 'older_content');
    // 确保修改时间有明显差异
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.writeFile(path.join(tempRootDir, 'newer.sortme'), 'newer_content');
  });

  afterEach(async () => {
    // 清理临时根目录
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should find files matching a simple pattern in the root', async () => {
      const params: GlobToolParams = { pattern: '*.txt' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
      expect(result.returnDisplay).toBe('Found 2 matching file(s)');
    });

    it('should find files case-sensitively when case_sensitive is true', async () => {
      const params: GlobToolParams = { pattern: '*.txt', case_sensitive: true };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).not.toContain(
        path.join(tempRootDir, 'FileB.TXT'),
      );
    });

    it('should find files case-insensitively by default (pattern: *.TXT)', async () => {
      const params: GlobToolParams = { pattern: '*.TXT' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files case-insensitively when case_sensitive is false (pattern: *.TXT)', async () => {
      const params: GlobToolParams = {
        pattern: '*.TXT',
        case_sensitive: false,
      };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files using a pattern that includes a subdirectory', async () => {
      const params: GlobToolParams = { pattern: 'sub/*.md' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'fileC.md'),
      );
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'FileD.MD'),
      );
    });

    it('should find files in a specified relative path (relative to rootDir)', async () => {
      const params: GlobToolParams = { pattern: '*.md', path: 'sub' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'fileC.md'),
      );
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'FileD.MD'),
      );
    });

    it('should find files using a deep globstar pattern (e.g., **/*.log)', async () => {
      const params: GlobToolParams = { pattern: '**/*.log' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      );
    });

    it('should return "No files found" message when pattern matches nothing', async () => {
      const params: GlobToolParams = { pattern: '*.nonexistent' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'No files found matching pattern "*.nonexistent"',
      );
      expect(result.returnDisplay).toBe('No files found');
    });

    it('should correctly sort files by modification time (newest first)', async () => {
      const params: GlobToolParams = { pattern: '*.sortme' };
      const result = await globTool.execute(params, abortSignal);
      const llmContent = partListUnionToString(result.llmContent);

      expect(llmContent).toContain('Found 2 file(s)');
      // 确保 llmContent 是字符串以通过 TypeScript 类型检查
      expect(typeof llmContent).toBe('string');

      const filesListed = llmContent
        .substring(llmContent.indexOf(':') + 1)
        .trim()
        .split('\n');
      expect(filesListed[0]).toContain(path.join(tempRootDir, 'newer.sortme'));
      expect(filesListed[1]).toContain(path.join(tempRootDir, 'older.sortme'));
    });
  });

  describe('validateToolParams', () => {
    it('should return null for valid parameters (pattern only)', () => {
      const params: GlobToolParams = { pattern: '*.js' };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters (pattern and path)', () => {
      const params: GlobToolParams = { pattern: '*.js', path: 'sub' };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters (pattern, path, and case_sensitive)', () => {
      const params: GlobToolParams = {
        pattern: '*.js',
        path: 'sub',
        case_sensitive: true,
      };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing (schema validation)', () => {
      // 需要正确定义此对象而不包含 pattern
      const params = { path: '.' };
      // @ts-expect-error - 我们故意创建无效参数用于测试
      expect(globTool.validateToolParams(params)).toBe(
        `params must have required property 'pattern'`,
      );
    });

    it('should return error if pattern is an empty string', () => {
      const params: GlobToolParams = { pattern: '' };
      expect(globTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty.",
      );
    });

    it('should return error if pattern is only whitespace', () => {
      const params: GlobToolParams = { pattern: '   ' };
      expect(globTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty.",
      );
    });

    it('should return error if path is provided but is not a string (schema validation)', () => {
      const params = {
        pattern: '*.ts',
        path: 123,
      };
      // @ts-expect-error - 我们故意创建无效参数用于测试
      expect(globTool.validateToolParams(params)).toBe(
        'params/path must be string',
      );
    });

    it('should return error if case_sensitive is provided but is not a boolean (schema validation)', () => {
      const params = {
        pattern: '*.ts',
        case_sensitive: 'true',
      };
      // @ts-expect-error - 我们故意创建无效参数用于测试
      expect(globTool.validateToolParams(params)).toBe(
        'params/case_sensitive must be boolean',
      );
    });

    it("should return error if search path resolves outside the tool's root directory", () => {
      // 为此测试专门创建一个 globTool 实例，使用更深的根目录
      tempRootDir = path.join(tempRootDir, 'sub');
      const specificGlobTool = new GlobTool(mockConfig);
      // const params: GlobToolParams = { pattern: '*.txt', path: '..' }; // 此行未使用将被删除。
      // 这应该没问题，因为 tempRootDir 仍在原始 tempRootDir 内（deeperRootDir 的父目录）
      // 让我们尝试更上层。
      const paramsOutside: GlobToolParams = {
        pattern: '*.txt',
        path: '../../../../../../../../../../tmp',
      }; // 肯定在外部
      expect(specificGlobTool.validateToolParams(paramsOutside)).toContain(
        "resolves outside the tool's root directory",
      );
    });

    it('should return error if specified search path does not exist', async () => {
      const params: GlobToolParams = {
        pattern: '*.txt',
        path: 'nonexistent_subdir',
      };
      expect(globTool.validateToolParams(params)).toContain(
        'Search path does not exist',
      );
    });

    it('should return error if specified search path is a file, not a directory', async () => {
      const params: GlobToolParams = { pattern: '*.txt', path: 'fileA.txt' };
      expect(globTool.validateToolParams(params)).toContain(
        'Search path is not a directory',
      );
    });
  });
});

describe('sortFileEntries', () => {
  const nowTimestamp = new Date('2024-01-15T12:00:00.000Z').getTime();
  const oneDayInMs = 24 * 60 * 60 * 1000;

  const createFileEntry = (fullpath: string, mtimeDate: Date): GlobPath => ({
    fullpath: () => fullpath,
    mtimeMs: mtimeDate.getTime(),
  });

  it('should sort a mix of recent and older files correctly', () => {
    const recentTime1 = new Date(nowTimestamp - 1 * 60 * 60 * 1000); // 1 小时前
    const recentTime2 = new Date(nowTimestamp - 2 * 60 * 60 * 1000); // 2 小时前
    const olderTime1 = new Date(
      nowTimestamp - (oneDayInMs + 1 * 60 * 60 * 1000),
    ); // 25 小时前
    const olderTime2 = new Date(
      nowTimestamp - (oneDayInMs + 2 * 60 * 60 * 1000),
    ); // 26 小时前

    const entries: GlobPath[] = [
      createFileEntry('older_zebra.txt', olderTime2),
      createFileEntry('recent_alpha.txt', recentTime1),
      createFileEntry('older_apple.txt', olderTime1),
      createFileEntry('recent_beta.txt', recentTime2),
      createFileEntry('older_banana.txt', olderTime1), // 与 apple 相同的 mtime
    ];

    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    const sortedPaths = sorted.map((e) => e.fullpath());

    expect(sortedPaths).toEqual([
      'recent_alpha.txt', // 最近的，最新的
      'recent_beta.txt', // 最近的，较旧的
      'older_apple.txt', // 较旧的，按字母顺序
      'older_banana.txt', // 较旧的，按字母顺序
      'older_zebra.txt', // 较旧的，按字母顺序
    ]);
  });

  it('should sort only recent files by mtime descending', () => {
    const recentTime1 = new Date(nowTimestamp - 1000); // 最新的
    const recentTime2 = new Date(nowTimestamp - 2000);
    const recentTime3 = new Date(nowTimestamp - 3000); // 最旧的最近文件

    const entries: GlobPath[] = [
      createFileEntry('c.txt', recentTime2),
      createFileEntry('a.txt', recentTime3),
      createFileEntry('b.txt', recentTime1),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toEqual([
      'b.txt',
      'c.txt',
      'a.txt',
    ]);
  });

  it('should sort only older files alphabetically by path', () => {
    const olderTime = new Date(nowTimestamp - 2 * oneDayInMs); // 所有文件时间相同
    const entries: GlobPath[] = [
      createFileEntry('zebra.txt', olderTime),
      createFileEntry('apple.txt', olderTime),
      createFileEntry('banana.txt', olderTime),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toEqual([
      'apple.txt',
      'banana.txt',
      'zebra.txt',
    ]);
  });

  it('should handle an empty array', () => {
    const entries: GlobPath[] = [];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted).toEqual([]);
  });

  it('should correctly sort files when mtimes are identical for older files', () => {
    const olderTime = new Date(nowTimestamp - 2 * oneDayInMs);
    const entries: GlobPath[] = [
      createFileEntry('b.txt', olderTime),
      createFileEntry('a.txt', olderTime),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toEqual(['a.txt', 'b.txt']);
  });

  it('should correctly sort files when mtimes are identical for recent files (maintaining mtime sort)', () => {
    const recentTime = new Date(nowTimestamp - 1000);
    const entries: GlobPath[] = [
      createFileEntry('b.txt', recentTime),
      createFileEntry('a.txt', recentTime),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toContain('a.txt');
    expect(sorted.map((e) => e.fullpath())).toContain('b.txt');
    expect(sorted.length).toBe(2);
  });

  it('should use recencyThresholdMs parameter correctly', () => {
    const justOverThreshold = new Date(nowTimestamp - (1000 + 1)); // 刚好超过
    const justUnderThreshold = new Date(nowTimestamp - (1000 - 1)); // 刚好未超过
    const customThresholdMs = 1000; // 1 秒

    const entries: GlobPath[] = [
      createFileEntry('older_file.txt', justOverThreshold),
      createFileEntry('recent_file.txt', justUnderThreshold),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, customThresholdMs);
    expect(sorted.map((e) => e.fullpath())).toEqual([
      'recent_file.txt',
      'older_file.txt',
    ]);
  });
});