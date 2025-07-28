/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Content } from '@google/genai';

interface ErrorReportData {
  error: { message: string; stack?: string } | { message: string };
  context?: unknown;
  additionalInfo?: Record<string, unknown>;
}

/**
 * 生成错误报告，将其写入临时文件，并将信息记录到 console.error。
 * @param error 错误对象。
 * @param context 相关上下文（例如，聊天历史、请求内容）。
 * @param type 用于标识错误类型的字符串（例如，'startChat'，'generateJson-api'）。
 * @param baseMessage 在报告路径之前记录到 console.error 的初始消息。
 */
export async function reportError(
  error: Error | unknown,
  baseMessage: string,
  context?: Content[] | Record<string, unknown> | unknown[],
  type = 'general',
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFileName = `gemini-client-error-${type}-${timestamp}.json`;
  const reportPath = path.join(os.tmpdir(), reportFileName);

  let errorToReport: { message: string; stack?: string };
  if (error instanceof Error) {
    errorToReport = { message: error.message, stack: error.stack };
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    errorToReport = {
      message: String((error as { message: unknown }).message),
    };
  } else {
    errorToReport = { message: String(error) };
  }

  const reportContent: ErrorReportData = { error: errorToReport };

  if (context) {
    reportContent.context = context;
  }

  let stringifiedReportContent: string;
  try {
    stringifiedReportContent = JSON.stringify(reportContent, null, 2);
  } catch (stringifyError) {
    // 如果上下文包含类似 BigInt 的内容，可能会发生这种情况
    console.error(
      `${baseMessage} 无法字符串化报告内容（可能由于上下文）：`,
      stringifyError,
    );
    console.error('触发报告生成的原始错误：', error);
    if (context) {
      console.error(
        '原始上下文无法字符串化或包含在报告中。',
      );
    }
    // 降级方案：如果上下文是问题所在，尝试只报告错误
    try {
      const minimalReportContent = { error: errorToReport };
      stringifiedReportContent = JSON.stringify(minimalReportContent, null, 2);
      // 仍然尝试写入最小报告
      await fs.writeFile(reportPath, stringifiedReportContent);
      console.error(
        `${baseMessage} 部分报告（不包括上下文）位于：${reportPath}`,
      );
    } catch (minimalWriteError) {
      console.error(
        `${baseMessage} 甚至无法写入最小错误报告：`,
        minimalWriteError,
      );
    }
    return;
  }

  try {
    await fs.writeFile(reportPath, stringifiedReportContent);
    console.error(`${baseMessage} 完整报告位于：${reportPath}`);
  } catch (writeError) {
    console.error(
      `${baseMessage} 此外，写入详细错误报告失败：`,
      writeError,
    );
    // 如果报告写入失败，则记录原始错误作为降级方案
    console.error('触发报告生成的原始错误：', error);
    if (context) {
      // 上下文可以被字符串化，但写入文件失败。
      // 我们已经有 stringifiedReportContent，但它可能对于控制台来说太大了。
      // 因此，我们尝试记录原始上下文对象，如果失败，则记录其字符串化版本（截断）。
      try {
        console.error('原始上下文：', context);
      } catch {
        try {
          console.error(
            '原始上下文（字符串化，截断）：',
            JSON.stringify(context).substring(0, 1000),
          );
        } catch {
          console.error('原始上下文无法记录或字符串化。');
        }
      }
    }
  }
}