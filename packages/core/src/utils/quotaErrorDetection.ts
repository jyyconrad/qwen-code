/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ApiError {
  error: {
    code: number;
    message: string;
    status: string;
    details: unknown[];
  };
}

interface StructuredError {
  message: string;
  status?: number;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as ApiError).error === 'object' &&
    'message' in (error as ApiError).error
  );
}

export function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as StructuredError).message === 'string'
  );
}

export function isProQuotaExceededError(error: unknown): boolean {
  // 通过查找特定模式来检查 Pro 配额超限错误
  // 这将匹配如下模式：
  // - "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'"
  // - "Quota exceeded for quota metric 'Gemini 2.5-preview Pro Requests'"
  // 我们使用字符串方法而非正则表达式以避免 ReDoS 漏洞

  const checkMessage = (message: string): boolean =>
    message.includes("Quota exceeded for quota metric 'Gemini") &&
    message.includes("Pro Requests'");

  if (typeof error === 'string') {
    return checkMessage(error);
  }

  if (isStructuredError(error)) {
    return checkMessage(error.message);
  }

  if (isApiError(error)) {
    return checkMessage(error.error.message);
  }

  // 检查是否为带有响应数据的 Gaxios 错误
  if (error && typeof error === 'object' && 'response' in error) {
    const gaxiosError = error as {
      response?: {
        data?: unknown;
      };
    };
    if (gaxiosError.response && gaxiosError.response.data) {
      console.log(
        '[DEBUG] isProQuotaExceededError - 正在检查响应数据：',
        gaxiosError.response.data,
      );
      if (typeof gaxiosError.response.data === 'string') {
        return checkMessage(gaxiosError.response.data);
      }
      if (
        typeof gaxiosError.response.data === 'object' &&
        gaxiosError.response.data !== null &&
        'error' in gaxiosError.response.data
      ) {
        const errorData = gaxiosError.response.data as {
          error?: { message?: string };
        };
        return checkMessage(errorData.error?.message || '');
      }
    }
  }

  console.log(
    '[DEBUG] isProQuotaExceededError - 无匹配的错误格式：',
    error,
  );
  return false;
}

export function isGenericQuotaExceededError(error: unknown): boolean {
  if (typeof error === 'string') {
    return error.includes('Quota exceeded for quota metric');
  }

  if (isStructuredError(error)) {
    return error.message.includes('Quota exceeded for quota metric');
  }

  if (isApiError(error)) {
    return error.error.message.includes('Quota exceeded for quota metric');
  }

  return false;
}