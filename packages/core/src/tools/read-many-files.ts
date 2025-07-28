/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import * as path from 'path';
import { glob } from 'glob';
import { getCurrentGeminiMdFilename } from './memoryTool.js';
import {
  detectFileType,
  processSingleFileContent,
  DEFAULT_ENCODING,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import { PartListUnion, Schema, Type } from '@google/genai';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * ReadManyFilesTool 的参数。
 */
export interface ReadManyFilesParams {
  /**
   * 要搜索的文件路径或目录路径数组。
   * 路径相对于工具配置的目标目录。
   * 可以在这些路径中直接使用 glob 模式。
   */
  paths: string[];

  /**
   * 可选。要包含的文件的 glob 模式。
   * 这些模式会与 `paths` 结合使用。
   * 示例: ["*.ts", "src/** /*.md"]
   */
  include?: string[];

  /**
   * 可选。要排除的文件/目录的 glob 模式。
   * 作为忽略模式应用。
   * 示例: ["*.log", "dist/**"]
   */
  exclude?: string[];

  /**
   * 可选。递归搜索目录。
   * 这通常由 glob 模式控制（例如，`**`）。
   * glob 实现默认对 `**` 进行递归。
   * 为简单起见，我们将依赖 `**` 进行递归。
   */
  recursive?: boolean;

  /**
   * 可选。应用默认排除模式。默认为 true。
   */
  useDefaultExcludes?: boolean;

  /**
   * 可选。是否遵循 .gitignore 模式。默认为 true。
   */
  respect_git_ignore?: boolean;
}

/**
 * 常见忽略目录和二进制文件类型的默认排除模式。
 * 这些与 glob 忽略模式兼容。
 * TODO(adh): 考虑通过命令行参数使其可配置或可扩展。
 * TODO(adh): 考虑与 glob 工具共享此列表。
 */
const DEFAULT_EXCLUDES: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.pyo',
  '**/*.bin',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.class',
  '**/*.jar',
  '**/*.war',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.bz2',
  '**/*.rar',
  '**/*.7z',
  '**/*.doc',
  '**/*.docx',
  '**/*.xls',
  '**/*.xlsx',
  '**/*.ppt',
  '**/*.pptx',
  '**/*.odt',
  '**/*.ods',
  '**/*.odp',
  '**/*.DS_Store',
  '**/.env',
  `**/${getCurrentGeminiMdFilename()}`,
];

const DEFAULT_OUTPUT_SEPARATOR_FORMAT = '--- {filePath} ---';

/**
 * 工具实现：在指定目标目录内从本地文件系统查找和读取多个文本文件。
 * 内容会被连接起来。
 * 它旨在运行在可以访问本地文件系统的环境中（例如，Node.js 后端）。
 */
export class ReadManyFilesTool extends BaseTool<
  ReadManyFilesParams,
  ToolResult
> {
  static readonly Name: string = 'read_many_files';

  private readonly geminiIgnorePatterns: string[] = [];

  constructor(private config: Config) {
    const parameterSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        paths: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            minLength: '1',
          },
          minItems: '1',
          description:
            "必需。相对于工具目标目录的 glob 模式或路径数组。示例: ['src/**/*.ts'], ['README.md', 'docs/']",
        },
        include: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            minLength: '1',
          },
          description:
            '可选。要包含的额外 glob 模式。这些会与 `paths` 合并。示例: ["*.test.ts"] 专门添加测试文件（如果它们被广泛排除）。',
          default: [],
        },
        exclude: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            minLength: '1',
          },
          description:
            '可选。要排除的文件/目录的 glob 模式。如果 useDefaultExcludes 为 true，则添加到默认排除项中。示例: ["**/*.log", "temp/"]',
          default: [],
        },
        recursive: {
          type: Type.BOOLEAN,
          description:
            '可选。是否递归搜索（主要由 glob 模式中的 `**` 控制）。默认为 true。',
          default: true,
        },
        useDefaultExcludes: {
          type: Type.BOOLEAN,
          description:
            '可选。是否应用默认排除模式列表（例如，node_modules, .git, 二进制文件）。默认为 true。',
          default: true,
        },
        respect_git_ignore: {
          type: Type.BOOLEAN,
          description:
            '可选。发现文件时是否遵循 .gitignore 模式。仅在 git 仓库中可用。默认为 true。',
          default: true,
        },
      },
      required: ['paths'],
    };

    super(
      ReadManyFilesTool.Name,
      'ReadManyFiles',
      `从配置的目标目录内读取由路径或 glob 模式指定的多个文件的内容。对于文本文件，它将它们的内容连接成单个字符串。它主要用于基于文本的文件。但是，如果在 'paths' 参数中明确包含图像（例如，.png, .jpg）和 PDF (.pdf) 文件的文件名或扩展名，它也可以处理这些文件。对于这些明确请求的非文本文件，它们的数据会被读取并包含在适合模型使用的格式中（例如，base64 编码）。

当您需要理解或分析一组文件时，此工具非常有用，例如：
- 概览代码库或其中的部分（例如，'src' 目录中的所有 TypeScript 文件）。
- 如果用户对代码提出广泛问题，查找特定功能的实现位置。
- 查看文档文件（例如，'docs' 目录中的所有 Markdown 文件）。
- 从多个配置文件收集上下文。
- 当用户要求"读取 X 目录中的所有文件"或"显示所有 Y 文件的内容"时。

当用户的查询暗示需要同时获取多个文件的内容以获取上下文、分析或总结时，请使用此工具。对于文本文件，它使用默认的 UTF-8 编码，并在文件内容之间使用 '--- {filePath} ---' 分隔符。确保路径相对于目标目录。支持 glob 模式，如 'src/**/*.js'。如果可用更具体的单文件读取工具，请避免用于单个文件，除非用户特别要求通过此工具处理仅包含一个文件的列表。其他二进制文件（未明确请求为图像/PDF）通常会被跳过。默认排除项适用于常见的非文本文件（明确请求的图像/PDF 除外）和大型依赖目录，除非 'useDefaultExcludes' 为 false。`,
      parameterSchema,
    );
    this.geminiIgnorePatterns = config
      .getFileService()
      .getGeminiIgnorePatterns();
  }

  validateParams(params: ReadManyFilesParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    return null;
  }

  getDescription(params: ReadManyFilesParams): string {
    const allPatterns = [...params.paths, ...(params.include || [])];
    const pathDesc = `使用模式: \`${allPatterns.join('`, `')}\` (在目标目录内: \`${this.config.getTargetDir()}\`)`;

    // 确定与 execute 方法中完全相同的最终排除模式列表
    const paramExcludes = params.exclude || [];
    const paramUseDefaultExcludes = params.useDefaultExcludes !== false;

    const finalExclusionPatternsForDescription: string[] =
      paramUseDefaultExcludes
        ? [...DEFAULT_EXCLUDES, ...paramExcludes, ...this.geminiIgnorePatterns]
        : [...paramExcludes, ...this.geminiIgnorePatterns];

    let excludeDesc = `排除: ${finalExclusionPatternsForDescription.length > 0 ? `类似 \`${finalExclusionPatternsForDescription.slice(0, 2).join('`, `')}${finalExclusionPatternsForDescription.length > 2 ? '...`' : '`'}` : '未指定'}`;

    // 如果 .geminiignore 模式贡献到了最终的排除列表，添加注释
    if (this.geminiIgnorePatterns.length > 0) {
      const geminiPatternsInEffect = this.geminiIgnorePatterns.filter((p) =>
        finalExclusionPatternsForDescription.includes(p),
      ).length;
      if (geminiPatternsInEffect > 0) {
        excludeDesc += ` (包括来自 .geminiignore 的 ${geminiPatternsInEffect} 个)`;
      }
    }

    return `将尝试读取并连接文件 ${pathDesc}。${excludeDesc}。文件编码: ${DEFAULT_ENCODING}。分隔符: "${DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace('{filePath}', 'path/to/file.ext')}"。`;
  }

  async execute(
    params: ReadManyFilesParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `错误: ${this.displayName} 的参数无效。原因: ${validationError}`,
        returnDisplay: `## 参数错误\n\n${validationError}`,
      };
    }

    const {
      paths: inputPatterns,
      include = [],
      exclude = [],
      useDefaultExcludes = true,
      respect_git_ignore = true,
    } = params;

    const respectGitIgnore =
      respect_git_ignore ?? this.config.getFileFilteringRespectGitIgnore();

    // 获取中心化的文件发现服务
    const fileDiscovery = this.config.getFileService();

    const filesToConsider = new Set<string>();
    const skippedFiles: Array<{ path: string; reason: string }> = [];
    const processedFilesRelativePaths: string[] = [];
    const contentParts: PartListUnion = [];

    const effectiveExcludes = useDefaultExcludes
      ? [...DEFAULT_EXCLUDES, ...exclude, ...this.geminiIgnorePatterns]
      : [...exclude, ...this.geminiIgnorePatterns];

    const searchPatterns = [...inputPatterns, ...include];
    if (searchPatterns.length === 0) {
      return {
        llmContent: '未提供搜索路径或包含模式。',
        returnDisplay: `## 信息\n\n未指定搜索路径或包含模式。无内容可读取或连接。`,
      };
    }

    try {
      const entries = await glob(searchPatterns, {
        cwd: this.config.getTargetDir(),
        ignore: effectiveExcludes,
        nodir: true,
        dot: true,
        absolute: true,
        nocase: true,
        signal,
      });

      const filteredEntries = respectGitIgnore
        ? fileDiscovery
            .filterFiles(
              entries.map((p) => path.relative(this.config.getTargetDir(), p)),
              {
                respectGitIgnore,
              },
            )
            .map((p) => path.resolve(this.config.getTargetDir(), p))
        : entries;

      let gitIgnoredCount = 0;
      for (const absoluteFilePath of entries) {
        // 安全检查：确保 glob 库没有返回目标目录外的内容。
        if (!absoluteFilePath.startsWith(this.config.getTargetDir())) {
          skippedFiles.push({
            path: absoluteFilePath,
            reason: `安全: Glob 库返回了目标目录外的路径。基础: ${this.config.getTargetDir()}, 路径: ${absoluteFilePath}`,
          });
          continue;
        }

        // 检查此文件是否被 git ignore 过滤掉
        if (respectGitIgnore && !filteredEntries.includes(absoluteFilePath)) {
          gitIgnoredCount++;
          continue;
        }

        filesToConsider.add(absoluteFilePath);
      }

      // 如果有任何文件被 git 忽略，添加相关信息
      if (gitIgnoredCount > 0) {
        skippedFiles.push({
          path: `${gitIgnoredCount} 个文件`,
          reason: '已忽略',
        });
      }
    } catch (error) {
      return {
        llmContent: `文件搜索期间出错: ${getErrorMessage(error)}`,
        returnDisplay: `## 文件搜索错误\n\n搜索文件时发生错误:\n\`\`\`\n${getErrorMessage(error)}\n\`\`\``,
      };
    }

    const sortedFiles = Array.from(filesToConsider).sort();

    for (const filePath of sortedFiles) {
      const relativePathForDisplay = path
        .relative(this.config.getTargetDir(), filePath)
        .replace(/\\/g, '/');

      const fileType = detectFileType(filePath);

      if (fileType === 'image' || fileType === 'pdf') {
        const fileExtension = path.extname(filePath).toLowerCase();
        const fileNameWithoutExtension = path.basename(filePath, fileExtension);
        const requestedExplicitly = inputPatterns.some(
          (pattern: string) =>
            pattern.toLowerCase().includes(fileExtension) ||
            pattern.includes(fileNameWithoutExtension),
        );

        if (!requestedExplicitly) {
          skippedFiles.push({
            path: relativePathForDisplay,
            reason:
              '资源文件（图像/PDF）未通过名称或扩展名明确请求',
          });
          continue;
        }
      }

      // 现在对所有文件类型使用 processSingleFileContent
      const fileReadResult = await processSingleFileContent(
        filePath,
        this.config.getTargetDir(),
      );

      if (fileReadResult.error) {
        skippedFiles.push({
          path: relativePathForDisplay,
          reason: `读取错误: ${fileReadResult.error}`,
        });
      } else {
        if (typeof fileReadResult.llmContent === 'string') {
          const separator = DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace(
            '{filePath}',
            filePath,
          );
          contentParts.push(`${separator}\n\n${fileReadResult.llmContent}\n\n`);
        } else {
          contentParts.push(fileReadResult.llmContent); // 这是图像/PDF 的 Part
        }
        processedFilesRelativePaths.push(relativePathForDisplay);
        const lines =
          typeof fileReadResult.llmContent === 'string'
            ? fileReadResult.llmContent.split('\n').length
            : undefined;
        const mimetype = getSpecificMimeType(filePath);
        recordFileOperationMetric(
          this.config,
          FileOperation.READ,
          lines,
          mimetype,
          path.extname(filePath),
        );
      }
    }

    let displayMessage = `### ReadManyFiles 结果 (目标目录: \`${this.config.getTargetDir()}\`)\n\n`;
    if (processedFilesRelativePaths.length > 0) {
      displayMessage += `成功读取并连接了 **${processedFilesRelativePaths.length} 个文件** 的内容。\n`;
      if (processedFilesRelativePaths.length <= 10) {
        displayMessage += `\n**已处理的文件:**\n`;
        processedFilesRelativePaths.forEach(
          (p) => (displayMessage += `- \`${p}\`\n`),
        );
      } else {
        displayMessage += `\n**已处理的文件 (显示前 10 个):**\n`;
        processedFilesRelativePaths
          .slice(0, 10)
          .forEach((p) => (displayMessage += `- \`${p}\`\n`));
        displayMessage += `- ...还有 ${processedFilesRelativePaths.length - 10} 个。\n`;
      }
    }

    if (skippedFiles.length > 0) {
      if (processedFilesRelativePaths.length === 0) {
        displayMessage += `根据条件未读取和连接任何文件。\n`;
      }
      if (skippedFiles.length <= 5) {
        displayMessage += `\n**跳过了 ${skippedFiles.length} 个项目:**\n`;
      } else {
        displayMessage += `\n**跳过了 ${skippedFiles.length} 个项目 (显示前 5 个):**\n`;
      }
      skippedFiles
        .slice(0, 5)
        .forEach(
          (f) => (displayMessage += `- \`${f.path}\` (原因: ${f.reason})\n`),
        );
      if (skippedFiles.length > 5) {
        displayMessage += `- ...还有 ${skippedFiles.length - 5} 个。\n`;
      }
    } else if (
      processedFilesRelativePaths.length === 0 &&
      skippedFiles.length === 0
    ) {
      displayMessage += `根据条件未读取和连接任何文件。\n`;
    }

    if (contentParts.length === 0) {
      contentParts.push(
        '未找到符合标准的文件或所有文件都被跳过。',
      );
    }
    return {
      llmContent: contentParts,
      returnDisplay: displayMessage.trim(),
    };
  }
}