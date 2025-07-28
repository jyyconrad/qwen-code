/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// 使用类型别名定义 SpyInstance，因为它未被直接导出
type SpyInstance = ReturnType<typeof vi.spyOn>;
import { reportError } from './errorReporting.js';
import fs from 'node:fs/promises';
import os from 'node:os';

// 模拟依赖项
vi.mock('node:fs/promises');
vi.mock('node:os');

describe('reportError', () => {
  let consoleErrorSpy: SpyInstance;
  const MOCK_TMP_DIR = '/tmp';
  const MOCK_TIMESTAMP = '2025-01-01T00-00-00-000Z';

  beforeEach(() => {
    vi.resetAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (os.tmpdir as Mock).mockReturnValue(MOCK_TMP_DIR);
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(MOCK_TIMESTAMP);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getExpectedReportPath = (type: string) =>
    `${MOCK_TMP_DIR}/gemini-client-error-${type}-${MOCK_TIMESTAMP}.json`;

  it('应生成报告并记录路径', async () => {
    const error = new Error('测试错误');
    error.stack = '测试堆栈';
    const baseMessage = '发生了一个错误。';
    const context = { data: '测试上下文' };
    const type = 'test-type';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);

    await reportError(error, baseMessage, context, type);

    expect(os.tmpdir).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: '测试错误', stack: error.stack },
          context,
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} 完整报告位于：${expectedReportPath}`,
    );
  });

  it('应处理具有 message 属性的普通对象错误', async () => {
    const error = { message: '测试普通对象错误' };
    const baseMessage = '另一个错误。';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);
    await reportError(error, baseMessage);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: '测试普通对象错误' },
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} 完整报告位于：${expectedReportPath}`,
    );
  });

  it('应处理字符串错误', async () => {
    const error = '只是一个字符串错误';
    const baseMessage = '发生了字符串错误。';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);
    await reportError(error, baseMessage);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: '只是一个字符串错误' },
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} 完整报告位于：${expectedReportPath}`,
    );
  });

  it('如果写入报告失败应记录备用消息', async () => {
    const error = new Error('主要错误');
    const baseMessage = '操作失败。';
    const writeError = new Error('无法写入文件');
    const context = ['一些上下文'];
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockRejectedValue(writeError);

    await reportError(error, baseMessage, context, type);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      expect.any(String),
    ); // 仍会尝试写入
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} 此外，无法写入详细错误报告：`,
      writeError,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '触发报告生成的原始错误：',
      error,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('原始上下文：', context);
  });

  it('应处理报告内容的字符串化失败（例如上下文中的 BigInt）', async () => {
    const error = new Error('主要错误');
    error.stack = '主要堆栈';
    const baseMessage = '包含 BigInt 的失败操作。';
    const context = { a: BigInt(1) }; // BigInt 无法通过 JSON.stringify 进行字符串化
    const type = 'bigint-fail';
    const stringifyError = new TypeError(
      '不知道如何序列化 BigInt',
    );
    const expectedMinimalReportPath = getExpectedReportPath(type);

    // 模拟 JSON.stringify 在完整报告时抛出错误
    const originalJsonStringify = JSON.stringify;
    let callCount = 0;
    vi.spyOn(JSON, 'stringify').mockImplementation((value, replacer, space) => {
      callCount++;
      if (callCount === 1) {
        // 第一次调用是用于完整报告内容
        throw stringifyError;
      }
      // 后续调用（用于最小报告）应成功
      return originalJsonStringify(value, replacer, space);
    });

    (fs.writeFile as Mock).mockResolvedValue(undefined); // 模拟最小报告写入

    await reportError(error, baseMessage, context, type);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} 无法对报告内容进行字符串化（可能由于上下文）：`,
      stringifyError,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '触发报告生成的原始错误：',
      error,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '原始上下文无法进行字符串化或包含在报告中。',
    );
    // 检查是否尝试写入最小报告
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedMinimalReportPath,
      originalJsonStringify(
        { error: { message: error.message, stack: error.stack } },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} 部分报告（不包括上下文）位于：${expectedMinimalReportPath}`,
    );
  });

  it('如果未提供上下文，则应生成不带上下文的报告', async () => {
    const error = new Error('无上下文错误');
    error.stack = '无上下文堆栈';
    const baseMessage = '简单错误。';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);
    await reportError(error, baseMessage, undefined, type);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: '无上下文错误', stack: error.stack },
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} 完整报告位于：${expectedReportPath}`,
    );
  });
});