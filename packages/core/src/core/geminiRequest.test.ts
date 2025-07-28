/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { partListUnionToString } from './geminiRequest.js';
import { type Part } from '@google/genai';

describe('partListUnionToString', () => {
  it('如果输入是字符串，则应返回该字符串值', () => {
    const result = partListUnionToString('hello');
    expect(result).toBe('hello');
  });

  it('如果输入是字符串数组，则应返回连接后的字符串', () => {
    const result = partListUnionToString(['hello', ' ', 'world']);
    expect(result).toBe('hello world');
  });

  it('应处理 videoMetadata', () => {
    const part: Part = { videoMetadata: {} };
    const result = partListUnionToString(part);
    expect(result).toBe('[视频元数据]');
  });

  it('应处理 thought', () => {
    const part: Part = { thought: true };
    const result = partListUnionToString(part);
    expect(result).toBe('[思考: true]');
  });

  it('应处理 codeExecutionResult', () => {
    const part: Part = { codeExecutionResult: {} };
    const result = partListUnionToString(part);
    expect(result).toBe('[代码执行结果]');
  });

  it('应处理 executableCode', () => {
    const part: Part = { executableCode: {} };
    const result = partListUnionToString(part);
    expect(result).toBe('[可执行代码]');
  });

  it('应处理 fileData', () => {
    const part: Part = {
      fileData: { mimeType: 'text/plain', fileUri: 'file.txt' },
    };
    const result = partListUnionToString(part);
    expect(result).toBe('[文件数据]');
  });

  it('应处理 functionCall', () => {
    const part: Part = { functionCall: { name: 'myFunction' } };
    const result = partListUnionToString(part);
    expect(result).toBe('[函数调用: myFunction]');
  });

  it('应处理 functionResponse', () => {
    const part: Part = {
      functionResponse: { name: 'myFunction', response: {} },
    };
    const result = partListUnionToString(part);
    expect(result).toBe('[函数响应: myFunction]');
  });

  it('应处理 inlineData', () => {
    const part: Part = { inlineData: { mimeType: 'image/png', data: '...' } };
    const result = partListUnionToString(part);
    expect(result).toBe('<image/png>');
  });

  it('应处理 text', () => {
    const part: Part = { text: 'hello' };
    const result = partListUnionToString(part);
    expect(result).toBe('hello');
  });

  it('对于未知的 part 类型应返回空字符串', () => {
    const part: Part = {};
    const result = partListUnionToString(part);
    expect(result).toBe('');
  });
});