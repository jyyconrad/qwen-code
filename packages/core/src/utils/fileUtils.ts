/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { PartUnion } from '@google/genai';
import mime from 'mime-types';

// 文本文件处理的常量
const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;

// 编码和分隔符格式的默认值
export const DEFAULT_ENCODING: BufferEncoding = 'utf-8';

/**
 * 查找文件路径的特定 MIME 类型。
 * @param filePath 文件路径。
 * @returns 特定的 MIME 类型字符串（例如 'text/python', 'application/javascript'）或 undefined（如果未找到或存在歧义）。
 */
export function getSpecificMimeType(filePath: string): string | undefined {
  const lookedUpMime = mime.lookup(filePath);
  return typeof lookedUpMime === 'string' ? lookedUpMime : undefined;
}

/**
 * 检查路径是否在给定的根目录内。
 * @param pathToCheck 要检查的绝对路径。
 * @param rootDirectory 绝对根目录。
 * @returns 如果路径在根目录内则返回 true，否则返回 false。
 */
export function isWithinRoot(
  pathToCheck: string,
  rootDirectory: string,
): boolean {
  const normalizedPathToCheck = path.resolve(pathToCheck);
  const normalizedRootDirectory = path.resolve(rootDirectory);

  // 确保 rootDirectory 路径以分隔符结尾，以便进行正确的 startsWith 比较，
  // 除非它是根路径本身（例如 '/' 或 'C:\'）。
  const rootWithSeparator =
    normalizedRootDirectory === path.sep ||
    normalizedRootDirectory.endsWith(path.sep)
      ? normalizedRootDirectory
      : normalizedRootDirectory + path.sep;

  return (
    normalizedPathToCheck === normalizedRootDirectory ||
    normalizedPathToCheck.startsWith(rootWithSeparator)
  );
}

/**
 * 根据内容采样确定文件是否可能是二进制文件。
 * @param filePath 文件路径。
 * @returns 如果文件看起来是二进制文件则返回 true。
 */
export function isBinaryFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    // 读取最多 4KB 或文件大小，以较小者为准
    const fileSize = fs.fstatSync(fd).size;
    if (fileSize === 0) {
      // 空文件在内容检查中不被视为二进制文件
      fs.closeSync(fd);
      return false;
    }
    const bufferSize = Math.min(4096, fileSize);
    const buffer = Buffer.alloc(bufferSize);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    if (bytesRead === 0) return false;

    let nonPrintableCount = 0;
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true; // 空字节是强烈指示符
      if (buffer[i] < 9 || (buffer[i] > 13 && buffer[i] < 32)) {
        nonPrintableCount++;
      }
    }
    // 如果 >30% 的字符是非可打印字符，则认为是二进制文件
    return nonPrintableCount / bytesRead > 0.3;
  } catch {
    // 如果发生任何错误（例如文件未找到、权限问题），
    // 在此处视为非二进制文件；让上层函数处理存在性/访问错误。
    return false;
  }
}

/**
 * 根据扩展名和内容检测文件类型。
 * @param filePath 文件路径。
 * @returns 'text', 'image', 'pdf', 'audio', 'video', 或 'binary'。
 */
export function detectFileType(
  filePath: string,
): 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' | 'svg' {
  const ext = path.extname(filePath).toLowerCase();

  // "ts" 的 mimetype 是 MPEG 传输流（一种视频格式），但我们希望
  // 假设这些是 typescript 文件。
  if (ext === '.ts') {
    return 'text';
  }

  if (ext === '.svg') {
    return 'svg';
  }

  const lookedUpMimeType = mime.lookup(filePath); // 如果未找到返回 false，否则返回 mime 类型字符串
  if (lookedUpMimeType) {
    if (lookedUpMimeType.startsWith('image/')) {
      return 'image';
    }
    if (lookedUpMimeType.startsWith('audio/')) {
      return 'audio';
    }
    if (lookedUpMimeType.startsWith('video/')) {
      return 'video';
    }
    if (lookedUpMimeType === 'application/pdf') {
      return 'pdf';
    }
  }

  // 在内容检查之前对常见的非文本扩展名进行更严格的二进制检查
  // 这些通常不受 mime-types 覆盖，或者可能被错误识别。
  if (
    [
      '.zip',
      '.tar',
      '.gz',
      '.exe',
      '.dll',
      '.so',
      '.class',
      '.jar',
      '.war',
      '.7z',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.odt',
      '.ods',
      '.odp',
      '.bin',
      '.dat',
      '.obj',
      '.o',
      '.a',
      '.lib',
      '.wasm',
      '.pyc',
      '.pyo',
    ].includes(ext)
  ) {
    return 'binary';
  }

  // 如果 mime 类型对图像/PDF 不具有决定性
  // 且不是已知的二进制扩展名，则回退到基于内容的检查。
  if (isBinaryFile(filePath)) {
    return 'binary';
  }

  return 'text';
}

export interface ProcessedFileReadResult {
  llmContent: PartUnion; // 文本为 string，图像/PDF/不可读二进制文件为 Part
  returnDisplay: string;
  error?: string; // 如果文件处理失败，提供给 LLM 的可选错误消息
  isTruncated?: boolean; // 对于文本文件，指示内容是否被截断
  originalLineCount?: number; // 对于文本文件
  linesShown?: [number, number]; // 对于文本文件 [startLine, endLine]（显示时为 1-based）
}

/**
 * 读取和处理单个文件，处理文本、图像和 PDF。
 * @param filePath 文件的绝对路径。
 * @param rootDirectory 项目根目录的绝对路径，用于相对路径显示。
 * @param offset 文本文件的可选偏移量（0-based 行号）。
 * @param limit 文本文件的可选限制（要读取的行数）。
 * @returns ProcessedFileReadResult 对象。
 */
export async function processSingleFileContent(
  filePath: string,
  rootDirectory: string,
  offset?: number,
  limit?: number,
): Promise<ProcessedFileReadResult> {
  try {
    if (!fs.existsSync(filePath)) {
      // 异步读取前的同步检查是可以接受的
      return {
        llmContent: '',
        returnDisplay: '文件未找到。',
        error: `文件未找到: ${filePath}`,
      };
    }
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      return {
        llmContent: '',
        returnDisplay: '路径是一个目录。',
        error: `路径是目录，不是文件: ${filePath}`,
      };
    }

    const fileSizeInBytes = stats.size;
    // 20MB 限制
    const maxFileSize = 20 * 1024 * 1024;

    if (fileSizeInBytes > maxFileSize) {
      throw new Error(
        `文件大小超过 20MB 限制: ${filePath} (${(
          fileSizeInBytes /
          (1024 * 1024)
        ).toFixed(2)}MB)`,
      );
    }

    const fileType = detectFileType(filePath);
    const relativePathForDisplay = path
      .relative(rootDirectory, filePath)
      .replace(/\\/g, '/');

    switch (fileType) {
      case 'binary': {
        return {
          llmContent: `无法显示二进制文件的内容: ${relativePathForDisplay}`,
          returnDisplay: `跳过的二进制文件: ${relativePathForDisplay}`,
        };
      }
      case 'svg': {
        const SVG_MAX_SIZE_BYTES = 1 * 1024 * 1024;
        if (stats.size > SVG_MAX_SIZE_BYTES) {
          return {
            llmContent: `无法显示大于 1MB 的 SVG 文件内容: ${relativePathForDisplay}`,
            returnDisplay: `跳过的大 SVG 文件 (>1MB): ${relativePathForDisplay}`,
          };
        }
        const content = await fs.promises.readFile(filePath, 'utf8');
        return {
          llmContent: content,
          returnDisplay: `将 SVG 作为文本读取: ${relativePathForDisplay}`,
        };
      }
      case 'text': {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const originalLineCount = lines.length;

        const startLine = offset || 0;
        const effectiveLimit =
          limit === undefined ? DEFAULT_MAX_LINES_TEXT_FILE : limit;
        // 确保 endLine 不超过 originalLineCount
        const endLine = Math.min(startLine + effectiveLimit, originalLineCount);
        // 确保 selectedLines 不会尝试在 startLine 过高时切片超出数组边界
        const actualStartLine = Math.min(startLine, originalLineCount);
        const selectedLines = lines.slice(actualStartLine, endLine);

        let linesWereTruncatedInLength = false;
        const formattedLines = selectedLines.map((line) => {
          if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
            linesWereTruncatedInLength = true;
            return (
              line.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + '... [已截断]'
            );
          }
          return line;
        });

        const contentRangeTruncated = endLine < originalLineCount;
        const isTruncated = contentRangeTruncated || linesWereTruncatedInLength;

        let llmTextContent = '';
        if (contentRangeTruncated) {
          llmTextContent += `[文件内容已截断: 显示第 ${actualStartLine + 1}-${endLine} 行，共 ${originalLineCount} 行。使用 offset/limit 参数查看更多。]\n`;
        } else if (linesWereTruncatedInLength) {
          llmTextContent += `[文件内容部分截断: 某些行超过了最大长度 ${MAX_LINE_LENGTH_TEXT_FILE} 字符。]\n`;
        }
        llmTextContent += formattedLines.join('\n');

        return {
          llmContent: llmTextContent,
          returnDisplay: isTruncated ? '(已截断)' : '',
          isTruncated,
          originalLineCount,
          linesShown: [actualStartLine + 1, endLine],
        };
      }
      case 'image':
      case 'pdf':
      case 'audio':
      case 'video': {
        const contentBuffer = await fs.promises.readFile(filePath);
        const base64Data = contentBuffer.toString('base64');
        return {
          llmContent: {
            inlineData: {
              data: base64Data,
              mimeType: mime.lookup(filePath) || 'application/octet-stream',
            },
          },
          returnDisplay: `读取 ${fileType} 文件: ${relativePathForDisplay}`,
        };
      }
      default: {
        // 使用当前 detectFileType 逻辑不应该发生
        const exhaustiveCheck: never = fileType;
        return {
          llmContent: `未处理的文件类型: ${exhaustiveCheck}`,
          returnDisplay: `跳过的未处理文件类型: ${relativePathForDisplay}`,
          error: `未处理的文件类型 ${filePath}`,
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const displayPath = path
      .relative(rootDirectory, filePath)
      .replace(/\\/g, '/');
    return {
      llmContent: `读取文件 ${displayPath} 时出错: ${errorMessage}`,
      returnDisplay: `读取文件 ${displayPath} 时出错: ${errorMessage}`,
      error: `读取文件 ${filePath} 时出错: ${errorMessage}`,
    };
  }
}