/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import os from 'os';
import { join as pathJoin } from 'node:path';
import { getErrorMessage } from '@iflytek/iflycode-core';

const warningsFilePath = pathJoin(os.tmpdir(), 'gemini-cli-warnings.txt');

export async function getStartupWarnings(): Promise<string[]> {
  try {
    await fs.access(warningsFilePath); // 检查文件是否存在
    const warningsContent = await fs.readFile(warningsFilePath, 'utf-8');
    const warnings = warningsContent
      .split('\n')
      .filter((line) => line.trim() !== '');
    try {
      await fs.unlink(warningsFilePath);
    } catch {
      warnings.push('警告: 无法删除临时警告文件。');
    }
    return warnings;
  } catch (err: unknown) {
    // 如果 fs.access 抛出异常，表示文件不存在或无法访问。
    // 在获取警告的上下文中，这并不是错误，因此返回空数组。
    // 仅当不是"文件未找到"类型的错误时才返回错误消息。
    // 然而，原始逻辑在任何 fs.existsSync 失败时都返回错误消息。
    // 为了在保持更接近原逻辑的同时实现异步操作，我们将检查错误代码。
    // ENOENT 表示"Error NO ENTry"（文件未找到）。
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return []; // 文件未找到，没有警告可返回。
    }
    // 对于其他错误（权限等），返回错误消息。
    return [`检查/读取警告文件时出错: ${getErrorMessage(err)}`];
  }
}