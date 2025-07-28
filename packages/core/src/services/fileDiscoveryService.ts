/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitIgnoreParser, GitIgnoreFilter } from '../utils/gitIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'path';

const GEMINI_IGNORE_FILE_NAME = '.geminiignore';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private geminiIgnoreFilter: GitIgnoreFilter | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    if (isGitRepository(this.projectRoot)) {
      const parser = new GitIgnoreParser(this.projectRoot);
      try {
        parser.loadGitRepoPatterns();
      } catch (_error) {
        // 忽略文件未找到错误
      }
      this.gitIgnoreFilter = parser;
    }
    const gParser = new GitIgnoreParser(this.projectRoot);
    try {
      gParser.loadPatterns(GEMINI_IGNORE_FILE_NAME);
    } catch (_error) {
      // 忽略文件未找到错误
    }
    this.geminiIgnoreFilter = gParser;
  }

  /**
   * 根据 git ignore 规则过滤文件路径列表
   */
  filterFiles(
    filePaths: string[],
    options: FilterFilesOptions = {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
  ): string[] {
    return filePaths.filter((filePath) => {
      if (options.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
        return false;
      }
      if (
        options.respectGeminiIgnore &&
        this.shouldGeminiIgnoreFile(filePath)
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * 检查单个文件是否应被 git 忽略
   */
  shouldGitIgnoreFile(filePath: string): boolean {
    if (this.gitIgnoreFilter) {
      return this.gitIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * 检查单个文件是否应被 gemini 忽略
   */
  shouldGeminiIgnoreFile(filePath: string): boolean {
    if (this.geminiIgnoreFilter) {
      return this.geminiIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * 统一方法，根据过滤选项检查文件是否应被忽略
   */
  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    const { respectGitIgnore = true, respectGeminiIgnore = true } = options;

    if (respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
      return true;
    }
    if (respectGeminiIgnore && this.shouldGeminiIgnoreFile(filePath)) {
      return true;
    }
    return false;
  }

  /**
   * 返回从 .geminiignore 加载的模式
   */
  getGeminiIgnorePatterns(): string[] {
    return this.geminiIgnoreFilter?.getPatterns() ?? [];
  }
}