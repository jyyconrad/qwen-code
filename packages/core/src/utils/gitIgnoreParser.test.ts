/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitIgnoreParser } from './gitIgnoreParser.js';
import * as fs from 'fs';
import * as path from 'path';
import { isGitRepository } from './gitUtils.js';

// 模拟 fs 模块
vi.mock('fs');

// 模拟 gitUtils 模块
vi.mock('./gitUtils.js');

describe('GitIgnoreParser', () => {
  let parser: GitIgnoreParser;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    parser = new GitIgnoreParser(mockProjectRoot);
    // 在每次测试前重置模拟
    vi.mocked(fs.readFileSync).mockClear();
    vi.mocked(isGitRepository).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始化', () => {
    it('当不存在 .gitignore 时应无错误初始化', () => {
      expect(() => parser.loadGitRepoPatterns()).not.toThrow();
    });

    it('当文件存在时应加载 .gitignore 模式', () => {
      const gitignoreContent = `
# 注释
node_modules/
*.log
/dist
.env
`;
      vi.mocked(fs.readFileSync).mockReturnValueOnce(gitignoreContent);

      parser.loadGitRepoPatterns();

      expect(parser.getPatterns()).toEqual([
        '.git',
        'node_modules/',
        '*.log',
        '/dist',
        '.env',
      ]);
      expect(parser.isIgnored('node_modules/some-lib')).toBe(true);
      expect(parser.isIgnored('src/app.log')).toBe(true);
      expect(parser.isIgnored('dist/index.js')).toBe(true);
      expect(parser.isIgnored('.env')).toBe(true);
    });

    it('应处理 git 排除文件', () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (
          filePath === path.join(mockProjectRoot, '.git', 'info', 'exclude')
        ) {
          return 'temp/\n*.tmp';
        }
        throw new Error('ENOENT');
      });

      parser.loadGitRepoPatterns();
      expect(parser.getPatterns()).toEqual(['.git', 'temp/', '*.tmp']);
      expect(parser.isIgnored('temp/file.txt')).toBe(true);
      expect(parser.isIgnored('src/file.tmp')).toBe(true);
    });

    it('应处理自定义模式文件名', () => {
      vi.mocked(isGitRepository).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join(mockProjectRoot, '.geminiignore')) {
          return 'temp/\n*.tmp';
        }
        throw new Error('ENOENT');
      });

      parser.loadPatterns('.geminiignore');
      expect(parser.getPatterns()).toEqual(['temp/', '*.tmp']);
      expect(parser.isIgnored('temp/file.txt')).toBe(true);
      expect(parser.isIgnored('src/file.tmp')).toBe(true);
    });

    it('当不存在 .geminiignore 时应无错误初始化', () => {
      expect(() => parser.loadPatterns('.geminiignore')).not.toThrow();
    });
  });

  describe('isIgnored', () => {
    beforeEach(() => {
      const gitignoreContent = `
node_modules/
*.log
/dist
/.env
src/*.tmp
!src/important.tmp
`;
      vi.mocked(fs.readFileSync).mockReturnValueOnce(gitignoreContent);
      parser.loadGitRepoPatterns();
    });

    it('应始终忽略 .git 目录', () => {
      expect(parser.isIgnored('.git')).toBe(true);
      expect(parser.isIgnored('.git/config')).toBe(true);
      expect(parser.isIgnored(path.join(mockProjectRoot, '.git', 'HEAD'))).toBe(
        true,
      );
    });

    it('应忽略匹配模式的文件', () => {
      expect(parser.isIgnored('node_modules/package/index.js')).toBe(true);
      expect(parser.isIgnored('app.log')).toBe(true);
      expect(parser.isIgnored('logs/app.log')).toBe(true);
      expect(parser.isIgnored('dist/bundle.js')).toBe(true);
      expect(parser.isIgnored('.env')).toBe(true);
      expect(parser.isIgnored('config/.env')).toBe(false); // .env 锚定到根目录
    });

    it('应忽略具有路径特定模式的文件', () => {
      expect(parser.isIgnored('src/temp.tmp')).toBe(true);
      expect(parser.isIgnored('other/temp.tmp')).toBe(false);
    });

    it('应处理否定模式', () => {
      expect(parser.isIgnored('src/important.tmp')).toBe(false);
    });

    it('不应忽略不匹配模式的文件', () => {
      expect(parser.isIgnored('src/index.ts')).toBe(false);
      expect(parser.isIgnored('README.md')).toBe(false);
    });

    it('应正确处理绝对路径', () => {
      const absolutePath = path.join(mockProjectRoot, 'node_modules', 'lib');
      expect(parser.isIgnored(absolutePath)).toBe(true);
    });

    it('应通过不忽略它们来处理项目根目录外的路径', () => {
      const outsidePath = path.resolve(mockProjectRoot, '../other/file.txt');
      expect(parser.isIgnored(outsidePath)).toBe(false);
    });

    it('应正确处理相对路径', () => {
      expect(parser.isIgnored('node_modules/some-package')).toBe(true);
      expect(parser.isIgnored('../some/other/file.txt')).toBe(false);
    });

    it('应在 Windows 上规范化路径分隔符', () => {
      expect(parser.isIgnored('node_modules\\package')).toBe(true);
      expect(parser.isIgnored('src\\temp.tmp')).toBe(true);
    });
  });

  describe('getIgnoredPatterns', () => {
    it('应返回添加的原始模式', () => {
      const gitignoreContent = '*.log\n!important.log';
      vi.mocked(fs.readFileSync).mockReturnValueOnce(gitignoreContent);

      parser.loadGitRepoPatterns();
      expect(parser.getPatterns()).toEqual(['.git', '*.log', '!important.log']);
    });
  });
});