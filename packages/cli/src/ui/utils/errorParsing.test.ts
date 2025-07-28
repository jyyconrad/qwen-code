/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseAndFormatApiError } from './errorParsing.js';
import {
  AuthType,
  UserTierId,
  DEFAULT_GEMINI_FLASH_MODEL,
  isProQuotaExceededError,
} from '@iflytek/iflycode-core';

describe('parseAndFormatApiError', () => {
  const _enterpriseMessage =
    '升级到具有更高限制的 Gemini Code Assist Standard 或 Enterprise 计划';
  const vertexMessage = '通过 Vertex 申请配额增加';
  const geminiMessage = '通过 AI Studio 申请配额增加';

  it('应格式化有效的 API 错误 JSON', () => {
    const errorMessage =
      'got status: 400 Bad Request. {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
    const expected =
      '[API Error: API key not valid. Please pass a valid API key. (Status: INVALID_ARGUMENT)]';
    expect(parseAndFormatApiError(errorMessage)).toBe(expected);
  });

  it('应使用默认消息格式化 429 API 错误', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      undefined,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      '检测到可能的配额限制或响应时间缓慢。正在切换到 gemini-2.5-flash 模型',
    );
  });

  it('应使用个人消息格式化 429 API 错误', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      '检测到可能的配额限制或响应时间缓慢。正在切换到 gemini-2.5-flash 模型',
    );
  });

  it('应使用 vertex 消息格式化 429 API 错误', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(errorMessage, AuthType.USE_VERTEX_AI);
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(vertexMessage);
  });

  it('如果消息不是 JSON 错误，则应返回原始消息', () => {
    const errorMessage = '这是一个普通的旧错误消息';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('对于格式错误的 JSON 应返回原始消息', () => {
    const errorMessage = '[Stream Error: {"error": "malformed}';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('应处理不匹配 ApiError 结构的 JSON', () => {
    const errorMessage = '[Stream Error: {"not_an_error": "some other json"}]';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('应格式化嵌套的 API 错误', () => {
    const nestedErrorMessage = JSON.stringify({
      error: {
        code: 429,
        message:
          "Gemini 2.5 Pro Preview doesn't have a free quota tier. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.",
        status: 'RESOURCE_EXHAUSTED',
      },
    });

    const errorMessage = JSON.stringify({
      error: {
        code: 429,
        message: nestedErrorMessage,
        status: 'Too Many Requests',
      },
    });

    const result = parseAndFormatApiError(errorMessage, AuthType.USE_GEMINI);
    expect(result).toContain('Gemini 2.5 Pro Preview');
    expect(result).toContain(geminiMessage);
  });

  it('应格式化 StructuredError', () => {
    const error: StructuredError = {
      message: '发生了一个结构化错误',
      status: 500,
    };
    const expected = '[API Error: 发生了一个结构化错误]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });

  it('应使用 vertex 消息格式化 429 StructuredError', () => {
    const error: StructuredError = {
      message: 'Rate limit exceeded',
      status: 429,
    };
    const result = parseAndFormatApiError(error, AuthType.USE_VERTEX_AI);
    expect(result).toContain('[API Error: Rate limit exceeded]');
    expect(result).toContain(vertexMessage);
  });

  it('应处理未知错误类型', () => {
    const error = 12345;
    const expected = '[API Error: 发生了未知错误。]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });

  it('应为 Google 认证（免费层级）格式化 429 API 错误与 Pro 配额超限消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      '您已达到每日 gemini-2.5-pro 配额限制',
    );
    expect(result).toContain(
      '升级到 Gemini Code Assist Standard 或 Enterprise 计划',
    );
  });

  it('应为 Google 认证格式化常规 429 API 错误与标准消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      '检测到可能的配额限制或响应时间缓慢。正在切换到 gemini-2.5-flash 模型',
    );
    expect(result).not.toContain(
      '您已达到每日 gemini-2.5-pro 配额限制',
    );
  });

  it('应为 Google 认证格式化 429 API 错误与通用配额超限消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'GenerationRequests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'GenerationRequests'",
    );
    expect(result).toContain('您已达到每日配额限制');
    expect(result).not.toContain(
      '您已达到每日 Gemini 2.5 Pro 配额限制',
    );
  });

  it('应优先处理 Google 认证的 Pro 配额消息而非通用配额消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      '您已达到每日 gemini-2.5-pro 配额限制',
    );
    expect(result).not.toContain('您已达到每日配额限制');
  });

  it('应为 Google 认证（标准层级）格式化 429 API 错误与 Pro 配额超限消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.STANDARD,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      '您已达到每日 gemini-2.5-pro 配额限制',
    );
    expect(result).toContain(
      '感谢您选择 Gemini Code Assist 和 Gemini CLI',
    );
    expect(result).not.toContain(
      '升级到 Gemini Code Assist Standard 或 Enterprise 计划',
    );
  });

  it('应为 Google 认证（旧版层级）格式化 429 API 错误与 Pro 配额超限消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.LEGACY,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      '您已达到每日 gemini-2.5-pro 配额限制',
    );
    expect(result).toContain(
      '感谢您选择 Gemini Code Assist 和 Gemini CLI',
    );
    expect(result).not.toContain(
      '升级到 Gemini Code Assist Standard 或 Enterprise 计划',
    );
  });

  it('应处理 Pro 配额超限错误中不同的 Gemini 2.5 版本字符串', () => {
    const errorMessage25 =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const errorMessagePreview =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5-preview Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';

    const result25 = parseAndFormatApiError(
      errorMessage25,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    const resultPreview = parseAndFormatApiError(
      errorMessagePreview,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'gemini-2.5-preview-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );

    expect(result25).toContain(
      '您已达到每日 gemini-2.5-pro 配额限制',
    );
    expect(resultPreview).toContain(
      '您已达到每日 gemini-2.5-preview-pro 配额限制',
    );
    expect(result25).toContain(
      '升级到 Gemini Code Assist Standard 或 Enterprise 计划',
    );
    expect(resultPreview).toContain(
      '升级到 Gemini Code Assist Standard 或 Enterprise 计划',
    );
  });

  it('不应匹配具有相似版本字符串的非 Pro 模型', () => {
    // 测试 Flash 模型是否不匹配相似版本字符串
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5 Flash Requests' and limit",
      ),
    ).toBe(false);
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5-preview Flash Requests' and limit",
      ),
    ).toBe(false);

    // 测试其他模型类型
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5 Ultra Requests' and limit",
      ),
    ).toBe(false);
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5 Standard Requests' and limit",
      ),
    ).toBe(false);

    // 测试通用配额消息
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'GenerationRequests' and limit",
      ),
    ).toBe(false);
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'EmbeddingRequests' and limit",
      ),
    ).toBe(false);
  });

  it('应为 Google 认证（标准层级）格式化通用配额超限消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'GenerationRequests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.STANDARD,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'GenerationRequests'",
    );
    expect(result).toContain('您已达到每日配额限制');
    expect(result).toContain(
      '感谢您选择 Gemini Code Assist 和 Gemini CLI',
    );
    expect(result).not.toContain(
      '升级到 Gemini Code Assist Standard 或 Enterprise 计划',
    );
  });

  it('应为 Google 认证（标准层级）格式化常规 429 API 错误与标准消息', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.STANDARD,
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      '感谢您选择 Gemini Code Assist 和 Gemini CLI',
    );
    expect(result).not.toContain(
      '升级到 Gemini Code Assist Standard 或 Enterprise 计划',
    );
  });
});