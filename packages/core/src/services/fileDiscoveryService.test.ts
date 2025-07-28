/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { FileDiscoveryService } from './fileDiscoveryService.js';
import { GitIgnoreParser } from '../utils/gitIgnoreParser.js';
import * as gitUtils from '../utils/gitUtils.js';

// 模拟 GitIgnoreParser
vi.mock('../utils/gitIgnoreParser.js');

// 模拟 gitUtils 模块
vi.mock('../utils/gitUtils.js');

describe('FileDiscoveryService', () => {
  let service: FileDiscoveryService;
  let mockGitIgnoreParser: Mocked<GitIgnoreParser>;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    mockGitIgnoreParser = {
      initialize: vi.fn(),
      isIgnored: vi.fn(),
      loadPatterns: vi.fn(),
      loadGitRepoPatterns: vi.fn(),
    } as unknown as Mocked<GitIgnoreParser>;

    vi.mocked(GitIgnoreParser).mockImplementation(() => mockGitIgnoreParser);
    vi.mocked(gitUtils.isGitRepository).mockReturnValue(true);
    vi.mocked(gitUtils.findGitRoot).mockReturnValue('/test/project');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始化', () => {
    it('默认应初始化 git ignore 解析器', () => {
      service = new FileDiscoveryService(mockProjectRoot);
      expect(GitIgnoreParser).toHaveBeenCalledWith(mockProjectRoot);
      expect(GitIgnoreParser).toHaveBeenCalledTimes(2);
      expect(mockGitIgnoreParser.loadGitRepoPatterns).toHaveBeenCalled();
      expect(mockGitIgnoreParser.loadPatterns).toHaveBeenCalled();
    });

    it('当不是 git 仓库时不应初始化 git ignore 解析器', () => {
      vi.mocked(gitUtils.isGitRepository).mockReturnValue(false);
      service = new FileDiscoveryService(mockProjectRoot);

      expect(GitIgnoreParser).toHaveBeenCalledOnce();
      expect(mockGitIgnoreParser.loadGitRepoPatterns).not.toHaveBeenCalled();
    });
  });

  describe('filterFiles', () => {
    beforeEach(() => {
      mockGitIgnoreParser.isIgnored.mockImplementation(
        (path: string) =>
          path.includes('node_modules') || path.includes('.git'),
      );
      service = new FileDiscoveryService(mockProjectRoot);
    });

    it('默认应过滤掉 git 忽略的文件', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        'README.md',
        '.git/config',
        'dist/bundle.js',
      ];

      const filtered = service.filterFiles(files);

      expect(filtered).toEqual(['src/index.ts', 'README.md', 'dist/bundle.js']);
    });

    it('当 respectGitIgnore 为 false 时不应对文件进行过滤', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        '.git/config',
      ];

      const filtered = service.filterFiles(files, { respectGitIgnore: false });

      expect(filtered).toEqual(files);
    });

    it('应处理空文件列表', () => {
      const filtered = service.filterFiles([]);
      expect(filtered).toEqual([]);
    });
  });

  describe('shouldGitIgnoreFile', () => {
    beforeEach(() => {
      mockGitIgnoreParser.isIgnored.mockImplementation((path: string) =>
        path.includes('node_modules'),
      );
      service = new FileDiscoveryService(mockProjectRoot);
    });

    it('应对 git 忽略的文件返回 true', () => {
      expect(service.shouldGitIgnoreFile('node_modules/package/index.js')).toBe(
        true,
      );
    });

    it('应对未忽略的文件返回 false', () => {
      expect(service.shouldGitIgnoreFile('src/index.ts')).toBe(false);
    });
  });

  describe('边界情况', () => {
    it('应处理相对项目根路径', () => {
      const relativeService = new FileDiscoveryService('./relative/path');
      expect(relativeService).toBeInstanceOf(FileDiscoveryService);
    });

    it('应处理带有未定义选项的 filterFiles', () => {
      const files = ['src/index.ts'];
      const filtered = service.filterFiles(files, undefined);
      expect(filtered).toEqual(files);
    });
  });
});