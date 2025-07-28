/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { shortenPath, makeRelative } from '../utils/paths.js';
import { isWithinRoot } from '../utils/fileUtils.js';
import { Config } from '../config/config.js';

// Subset of 'Path' interface provided by 'glob' that we can implement for testing
export interface GlobPath {
  fullpath(): string;
  mtimeMs?: number;
}

/**
 * 根据最近修改时间和字母顺序对文件条目进行排序。
 * 最近的文件（在 recencyThresholdMs 内修改的）排在前面，从最新到最旧。
 * 较旧的文件排在最近文件之后，按路径字母顺序排序。
 */
export function sortFileEntries(
  entries: GlobPath[],
  nowTimestamp: number,
  recencyThresholdMs: number,
): GlobPath[] {
  const sortedEntries = [...entries];
  sortedEntries.sort((a, b) => {
    const mtimeA = a.mtimeMs ?? 0;
    const mtimeB = b.mtimeMs ?? 0;
    const aIsRecent = nowTimestamp - mtimeA < recencyThresholdMs;
    const bIsRecent = nowTimestamp - mtimeB < recencyThresholdMs;

    if (aIsRecent && bIsRecent) {
      return mtimeB - mtimeA;
    } else if (aIsRecent) {
      return -1;
    } else if (bIsRecent) {
      return 1;
    } else {
      return a.fullpath().localeCompare(b.fullpath());
    }
  });
  return sortedEntries;
}

/**
 * GlobTool 的参数
 */
export interface GlobToolParams {
  /**
   * 用于匹配文件的 glob 模式
   */
  pattern: string;

  /**
   * 要搜索的目录（可选，默认为当前目录）
   */
  path?: string;

  /**
   * 搜索是否应区分大小写（可选，默认为 false）
   */
  case_sensitive?: boolean;

  /**
   * 是否应遵循 .gitignore 模式（可选，默认为 true）
   */
  respect_git_ignore?: boolean;
}

/**
 * Glob 工具逻辑的实现
 */
export class GlobTool extends BaseTool<GlobToolParams, ToolResult> {
  static readonly Name = 'glob';

  constructor(private config: Config) {
    super(
      GlobTool.Name,
      'FindFiles',
      '高效查找匹配特定 glob 模式（例如 `src/**/*.ts`、`**/*.md`）的文件，返回按修改时间排序的绝对路径（最新优先）。非常适合根据文件名或路径结构快速定位文件，尤其是在大型代码库中。',
      {
        properties: {
          pattern: {
            description:
              "要匹配的 glob 模式（例如，'**/*.py'、'docs/*.md'）。",
            type: Type.STRING,
          },
          path: {
            description:
              '可选：要搜索的目录的绝对路径。如果省略，则搜索根目录。',
            type: Type.STRING,
          },
          case_sensitive: {
            description:
              '可选：搜索是否应区分大小写。默认为 false。',
            type: Type.BOOLEAN,
          },
          respect_git_ignore: {
            description:
              '可选：查找文件时是否应遵循 .gitignore 模式。仅在 git 仓库中可用。默认为 true。',
            type: Type.BOOLEAN,
          },
        },
        required: ['pattern'],
        type: Type.OBJECT,
      },
    );
  }

  /**
   * 验证工具的参数。
   */
  validateToolParams(params: GlobToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    const searchDirAbsolute = path.resolve(
      this.config.getTargetDir(),
      params.path || '.',
    );

    if (!isWithinRoot(searchDirAbsolute, this.config.getTargetDir())) {
      return `搜索路径 ("${searchDirAbsolute}") 解析到工具根目录 ("${this.config.getTargetDir()}") 外部。`;
    }

    const targetDir = searchDirAbsolute || this.config.getTargetDir();
    try {
      if (!fs.existsSync(targetDir)) {
        return `搜索路径不存在 ${targetDir}`;
      }
      if (!fs.statSync(targetDir).isDirectory()) {
        return `搜索路径不是目录: ${targetDir}`;
      }
    } catch (e: unknown) {
      return `访问搜索路径时出错: ${e}`;
    }

    if (
      !params.pattern ||
      typeof params.pattern !== 'string' ||
      params.pattern.trim() === ''
    ) {
      return "'pattern' 参数不能为空。";
    }

    return null;
  }

  /**
   * 获取 glob 操作的描述。
   */
  getDescription(params: GlobToolParams): string {
    let description = `'${params.pattern}'`;
    if (params.path) {
      const searchDir = path.resolve(
        this.config.getTargetDir(),
        params.path || '.',
      );
      const relativePath = makeRelative(searchDir, this.config.getTargetDir());
      description += ` 在 ${shortenPath(relativePath)} 内`;
    }
    return description;
  }

  /**
   * 使用给定参数执行 glob 搜索
   */
  async execute(
    params: GlobToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `错误: 提供了无效参数。原因: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    try {
      const searchDirAbsolute = path.resolve(
        this.config.getTargetDir(),
        params.path || '.',
      );

      // 获取集中式文件发现服务
      const respectGitIgnore =
        params.respect_git_ignore ??
        this.config.getFileFilteringRespectGitIgnore();
      const fileDiscovery = this.config.getFileService();

      const entries = (await glob(params.pattern, {
        cwd: searchDirAbsolute,
        withFileTypes: true,
        nodir: true,
        stat: true,
        nocase: !params.case_sensitive,
        dot: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
        follow: false,
        signal,
      })) as GlobPath[];

      // 如果启用且在 git 仓库中，则应用 git 感知过滤
      let filteredEntries = entries;
      let gitIgnoredCount = 0;

      if (respectGitIgnore) {
        const relativePaths = entries.map((p) =>
          path.relative(this.config.getTargetDir(), p.fullpath()),
        );
        const filteredRelativePaths = fileDiscovery.filterFiles(relativePaths, {
          respectGitIgnore,
        });
        const filteredAbsolutePaths = new Set(
          filteredRelativePaths.map((p) =>
            path.resolve(this.config.getTargetDir(), p),
          ),
        );

        filteredEntries = entries.filter((entry) =>
          filteredAbsolutePaths.has(entry.fullpath()),
        );
        gitIgnoredCount = entries.length - filteredEntries.length;
      }

      if (!filteredEntries || filteredEntries.length === 0) {
        let message = `在 ${searchDirAbsolute} 中未找到匹配模式 "${params.pattern}" 的文件。`;
        if (gitIgnoredCount > 0) {
          message += ` (${gitIgnoredCount} 个文件被 git 忽略)`;
        }
        return {
          llmContent: message,
          returnDisplay: `未找到文件`,
        };
      }

      // 设置过滤，使我们首先显示最近的文件
      const oneDayInMs = 24 * 60 * 60 * 1000;
      const nowTimestamp = new Date().getTime();

      // 使用新的辅助函数对过滤后的条目进行排序
      const sortedEntries = sortFileEntries(
        filteredEntries,
        nowTimestamp,
        oneDayInMs,
      );

      const sortedAbsolutePaths = sortedEntries.map((entry) =>
        entry.fullpath(),
      );
      const fileListDescription = sortedAbsolutePaths.join('\n');
      const fileCount = sortedAbsolutePaths.length;

      let resultMessage = `在 ${searchDirAbsolute} 中找到 ${fileCount} 个匹配 "${params.pattern}" 的文件`;
      if (gitIgnoredCount > 0) {
        resultMessage += ` (${gitIgnoredCount} 个额外文件被 git 忽略)`;
      }
      resultMessage += `，按修改时间排序（最新优先）:\n${fileListDescription}`;

      return {
        llmContent: resultMessage,
        returnDisplay: `找到 ${fileCount} 个匹配文件`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`GlobLogic execute Error: ${errorMessage}`, error);
      return {
        llmContent: `glob 搜索操作期间出错: ${errorMessage}`,
        returnDisplay: `错误: 发生意外错误。`,
      };
    }
  }
}