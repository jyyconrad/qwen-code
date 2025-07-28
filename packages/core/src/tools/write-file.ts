/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import * as Diff from 'diff';
import { Config, ApprovalMode } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  FileDiff,
  ToolEditConfirmationDetails,
  ToolConfirmationOutcome,
  ToolCallConfirmationDetails,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
} from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';
import { getSpecificMimeType, isWithinRoot } from '../utils/fileUtils.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * 写入文件工具的参数
 */
export interface WriteFileToolParams {
  /**
   * 要写入的文件的绝对路径
   */
  file_path: string;

  /**
   * 要写入文件的内容
   */
  content: string;

  /**
   * 提议的内容是否被用户修改。
   */
  modified_by_user?: boolean;
}

interface GetCorrectedFileContentResult {
  originalContent: string;
  correctedContent: string;
  fileExists: boolean;
  error?: { message: string; code?: string };
}

/**
 * 写入文件工具逻辑的实现
 */
export class WriteFileTool
  extends BaseTool<WriteFileToolParams, ToolResult>
  implements ModifiableTool<WriteFileToolParams>
{
  static readonly Name: string = 'write_file';

  constructor(private readonly config: Config) {
    super(
      WriteFileTool.Name,
      'WriteFile',
      `将内容写入本地文件系统中的指定文件。
      
      用户可以修改 \`content\`。如果被修改，将在响应中说明。`,
      {
        properties: {
          file_path: {
            description:
              "要写入的文件的绝对路径（例如，'/home/user/project/file.txt'）。不支持相对路径。",
            type: Type.STRING,
          },
          content: {
            description: '要写入文件的内容。',
            type: Type.STRING,
          },
        },
        required: ['file_path', 'content'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: WriteFileToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    const filePath = params.file_path;
    if (!path.isAbsolute(filePath)) {
      return `文件路径必须是绝对路径: ${filePath}`;
    }
    if (!isWithinRoot(filePath, this.config.getTargetDir())) {
      return `文件路径必须在根目录内 (${this.config.getTargetDir()}): ${filePath}`;
    }

    try {
      // 此检查应仅在路径存在时执行。
      // 如果不存在，则为新文件，写入是有效的。
      if (fs.existsSync(filePath)) {
        const stats = fs.lstatSync(filePath);
        if (stats.isDirectory()) {
          return `路径是目录，不是文件: ${filePath}`;
        }
      }
    } catch (statError: unknown) {
      // 如果 fs.existsSync 为 true 但 lstatSync 失败（例如，权限问题，文件被删除的竞争条件）
      // 这表明访问路径存在问题，应报告。
      return `验证时访问路径属性出错: ${filePath}。原因: ${statError instanceof Error ? statError.message : String(statError)}`;
    }

    return null;
  }

  getDescription(params: WriteFileToolParams): string {
    if (!params.file_path || !params.content) {
      return `模型未提供有效的写入文件工具参数`;
    }
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    return `正在写入 ${shortenPath(relativePath)}`;
  }

  /**
   * 处理写入文件工具的确认提示。
   */
  async shouldConfirmExecute(
    params: WriteFileToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    const correctedContentResult = await this._getCorrectedFileContent(
      params.file_path,
      params.content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      // 如果文件存在但无法读取，我们无法显示差异以供确认。
      return false;
    }

    const { originalContent, correctedContent } = correctedContentResult;
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    const fileName = path.basename(params.file_path);

    const fileDiff = Diff.createPatch(
      fileName,
      originalContent, // 原始内容（如果为新文件或不可读则为空）
      correctedContent, // 潜在修正后的内容
      '当前',
      '提议',
      DEFAULT_DIFF_OPTIONS,
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `确认写入: ${shortenPath(relativePath)}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: WriteFileToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `错误: 提供了无效参数。原因: ${validationError}`,
        returnDisplay: `错误: ${validationError}`,
      };
    }

    const correctedContentResult = await this._getCorrectedFileContent(
      params.file_path,
      params.content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      const errDetails = correctedContentResult.error;
      const errorMsg = `检查现有文件时出错: ${errDetails.message}`;
      return {
        llmContent: `检查现有文件 ${params.file_path} 时出错: ${errDetails.message}`,
        returnDisplay: errorMsg,
      };
    }

    const {
      originalContent,
      correctedContent: fileContent,
      fileExists,
    } = correctedContentResult;
    // 如果文件存在（可读或不可读但被 readError 捕获），fileExists 为 true。
    // 如果文件不存在（ENOENT），fileExists 为 false。
    const isNewFile =
      !fileExists ||
      (correctedContentResult.error !== undefined &&
        !correctedContentResult.fileExists);

    try {
      const dirName = path.dirname(params.file_path);
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }

      fs.writeFileSync(params.file_path, fileContent, 'utf8');

      // 生成用于显示结果的差异
      const fileName = path.basename(params.file_path);
      // 如果有 readError，correctedContentResult 中的 originalContent 为空，
      // 但对于差异，我们希望尽可能显示写入前的原始内容。
      // 然而，如果不可读，currentContentForDiff 将为空。
      const currentContentForDiff = correctedContentResult.error
        ? '' // 或某些不可读内容的指示器
        : originalContent;

      const fileDiff = Diff.createPatch(
        fileName,
        currentContentForDiff,
        fileContent,
        '原始',
        '已写入',
        DEFAULT_DIFF_OPTIONS,
      );

      const llmSuccessMessageParts = [
        isNewFile
          ? `成功创建并写入新文件: ${params.file_path}。`
          : `成功覆盖文件: ${params.file_path}。`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(
          `用户修改了 \`content\` 为: ${params.content}`,
        );
      }

      const displayResult: FileDiff = { fileDiff, fileName };

      const lines = fileContent.split('\n').length;
      const mimetype = getSpecificMimeType(params.file_path);
      const extension = path.extname(params.file_path); // 获取扩展名
      if (isNewFile) {
        recordFileOperationMetric(
          this.config,
          FileOperation.CREATE,
          lines,
          mimetype,
          extension,
        );
      } else {
        recordFileOperationMetric(
          this.config,
          FileOperation.UPDATE,
          lines,
          mimetype,
          extension,
        );
      }

      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = `写入文件时出错: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: `写入文件 ${params.file_path} 时出错: ${errorMsg}`,
        returnDisplay: `错误: ${errorMsg}`,
      };
    }
  }

  private async _getCorrectedFileContent(
    filePath: string,
    proposedContent: string,
    abortSignal: AbortSignal,
  ): Promise<GetCorrectedFileContentResult> {
    let originalContent = '';
    let fileExists = false;
    let correctedContent = proposedContent;

    try {
      originalContent = fs.readFileSync(filePath, 'utf8');
      fileExists = true; // 文件存在且已读取
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        fileExists = false;
        originalContent = '';
      } else {
        // 文件存在但无法读取（权限等）
        fileExists = true; // 标记为存在但有问题
        originalContent = ''; // 无法使用其内容
        const error = {
          message: getErrorMessage(err),
          code: isNodeError(err) ? err.code : undefined,
        };
        // 提前返回，因为我们无法有意义地继续内容修正
        return { originalContent, correctedContent, fileExists, error };
      }
    }

    // 如果设置了 readError，我们已返回。
    // 因此，文件要么成功读取（fileExists=true，originalContent 已设置）
    // 要么是 ENOENT（fileExists=false，originalContent=''）。

    if (fileExists) {
      // 这意味着 originalContent 可用
      const { params: correctedParams } = await ensureCorrectEdit(
        filePath,
        originalContent,
        {
          old_string: originalContent, // 将整个当前内容视为 old_string
          new_string: proposedContent,
          file_path: filePath,
        },
        this.config.getGeminiClient(),
        abortSignal,
      );
      correctedContent = correctedParams.new_string;
    } else {
      // 这意味着新文件（ENOENT）
      correctedContent = await ensureCorrectFileContent(
        proposedContent,
        this.config.getGeminiClient(),
        abortSignal,
      );
    }
    return { originalContent, correctedContent, fileExists };
  }

  getModifyContext(
    abortSignal: AbortSignal,
  ): ModifyContext<WriteFileToolParams> {
    return {
      getFilePath: (params: WriteFileToolParams) => params.file_path,
      getCurrentContent: async (params: WriteFileToolParams) => {
        const correctedContentResult = await this._getCorrectedFileContent(
          params.file_path,
          params.content,
          abortSignal,
        );
        return correctedContentResult.originalContent;
      },
      getProposedContent: async (params: WriteFileToolParams) => {
        const correctedContentResult = await this._getCorrectedFileContent(
          params.file_path,
          params.content,
          abortSignal,
        );
        return correctedContentResult.correctedContent;
      },
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        originalParams: WriteFileToolParams,
      ) => ({
        ...originalParams,
        content: modifiedProposedContent,
        modified_by_user: true,
      }),
    };
  }
}