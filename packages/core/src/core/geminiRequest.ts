/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type PartListUnion, type Part } from '@google/genai';

/**
 * 表示要发送到 Gemini API 的请求。
 * 目前，它作为主要内容是 PartListUnion 的别名。
 * 以后可以扩展以包含其他请求参数。
 */
export type GeminiCodeRequest = PartListUnion;

export function partListUnionToString(value: PartListUnion): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(partListUnionToString).join('');
  }

  // 转换为 Part，假设它可能包含项目特定字段
  const part = value as Part & {
    videoMetadata?: unknown;
    thought?: string;
    codeExecutionResult?: unknown;
    executableCode?: unknown;
  };

  if (part.videoMetadata !== undefined) {
    return `[视频元数据]`;
  }

  if (part.thought !== undefined) {
    return `[思考: ${part.thought}]`;
  }

  if (part.codeExecutionResult !== undefined) {
    return `[代码执行结果]`;
  }

  if (part.executableCode !== undefined) {
    return `[可执行代码]`;
  }

  // 标准 Part 字段
  if (part.fileData !== undefined) {
    return `[文件数据]`;
  }

  if (part.functionCall !== undefined) {
    return `[函数调用: ${part.functionCall.name}]`;
  }

  if (part.functionResponse !== undefined) {
    return `[函数响应: ${part.functionResponse.name}]`;
  }

  if (part.inlineData !== undefined) {
    return `<${part.inlineData.mimeType}>`;
  }

  if (part.text !== undefined) {
    return part.text;
  }

  return '';
}