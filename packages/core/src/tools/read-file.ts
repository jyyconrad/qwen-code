/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import {
  isWithinRoot,
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * ReadFile 工具的参数
 */
export interface ReadFileToolParams {
  /**
   * 要读取的文件的绝对路径
   */
  absolute_path: string;

  /**
   * 开始读取的行号（可选）
   */
  offset?: number;

  /**
   * 要读取的行数（可选）
   */
  limit?: number;
}

/**
 * ReadFile 工具逻辑的实现
 */
export class ReadFileTool extends BaseTool<ReadFileToolParams, ToolResult> {
  static readonly Name: string = 'read_file';

  constructor(private config: Config) {
    super(
      ReadFileTool.Name,
      'ReadFile',
      '从本地文件系统读取并返回指定文件的内容。支持文本、图像（PNG、JPG、GIF、WEBP、SVG、BMP）和 PDF 文件。对于文本文件，可以读取特定的行范围。',
      {
        properties: {
          absolute_path: {
            description:
              "要读取的文件的绝对路径（例如 '/home/user/project/file.txt'）。不支持相对路径。您必须提供绝对路径。",
            type: Type.STRING,
          },
          offset: {
            description:
              "可选：对于文本文件，开始读取的基于 0 的行号。需要设置 'limit'。用于分页浏览大文件。",
            type: Type.NUMBER,
          },
          limit: {
            description:
              "可选：对于文本文件，要读取的最大行数。与 'offset' 一起使用以分页浏览大文件。如果省略，则读取整个文件（如果可行，最多到默认限制）。",
            type: Type.NUMBER,
          },
        },
        required: ['absolute_path'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: ReadFileToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    const filePath = params.absolute_path;
    if (!path.isAbsolute(filePath)) {
      return `文件路径必须是绝对路径，但却是相对路径：${filePath}。您必须提供绝对路径。`;
    }
    if (!isWithinRoot(filePath, this.config.getTargetDir())) {
      return `文件路径必须在根目录（${this.config.getTargetDir()}）内：${filePath}`;
    }
    if (params.offset !== undefined && params.offset < 0) {
      return '偏移量必须是非负数';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return '限制必须是正数';
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(params.absolute_path)) {
      return `文件路径 '${filePath}' 被 .geminiignore 模式忽略。`;
    }

    return null;
  }

  getDescription(params: ReadFileToolParams): string {
    if (
      !params ||
      typeof params.absolute_path !== 'string' ||
      params.absolute_path.trim() === ''
    ) {
      return `路径不可用`;
    }
    const relativePath = makeRelative(
      params.absolute_path,
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  async execute(
    params: ReadFileToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `错误：提供了无效参数。原因：${validationError}`,
        returnDisplay: validationError,
      };
    }

    const result = await processSingleFileContent(
      params.absolute_path,
      this.config.getTargetDir(),
      params.offset,
      params.limit,
    );

    if (result.error) {
      return {
        llmContent: result.error, // 供 LLM 使用的详细错误信息
        returnDisplay: result.returnDisplay, // 用户友好的错误信息
      };
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(params.absolute_path);
    recordFileOperationMetric(
      this.config,
      FileOperation.READ,
      lines,
      mimetype,
      path.extname(params.absolute_path),
    );

    return {
      llmContent: result.llmContent,
      returnDisplay: result.returnDisplay,
    };
  }
}