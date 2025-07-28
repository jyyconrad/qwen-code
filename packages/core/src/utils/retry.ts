/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../core/contentGenerator.js';
import {
  isProQuotaExceededError,
  isGenericQuotaExceededError,
} from './quotaErrorDetection.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: Error) => boolean;
  onPersistent429?: (
    authType?: string,
    error?: unknown,
  ) => Promise<string | boolean | null>;
  authType?: string;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  initialDelayMs: 5000,
  maxDelayMs: 30000, // 30 秒
  shouldRetry: defaultShouldRetry,
};

/**
 * 默认谓词函数，用于确定是否应尝试重试。
 * 在 429（请求过多）和 5xx 服务器错误时重试。
 * @param error 错误对象。
 * @returns 如果错误是瞬态错误则返回 true，否则返回 false。
 */
function defaultShouldRetry(error: Error | unknown): boolean {
  // 检查消息或状态属性中是否存在常见的瞬态错误状态码
  if (error && typeof (error as { status?: number }).status === 'number') {
    const status = (error as { status: number }).status;
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }
  }
  if (error instanceof Error && error.message) {
    if (error.message.includes('429')) return true;
    if (error.message.match(/5\d{2}/)) return true;
  }
  return false;
}

/**
 * 延迟执行指定的毫秒数。
 * @param ms 延迟的毫秒数。
 * @returns 在延迟后解析的 Promise。
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 使用指数退避和抖动重试函数。
 * @param fn 要重试的异步函数。
 * @param options 可选的重试配置。
 * @returns 如果成功则解析为函数结果的 Promise。
 * @throws 如果所有尝试都失败，则抛出遇到的最后一个错误。
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    onPersistent429,
    authType,
    shouldRetry,
  } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let attempt = 0;
  let currentDelay = initialDelayMs;
  let consecutive429Count = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (error) {
      const errorStatus = getErrorStatus(error);

      // 首先检查 Pro 配额超限错误 - OAuth 用户的即时回退
      if (
        errorStatus === 429 &&
        authType === AuthType.LOGIN_WITH_GOOGLE &&
        isProQuotaExceededError(error) &&
        onPersistent429
      ) {
        try {
          const fallbackModel = await onPersistent429(authType, error);
          if (fallbackModel !== false && fallbackModel !== null) {
            // 重置尝试计数器并使用新模型尝试
            attempt = 0;
            consecutive429Count = 0;
            currentDelay = initialDelayMs;
            // 模型更新后，继续下一次尝试
            continue;
          } else {
            // 回退处理器返回 null/false，表示不继续 - 停止重试过程
            throw error;
          }
        } catch (fallbackError) {
          // 如果回退失败，继续使用原始错误
          console.warn('回退到 Flash 模型失败:', fallbackError);
        }
      }

      // 检查通用配额超限错误（但不是 Pro，已在上面处理）- OAuth 用户的即时回退
      if (
        errorStatus === 429 &&
        authType === AuthType.LOGIN_WITH_GOOGLE &&
        !isProQuotaExceededError(error) &&
        isGenericQuotaExceededError(error) &&
        onPersistent429
      ) {
        try {
          const fallbackModel = await onPersistent429(authType, error);
          if (fallbackModel !== false && fallbackModel !== null) {
            // 重置尝试计数器并使用新模型尝试
            attempt = 0;
            consecutive429Count = 0;
            currentDelay = initialDelayMs;
            // 模型更新后，继续下一次尝试
            continue;
          } else {
            // 回退处理器返回 null/false，表示不继续 - 停止重试过程
            throw error;
          }
        } catch (fallbackError) {
          // 如果回退失败，继续使用原始错误
          console.warn('回退到 Flash 模型失败:', fallbackError);
        }
      }

      // 跟踪连续的 429 错误
      if (errorStatus === 429) {
        consecutive429Count++;
      } else {
        consecutive429Count = 0;
      }

      // 如果我们有持续的 429 错误并且有 OAuth 的回退回调
      if (
        consecutive429Count >= 2 &&
        onPersistent429 &&
        authType === AuthType.LOGIN_WITH_GOOGLE
      ) {
        try {
          const fallbackModel = await onPersistent429(authType, error);
          if (fallbackModel !== false && fallbackModel !== null) {
            // 重置尝试计数器并使用新模型尝试
            attempt = 0;
            consecutive429Count = 0;
            currentDelay = initialDelayMs;
            // 模型更新后，继续下一次尝试
            continue;
          } else {
            // 回退处理器返回 null/false，表示不继续 - 停止重试过程
            throw error;
          }
        } catch (fallbackError) {
          // 如果回退失败，继续使用原始错误
          console.warn('回退到 Flash 模型失败:', fallbackError);
        }
      }

      // 检查是否已用尽重试次数或不应重试
      if (attempt >= maxAttempts || !shouldRetry(error as Error)) {
        throw error;
      }

      const { delayDurationMs, errorStatus: delayErrorStatus } =
        getDelayDurationAndStatus(error);

      if (delayDurationMs > 0) {
        // 如果存在并解析了 Retry-After 头，则尊重它
        console.warn(
          `第 ${attempt} 次尝试失败，状态为 ${delayErrorStatus ?? 'unknown'}。将在 ${delayDurationMs}ms 后重试...`,
          error,
        );
        await delay(delayDurationMs);
        // 为下次可能的非 429 错误重置 currentDelay，或者如果下次没有 Retry-After
        currentDelay = initialDelayMs;
      } else {
        // 回退到带抖动的指数退避
        logRetryAttempt(attempt, error, errorStatus);
        // 添加抖动：当前延迟的 +/- 30%
        const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
        const delayWithJitter = Math.max(0, currentDelay + jitter);
        await delay(delayWithJitter);
        currentDelay = Math.min(maxDelayMs, currentDelay * 2);
      }
    }
  }
  // 由于 catch 块中的 throw，这行理论上应该是不可达的。
  // 添加以确保类型安全并满足编译器始终返回 Promise 的要求。
  throw new Error('重试次数已用尽');
}

/**
 * 从错误对象中提取 HTTP 状态码。
 * @param error 错误对象。
 * @returns HTTP 状态码，如果未找到则返回 undefined。
 */
function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }
    // 检查 error.response.status（在 axios 错误中常见）
    if (
      'response' in error &&
      typeof (error as { response?: unknown }).response === 'object' &&
      (error as { response?: unknown }).response !== null
    ) {
      const response = (
        error as { response: { status?: unknown; headers?: unknown } }
      ).response;
      if ('status' in response && typeof response.status === 'number') {
        return response.status;
      }
    }
  }
  return undefined;
}

/**
 * 从错误对象的头部提取 Retry-After 延迟。
 * @param error 错误对象。
 * @returns 延迟的毫秒数，如果未找到或无效则返回 0。
 */
function getRetryAfterDelayMs(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    // 检查 error.response.headers（在 axios 错误中常见）
    if (
      'response' in error &&
      typeof (error as { response?: unknown }).response === 'object' &&
      (error as { response?: unknown }).response !== null
    ) {
      const response = (error as { response: { headers?: unknown } }).response;
      if (
        'headers' in response &&
        typeof response.headers === 'object' &&
        response.headers !== null
      ) {
        const headers = response.headers as { 'retry-after'?: unknown };
        const retryAfterHeader = headers['retry-after'];
        if (typeof retryAfterHeader === 'string') {
          const retryAfterSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(retryAfterSeconds)) {
            return retryAfterSeconds * 1000;
          }
          // 它可能是一个 HTTP 日期
          const retryAfterDate = new Date(retryAfterHeader);
          if (!isNaN(retryAfterDate.getTime())) {
            return Math.max(0, retryAfterDate.getTime() - Date.now());
          }
        }
      }
    }
  }
  return 0;
}

/**
 * 根据错误确定延迟持续时间，优先考虑 Retry-After 头。
 * @param error 错误对象。
 * @returns 包含延迟持续时间（毫秒）和错误状态的对象。
 */
function getDelayDurationAndStatus(error: unknown): {
  delayDurationMs: number;
  errorStatus: number | undefined;
} {
  const errorStatus = getErrorStatus(error);
  let delayDurationMs = 0;

  if (errorStatus === 429) {
    delayDurationMs = getRetryAfterDelayMs(error);
  }
  return { delayDurationMs, errorStatus };
}

/**
 * 当使用指数退避时记录重试尝试的消息。
 * @param attempt 当前尝试次数。
 * @param error 导致重试的错误。
 * @param errorStatus 错误的 HTTP 状态码（如果可用）。
 */
function logRetryAttempt(
  attempt: number,
  error: unknown,
  errorStatus?: number,
): void {
  let message = `第 ${attempt} 次尝试失败。使用退避重试...`;
  if (errorStatus) {
    message = `第 ${attempt} 次尝试失败，状态为 ${errorStatus}。使用退避重试...`;
  }

  if (errorStatus === 429) {
    console.warn(message, error);
  } else if (errorStatus && errorStatus >= 500 && errorStatus < 600) {
    console.error(message, error);
  } else if (error instanceof Error) {
    // 为可能没有状态但有消息的错误回退
    if (error.message.includes('429')) {
      console.warn(
        `第 ${attempt} 次尝试失败，出现 429 错误（无 Retry-After 头）。使用退避重试...`,
        error,
      );
    } else if (error.message.match(/5\d{2}/)) {
      console.error(
        `第 ${attempt} 次尝试失败，出现 5xx 错误。使用退避重试...`,
        error,
      );
    } else {
      console.warn(message, error); // 默认对其他错误使用警告
    }
  } else {
    console.warn(message, error); // 如果错误类型未知，默认使用警告
  }
}