/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { Config } from '../config/config.js';
import { isWithinRoot } from '../utils/fileUtils.js';

/**
 * LS 工具的参数
 */
export interface LSToolParams {
  /**
   * 要列出的目录的绝对路径
   */
  path: string;

  /**
   * 要忽略的 glob 模式数组（可选）
   */
  ignore?: string[];

  /**
   * 是否遵循 .gitignore 模式（可选，默认为 true）
   */
  respect_git_ignore?: boolean;
}

/**
 * LS 工具返回的文件条目
 */
export interface FileEntry {
  /**
   * 文件或目录的名称
   */
  name: string;

  /**
   * 文件或目录的绝对路径
   */
  path: string;

  /**
   * 此条目是否为目录
   */
  isDirectory: boolean;

  /**
   * 文件大小（以字节为单位）（目录为 0）
   */
  size: number;

  /**
   * 最后修改时间戳
   */
  modifiedTime: Date;
}

/**
 * LS 工具逻辑的实现
 */
export class LSTool extends BaseTool<LSToolParams, ToolResult> {
  static readonly Name = 'list_directory';

  constructor(private config: Config) {
    super(
      LSTool.Name,
      'ReadFolder',
      '列出指定目录路径内直接包含的文件和子目录的名称。可选择性地忽略与提供的 glob 模式匹配的条目。',
      {
        properties: {
          path: {
            description:
              '要列出的目录的绝对路径（必须是绝对路径，不能是相对路径）',
            type: Type.STRING,
          },
          ignore: {
            description: '要忽略的 glob 模式列表',
            items: {
              type: Type.STRING,
            },
            type: Type.ARRAY,
          },
          respect_git_ignore: {
            description:
              '可选：列出文件时是否遵循 .gitignore 模式。仅在 git 仓库中可用。默认为 true。',
            type: Type.BOOLEAN,
          },
        },
        required: ['path'],
        type: Type.OBJECT,
      },
    );
  }

  /**
   * 验证工具的参数
   * @param params 要验证的参数
   * @returns 如果无效则返回错误消息字符串，否则返回 null
   */
  validateToolParams(params: LSToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    if (!path.isAbsolute(params.path)) {
      return `路径必须是绝对路径: ${params.path}`;
    }
    if (!isWithinRoot(params.path, this.config.getTargetDir())) {
      return `路径必须在根目录内 (${this.config.getTargetDir()}): ${params.path}`;
    }
    return null;
  }

  /**
   * 检查文件名是否匹配任何忽略模式
   * @param filename 要检查的文件名
   * @param patterns 要检查的 glob 模式数组
   * @returns 如果应忽略该文件名则返回 true
   */
  private shouldIgnore(filename: string, patterns?: string[]): boolean {
    if (!patterns || patterns.length === 0) {
      return false;
    }
    for (const pattern of patterns) {
      // 将 glob 模式转换为 RegExp
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(filename)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取文件读取操作的描述
   * @param params 文件读取的参数
   * @returns 描述正在读取的文件的字符串
   */
  getDescription(params: LSToolParams): string {
    const relativePath = makeRelative(params.path, this.config.getTargetDir());
    return shortenPath(relativePath);
  }

  // 用于一致的错误格式化的辅助函数
  private errorResult(llmContent: string, returnDisplay: string): ToolResult {
    return {
      llmContent,
      // 在核心逻辑中保持 returnDisplay 更简单
      returnDisplay: `错误: ${returnDisplay}`,
    };
  }

  /**
   * 使用给定参数执行 LS 操作
   * @param params LS 操作的参数
   * @returns LS 操作的结果
   */
  async execute(
    params: LSToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return this.errorResult(
        `错误: 提供了无效的参数。原因: ${validationError}`,
        `执行工具失败。`,
      );
    }

    try {
      const stats = fs.statSync(params.path);
      if (!stats) {
        // fs.statSync 在不存在时会抛出异常，因此此检查可能是多余的
        // 但为了清晰起见保留。错误消息已调整。
        return this.errorResult(
          `错误: 目录未找到或无法访问: ${params.path}`,
          `目录未找到或无法访问。`,
        );
      }
      if (!stats.isDirectory()) {
        return this.errorResult(
          `错误: 路径不是目录: ${params.path}`,
          `路径不是目录。`,
        );
      }

      const files = fs.readdirSync(params.path);

      // 获取集中式文件发现服务
      const respectGitIgnore =
        params.respect_git_ignore ??
        this.config.getFileFilteringRespectGitIgnore();
      const fileDiscovery = this.config.getFileService();

      const entries: FileEntry[] = [];
      let gitIgnoredCount = 0;

      if (files.length === 0) {
        // 更改为对 LLM 更中性的错误消息
        return {
          llmContent: `目录 ${params.path} 为空。`,
          returnDisplay: `目录为空。`,
        };
      }

      for (const file of files) {
        if (this.shouldIgnore(file, params.ignore)) {
          continue;
        }

        const fullPath = path.join(params.path, file);
        const relativePath = path.relative(
          this.config.getTargetDir(),
          fullPath,
        );

        // 检查此文件是否应被 git 忽略（仅在 git 仓库中）
        if (
          respectGitIgnore &&
          fileDiscovery.shouldGitIgnoreFile(relativePath)
        ) {
          gitIgnoredCount++;
          continue;
        }

        try {
          const stats = fs.statSync(fullPath);
          const isDir = stats.isDirectory();
          entries.push({
            name: file,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : stats.size,
            modifiedTime: stats.mtime,
          });
        } catch (error) {
          // 内部记录错误但不使整个列表失败
          console.error(`访问 ${fullPath} 时出错: ${error}`);
        }
      }

      // 对条目进行排序（目录优先，然后按字母顺序）
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      // 为 LLM 创建格式化内容
      const directoryContent = entries
        .map((entry) => `${entry.isDirectory ? '[DIR] ' : ''}${entry.name}`)
        .join('\n');

      let resultMessage = `目录 ${params.path} 的列表:\n${directoryContent}`;
      if (gitIgnoredCount > 0) {
        resultMessage += `\n\n(${gitIgnoredCount} 个项目被 git 忽略)`;
      }

      let displayMessage = `列出了 ${entries.length} 个项目。`;
      if (gitIgnoredCount > 0) {
        displayMessage += ` (${gitIgnoredCount} 个被 git 忽略)`;
      }

      return {
        llmContent: resultMessage,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMsg = `列出目录时出错: ${error instanceof Error ? error.message : String(error)}`;
      return this.errorResult(errorMsg, '列出目录失败。');
    }
  }
}