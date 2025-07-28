/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { EOL } from 'os';
import { spawn } from 'child_process';
import { globStream } from 'glob';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { isGitRepository } from '../utils/gitUtils.js';
import { Config } from '../config/config.js';

// --- 接口定义 ---

/**
 * GrepTool 的参数
 */
export interface GrepToolParams {
  /**
   * 要在文件内容中搜索的正则表达式模式
   */
  pattern: string;

  /**
   * 要搜索的目录（可选，默认为相对于根目录的当前目录）
   */
  path?: string;

  /**
   * 要包含在搜索中的文件模式（例如 "*.js", "*.{ts,tsx}"）
   */
  include?: string;
}

/**
 * 单个 grep 匹配的结果对象
 */
interface GrepMatch {
  filePath: string;
  lineNumber: number;
  line: string;
}

// --- GrepLogic 类 ---

/**
 * Grep 工具逻辑的实现（从 CLI 移动而来）
 */
export class GrepTool extends BaseTool<GrepToolParams, ToolResult> {
  static readonly Name = 'search_file_content'; // 保持静态名称

  constructor(private readonly config: Config) {
    super(
      GrepTool.Name,
      'SearchText',
      '在指定目录（或当前工作目录）的文件内容中搜索正则表达式模式。可以按 glob 模式过滤文件。返回包含匹配项的行，以及它们的文件路径和行号。',
      {
        properties: {
          pattern: {
            description:
              "要在文件内容中搜索的正则表达式（regex）模式（例如 'function\\s+myFunction', 'import\\s+\\{.*\\}\\s+from\\s+.*'）。",
            type: Type.STRING,
          },
          path: {
            description:
              '可选：要搜索的目录的绝对路径。如果省略，则搜索当前工作目录。',
            type: Type.STRING,
          },
          include: {
            description:
              "可选：用于过滤要搜索的文件的 glob 模式（例如 '*.js', '*.{ts,tsx}', 'src/**'）。如果省略，则搜索所有文件（遵循潜在的全局忽略规则）。",
            type: Type.STRING,
          },
        },
        required: ['pattern'],
        type: Type.OBJECT,
      },
    );
  }

  // --- 验证方法 ---

  /**
   * 检查路径是否在根目录内并解析它。
   * @param relativePath 相对于根目录的路径（或未定义表示根目录）。
   * @returns 如果有效且存在，则返回绝对路径。
   * @throws {Error} 如果路径在根目录外、不存在或不是目录。
   */
  private resolveAndValidatePath(relativePath?: string): string {
    const targetPath = path.resolve(
      this.config.getTargetDir(),
      relativePath || '.',
    );

    // 安全检查：确保解析后的路径仍在根目录内。
    if (
      !targetPath.startsWith(this.config.getTargetDir()) &&
      targetPath !== this.config.getTargetDir()
    ) {
      throw new Error(
        `路径验证失败：尝试的路径 "${relativePath || '.'}" 解析后超出了允许的根目录 "${this.config.getTargetDir()}"。`,
      );
    }

    // 检查存在性和类型
    try {
      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        throw new Error(`路径不是目录: ${targetPath}`);
      }
    } catch (error: unknown) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw new Error(`路径不存在: ${targetPath}`);
      }
      throw new Error(
        `无法访问路径 ${targetPath} 的状态: ${error}`,
      );
    }

    return targetPath;
  }

  /**
   * 验证工具的参数
   * @param params 要验证的参数
   * @returns 如果无效则返回错误消息字符串，否则返回 null
   */
  validateToolParams(params: GrepToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    try {
      new RegExp(params.pattern);
    } catch (error) {
      return `提供的正则表达式模式无效: ${params.pattern}. 错误: ${getErrorMessage(error)}`;
    }

    try {
      this.resolveAndValidatePath(params.path);
    } catch (error) {
      return getErrorMessage(error);
    }

    return null; // 参数有效
  }

  // --- 核心执行 ---

  /**
   * 使用给定参数执行 grep 搜索
   * @param params grep 搜索的参数
   * @returns grep 搜索的结果
   */
  async execute(
    params: GrepToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `错误: 提供了无效参数。原因: ${validationError}`,
        returnDisplay: `模型提供了无效参数。错误: ${validationError}`,
      };
    }

    let searchDirAbs: string;
    try {
      searchDirAbs = this.resolveAndValidatePath(params.path);
      const searchDirDisplay = params.path || '.';

      const matches: GrepMatch[] = await this.performGrepSearch({
        pattern: params.pattern,
        path: searchDirAbs,
        include: params.include,
        signal,
      });

      if (matches.length === 0) {
        const noMatchMsg = `在路径 "${searchDirDisplay}" 中未找到模式 "${params.pattern}" 的匹配项${params.include ? ` (过滤器: "${params.include}")` : ''}。`;
        return { llmContent: noMatchMsg, returnDisplay: `未找到匹配项` };
      }

      const matchesByFile = matches.reduce(
        (acc, match) => {
          const relativeFilePath =
            path.relative(
              searchDirAbs,
              path.resolve(searchDirAbs, match.filePath),
            ) || path.basename(match.filePath);
          if (!acc[relativeFilePath]) {
            acc[relativeFilePath] = [];
          }
          acc[relativeFilePath].push(match);
          acc[relativeFilePath].sort((a, b) => a.lineNumber - b.lineNumber);
          return acc;
        },
        {} as Record<string, GrepMatch[]>,
      );

      const matchCount = matches.length;
      const matchTerm = matchCount === 1 ? '个匹配项' : '个匹配项';

      let llmContent = `在路径 "${searchDirDisplay}" 中找到 ${matchCount} ${matchTerm}，模式为 "${params.pattern}"${params.include ? ` (过滤器: "${params.include}")` : ''}:\n---\n`;

      for (const filePath in matchesByFile) {
        llmContent += `文件: ${filePath}\n`;
        matchesByFile[filePath].forEach((match) => {
          const trimmedLine = match.line.trim();
          llmContent += `L${match.lineNumber}: ${trimmedLine}\n`;
        });
        llmContent += '---\n';
      }

      return {
        llmContent: llmContent.trim(),
        returnDisplay: `找到 ${matchCount} ${matchTerm}`,
      };
    } catch (error) {
      console.error(`GrepLogic 执行期间出错: ${error}`);
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `grep 搜索操作期间出错: ${errorMessage}`,
        returnDisplay: `错误: ${errorMessage}`,
      };
    }
  }

  // --- Grep 实现逻辑 ---

  /**
   * 检查命令是否在系统的 PATH 中可用。
   * @param {string} command 命令名称（例如 'git', 'grep'）。
   * @returns {Promise<boolean>} 如果命令可用则返回 true，否则返回 false。
   */
  private isCommandAvailable(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkCommand = process.platform === 'win32' ? 'where' : 'command';
      const checkArgs =
        process.platform === 'win32' ? [command] : ['-v', command];
      try {
        const child = spawn(checkCommand, checkArgs, {
          stdio: 'ignore',
          shell: process.platform === 'win32',
        });
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * 解析类似 grep 命令（git grep, system grep）的标准输出。
   * 期望格式: filePath:lineNumber:lineContent
   * 正确处理文件路径和行内容中的冒号。
   * @param {string} output 原始的 stdout 字符串。
   * @param {string} basePath 搜索运行的绝对目录，用于相对路径。
   * @returns {GrepMatch[]} 匹配对象数组。
   */
  private parseGrepOutput(output: string, basePath: string): GrepMatch[] {
    const results: GrepMatch[] = [];
    if (!output) return results;

    const lines = output.split(EOL); // 使用操作系统特定的行结束符

    for (const line of lines) {
      if (!line.trim()) continue;

      // 找到第一个冒号的索引。
      const firstColonIndex = line.indexOf(':');
      if (firstColonIndex === -1) continue; // 格式错误

      // 找到第二个冒号的索引，在第一个冒号之后搜索。
      const secondColonIndex = line.indexOf(':', firstColonIndex + 1);
      if (secondColonIndex === -1) continue; // 格式错误

      // 根据找到的冒号索引提取各部分
      const filePathRaw = line.substring(0, firstColonIndex);
      const lineNumberStr = line.substring(
        firstColonIndex + 1,
        secondColonIndex,
      );
      const lineContent = line.substring(secondColonIndex + 1);

      const lineNumber = parseInt(lineNumberStr, 10);

      if (!isNaN(lineNumber)) {
        const absoluteFilePath = path.resolve(basePath, filePathRaw);
        const relativeFilePath = path.relative(basePath, absoluteFilePath);

        results.push({
          filePath: relativeFilePath || path.basename(absoluteFilePath),
          lineNumber,
          line: lineContent,
        });
      }
    }
    return results;
  }

  /**
   * 获取 grep 操作的描述
   * @param params grep 操作的参数
   * @returns 描述 grep 的字符串
   */
  getDescription(params: GrepToolParams): string {
    let description = `'${params.pattern}'`;
    if (params.include) {
      description += ` 在 ${params.include} 中`;
    }
    if (params.path) {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        params.path,
      );
      if (resolvedPath === this.config.getTargetDir() || params.path === '.') {
        description += ` 于 ./ 内`;
      } else {
        const relativePath = makeRelative(
          resolvedPath,
          this.config.getTargetDir(),
        );
        description += ` 于 ${shortenPath(relativePath)} 内`;
      }
    }
    return description;
  }

  /**
   * 使用优先策略执行实际搜索。
   * @param options 搜索选项，包括模式、绝对路径和包含 glob。
   * @returns 解析为匹配对象数组的 Promise。
   */
  private async performGrepSearch(options: {
    pattern: string;
    path: string; // 期望绝对路径
    include?: string;
    signal: AbortSignal;
  }): Promise<GrepMatch[]> {
    const { pattern, path: absolutePath, include } = options;
    let strategyUsed = 'none';

    try {
      // --- 策略 1: git grep ---
      const isGit = isGitRepository(absolutePath);
      const gitAvailable = isGit && (await this.isCommandAvailable('git'));

      if (gitAvailable) {
        strategyUsed = 'git grep';
        const gitArgs = [
          'grep',
          '--untracked',
          '-n',
          '-E',
          '--ignore-case',
          pattern,
        ];
        if (include) {
          gitArgs.push('--', include);
        }

        try {
          const output = await new Promise<string>((resolve, reject) => {
            const child = spawn('git', gitArgs, {
              cwd: absolutePath,
              windowsHide: true,
            });
            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];

            child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
            child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
            child.on('error', (err) =>
              reject(new Error(`无法启动 git grep: ${err.message}`)),
            );
            child.on('close', (code) => {
              const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
              const stderrData = Buffer.concat(stderrChunks).toString('utf8');
              if (code === 0) resolve(stdoutData);
              else if (code === 1)
                resolve(''); // 无匹配项
              else
                reject(
                  new Error(`git grep 退出码为 ${code}: ${stderrData}`),
                );
            });
          });
          return this.parseGrepOutput(output, absolutePath);
        } catch (gitError: unknown) {
          console.debug(
            `GrepLogic: git grep 失败: ${getErrorMessage(gitError)}. 回退到其他策略...`,
          );
        }
      }

      // --- 策略 2: 系统 grep ---
      const grepAvailable = await this.isCommandAvailable('grep');
      if (grepAvailable) {
        strategyUsed = 'system grep';
        const grepArgs = ['-r', '-n', '-H', '-E'];
        const commonExcludes = ['.git', 'node_modules', 'bower_components'];
        commonExcludes.forEach((dir) => grepArgs.push(`--exclude-dir=${dir}`));
        if (include) {
          grepArgs.push(`--include=${include}`);
        }
        grepArgs.push(pattern);
        grepArgs.push('.');

        try {
          const output = await new Promise<string>((resolve, reject) => {
            const child = spawn('grep', grepArgs, {
              cwd: absolutePath,
              windowsHide: true,
            });
            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];

            const onData = (chunk: Buffer) => stdoutChunks.push(chunk);
            const onStderr = (chunk: Buffer) => {
              const stderrStr = chunk.toString();
              // 抑制常见的无害 stderr 消息
              if (
                !stderrStr.includes('Permission denied') &&
                !/grep:.*: Is a directory/i.test(stderrStr)
              ) {
                stderrChunks.push(chunk);
              }
            };
            const onError = (err: Error) => {
              cleanup();
              reject(new Error(`无法启动系统 grep: ${err.message}`));
            };
            const onClose = (code: number | null) => {
              const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
              const stderrData = Buffer.concat(stderrChunks)
                .toString('utf8')
                .trim();
              cleanup();
              if (code === 0) resolve(stdoutData);
              else if (code === 1)
                resolve(''); // 无匹配项
              else {
                if (stderrData)
                  reject(
                    new Error(
                      `系统 grep 退出码为 ${code}: ${stderrData}`,
                    ),
                  );
                else resolve(''); // 退出码 > 1 但无 stderr，可能是被抑制的错误
              }
            };

            const cleanup = () => {
              child.stdout.removeListener('data', onData);
              child.stderr.removeListener('data', onStderr);
              child.removeListener('error', onError);
              child.removeListener('close', onClose);
              if (child.connected) {
                child.disconnect();
              }
            };

            child.stdout.on('data', onData);
            child.stderr.on('data', onStderr);
            child.on('error', onError);
            child.on('close', onClose);
          });
          return this.parseGrepOutput(output, absolutePath);
        } catch (grepError: unknown) {
          console.debug(
            `GrepLogic: 系统 grep 失败: ${getErrorMessage(grepError)}. 回退到其他策略...`,
          );
        }
      }

      // --- 策略 3: 纯 JavaScript 回退 ---
      console.debug(
        'GrepLogic: 回退到 JavaScript grep 实现。',
      );
      strategyUsed = 'javascript fallback';
      const globPattern = include ? include : '**/*';
      const ignorePatterns = [
        '.git/**',
        'node_modules/**',
        'bower_components/**',
        '.svn/**',
        '.hg/**',
      ]; // 此处使用 glob 模式进行忽略

      const filesStream = globStream(globPattern, {
        cwd: absolutePath,
        dot: true,
        ignore: ignorePatterns,
        absolute: true,
        nodir: true,
        signal: options.signal,
      });

      const regex = new RegExp(pattern, 'i');
      const allMatches: GrepMatch[] = [];

      for await (const filePath of filesStream) {
        const fileAbsolutePath = filePath as string;
        try {
          const content = await fsPromises.readFile(fileAbsolutePath, 'utf8');
          const lines = content.split(/\r?\n/);
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              allMatches.push({
                filePath:
                  path.relative(absolutePath, fileAbsolutePath) ||
                  path.basename(fileAbsolutePath),
                lineNumber: index + 1,
                line,
              });
            }
          });
        } catch (readError: unknown) {
          // 忽略权限被拒或文件在读取过程中消失等错误
          if (!isNodeError(readError) || readError.code !== 'ENOENT') {
            console.debug(
              `GrepLogic: 无法读取/处理 ${fileAbsolutePath}: ${getErrorMessage(readError)}`,
            );
          }
        }
      }

      return allMatches;
    } catch (error: unknown) {
      console.error(
        `GrepLogic: performGrepSearch 中出错 (策略: ${strategyUsed}): ${getErrorMessage(error)}`,
      );
      throw error; // 重新抛出
    }
  }
}