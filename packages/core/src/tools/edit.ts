/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ensureCorrectEdit } from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';
import { isWithinRoot } from '../utils/fileUtils.js';

/**
 * 编辑工具的参数
 */
export interface EditToolParams {
  /**
   * 要修改的文件的绝对路径
   */
  file_path: string;

  /**
   * 要替换的文本
   */
  old_string: string;

  /**
   * 替换后的文本
   */
  new_string: string;

  /**
   * 预期的替换次数。如果未指定，默认为 1。
   * 当你想替换多个匹配项时使用此参数。
   */
  expected_replacements?: number;

  /**
   * 编辑是否由用户手动修改。
   */
  modified_by_user?: boolean;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string };
  isNewFile: boolean;
}

/**
 * 编辑工具逻辑的实现
 */
export class EditTool
  extends BaseTool<EditToolParams, ToolResult>
  implements ModifiableTool<EditToolParams>
{
  static readonly Name = 'replace';

  constructor(private readonly config: Config) {
    super(
      EditTool.Name,
      '编辑',
      `在文件中替换文本。默认情况下，只替换一个匹配项，但如果指定了 \`expected_replacements\` 参数，则可以替换多个匹配项。此工具要求提供足够的上下文以确保精确匹配。在尝试替换文本之前，请始终使用 ${ReadFileTool.Name} 工具检查文件的当前内容。

      用户可以修改 \`new_string\` 的内容。如果被修改，响应中会说明。

参数要求：
1. \`file_path\` 必须是绝对路径；否则将抛出错误。
2. \`old_string\` 必须是精确的要替换的文字（包括所有空格、缩进、换行符和周围的代码等）。
3. \`new_string\` 必须是精确的用来替换 \`old_string\` 的文字（同样包括所有空格、缩进、换行符和周围的代码等）。请确保生成的代码是正确且符合语言习惯的。
4. 绝对不要对 \`old_string\` 或 \`new_string\` 进行转义，这会破坏精确文字的要求。
**重要提示：** 如果以上任何一项不满足，工具将失败。对于 \`old_string\` 至关重要：必须唯一标识要更改的单个实例。请至少包含目标文本前后的 3 行上下文，并精确匹配空格和缩进。如果此字符串匹配多个位置，或不完全匹配，工具将失败。
**多个替换：** 将 \`expected_replacements\` 设置为你想要替换的匹配项数量。工具将替换所有与 \`old_string\` 完全匹配的项。请确保替换数量与你的预期一致。`,
      {
        properties: {
          file_path: {
            description:
              "要修改的文件的绝对路径。必须以 '/' 开头。",
            type: Type.STRING,
          },
          old_string: {
            description:
              '要替换的精确文字，最好不转义。对于单个替换（默认情况），请至少包含目标文本前后的 3 行上下文，并精确匹配空格和缩进。对于多个替换，请指定 expected_replacements 参数。如果此字符串不是精确的文字（即你转义了它）或不完全匹配，工具将失败。',
            type: Type.STRING,
          },
          new_string: {
            description:
              '用来替换 `old_string` 的精确文字，最好不转义。提供 EXACT 文本。确保生成的代码是正确且符合语言习惯的。',
            type: Type.STRING,
          },
          expected_replacements: {
            type: Type.NUMBER,
            description:
              '预期的替换次数。如果未指定，默认为 1。当你想要替换多个匹配项时使用。',
            minimum: 1,
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
        type: Type.OBJECT,
      },
    );
  }

  /**
   * 验证编辑工具的参数
   * @param params 要验证的参数
   * @returns 错误消息字符串，如果有效则返回 null
   */
  validateToolParams(params: EditToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!path.isAbsolute(params.file_path)) {
      return `文件路径必须是绝对路径: ${params.file_path}`;
    }

    if (!isWithinRoot(params.file_path, this.config.getTargetDir())) {
      return `文件路径必须在根目录内 (${this.config.getTargetDir()}): ${params.file_path}`;
    }

    return null;
  }

  private _applyReplacement(
    currentContent: string | null,
    oldString: string,
    newString: string,
    isNewFile: boolean,
  ): string {
    if (isNewFile) {
      return newString;
    }
    if (currentContent === null) {
      // 如果不是新文件，这不应该发生，但防御性地返回空字符串或如果 oldString 也为空则返回 newString
      return oldString === '' ? newString : '';
    }
    // 如果 oldString 为空且不是新文件，不修改内容。
    if (oldString === '' && !isNewFile) {
      return currentContent;
    }
    return currentContent.replaceAll(oldString, newString);
  }

  /**
   * 计算编辑操作的潜在结果。
   * @param params 编辑操作的参数
   * @returns 描述潜在编辑结果的对象
   * @throws 文件系统错误，如果读取文件失败（例如权限问题）
   */
  private async calculateEdit(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<CalculatedEdit> {
    const expectedReplacements = params.expected_replacements ?? 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;
    let finalNewString = params.new_string;
    let finalOldString = params.old_string;
    let occurrences = 0;
    let error: { display: string; raw: string } | undefined = undefined;

    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
      // 规范化换行符为 LF 以确保一致处理。
      currentContent = currentContent.replace(/\r\n/g, '\n');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        // 重新抛出意外的文件系统错误（权限等）
        throw err;
      }
      fileExists = false;
    }

    if (params.old_string === '' && !fileExists) {
      // 创建新文件
      isNewFile = true;
    } else if (!fileExists) {
      // 尝试编辑不存在的文件（且 old_string 不为空）
      error = {
        display: `文件未找到。无法应用编辑。使用空的 old_string 来创建新文件。`,
        raw: `文件未找到: ${params.file_path}`,
      };
    } else if (currentContent !== null) {
      // 编辑现有文件
      const correctedEdit = await ensureCorrectEdit(
        params.file_path,
        currentContent,
        params,
        this.config.getGeminiClient(),
        abortSignal,
      );
      finalOldString = correctedEdit.params.old_string;
      finalNewString = correctedEdit.params.new_string;
      occurrences = correctedEdit.occurrences;

      if (params.old_string === '') {
        // 错误：尝试创建已存在的文件
        error = {
          display: `编辑失败。尝试创建已存在的文件。`,
          raw: `文件已存在，无法创建: ${params.file_path}`,
        };
      } else if (occurrences === 0) {
        error = {
          display: `编辑失败，找不到要替换的字符串。`,
          raw: `编辑失败，在 ${params.file_path} 中未找到 old_string 的匹配项。未进行任何编辑。old_string 中的确切文本未找到。请确保你没有错误地转义内容，并检查空格、缩进和上下文。使用 ${ReadFileTool.Name} 工具验证。`,
        };
      } else if (occurrences !== expectedReplacements) {
        const occurenceTerm =
          expectedReplacements === 1 ? '个匹配项' : '个匹配项';

        error = {
          display: `编辑失败，预期 ${expectedReplacements} ${occurenceTerm} 但找到 ${occurrences} 个。`,
          raw: `编辑失败，预期 ${expectedReplacements} ${occurenceTerm} 但找到 ${occurrences} 个匹配项，文件: ${params.file_path}`,
        };
      }
    } else {
      // 如果 fileExists 且没有抛出异常，这不应该发生，但防御性地：
      error = {
        display: `读取文件内容失败。`,
        raw: `读取现有文件内容失败: ${params.file_path}`,
      };
    }

    const newContent = this._applyReplacement(
      currentContent,
      finalOldString,
      finalNewString,
      isNewFile,
    );

    return {
      currentContent,
      newContent,
      occurrences,
      error,
      isNewFile,
    };
  }

  /**
   * 处理 CLI 中编辑工具的确认提示。
   * 需要计算差异以显示给用户。
   */
  async shouldConfirmExecute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[EditTool Wrapper] 尝试确认时参数无效: ${validationError}`,
      );
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, abortSignal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`准备编辑时出错: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      console.log(`错误: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent ?? '',
      editData.newContent,
      '当前',
      '建议',
      DEFAULT_DIFF_OPTIONS,
    );
    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `确认编辑: ${shortenPath(makeRelative(params.file_path, this.config.getTargetDir()))}`,
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

  getDescription(params: EditToolParams): string {
    if (!params.file_path || !params.old_string || !params.new_string) {
      return `模型未提供有效的编辑工具参数`;
    }
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    if (params.old_string === '') {
      return `创建 ${shortenPath(relativePath)}`;
    }

    const oldStringSnippet =
      params.old_string.split('\n')[0].substring(0, 30) +
      (params.old_string.length > 30 ? '...' : '');
    const newStringSnippet =
      params.new_string.split('\n')[0].substring(0, 30) +
      (params.new_string.length > 30 ? '...' : '');

    if (params.old_string === params.new_string) {
      return `无文件更改 ${shortenPath(relativePath)}`;
    }
    return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
  }

  /**
   * 使用给定参数执行编辑操作。
   * @param params 编辑操作的参数
   * @returns 编辑操作的结果
   */
  async execute(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `错误: 提供了无效参数。原因: ${validationError}`,
        returnDisplay: `错误: ${validationError}`,
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, signal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `准备编辑时出错: ${errorMsg}`,
        returnDisplay: `准备编辑时出错: ${errorMsg}`,
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `错误: ${editData.error.display}`,
      };
    }

    try {
      this.ensureParentDirectoriesExist(params.file_path);
      fs.writeFileSync(params.file_path, editData.newContent, 'utf8');

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `已创建 ${shortenPath(makeRelative(params.file_path, this.config.getTargetDir()))}`;
      } else {
        // 生成用于显示的差异，尽管核心逻辑在技术上不需要它
        // CLI 包装器将使用 ToolResult 的这部分
        const fileName = path.basename(params.file_path);
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '', // 如果不是 isNewFile，这里不应该为 null
          editData.newContent,
          '当前',
          '建议',
          DEFAULT_DIFF_OPTIONS,
        );
        displayResult = { fileDiff, fileName };
      }

      const llmSuccessMessageParts = [
        editData.isNewFile
          ? `已创建新文件: ${params.file_path} 并写入提供内容。`
          : `成功修改文件: ${params.file_path} (${editData.occurrences} 个替换)。`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(
          `用户修改了 \`new_string\` 内容为: ${params.new_string}。`,
        );
      }

      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `执行编辑时出错: ${errorMsg}`,
        returnDisplay: `写入文件时出错: ${errorMsg}`,
      };
    }
  }

  /**
   * 如果父目录不存在则创建它们
   */
  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        try {
          return fs.readFileSync(params.file_path, 'utf8');
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        try {
          const currentContent = fs.readFileSync(params.file_path, 'utf8');
          return this._applyReplacement(
            currentContent,
            params.old_string,
            params.new_string,
            params.old_string === '' && currentContent === '',
          );
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      createUpdatedParams: (
        oldContent: string,
        modifiedProposedContent: string,
        originalParams: EditToolParams,
      ): EditToolParams => ({
        ...originalParams,
        old_string: oldContent,
        new_string: modifiedProposedContent,
        modified_by_user: true,
      }),
    };
  }
}