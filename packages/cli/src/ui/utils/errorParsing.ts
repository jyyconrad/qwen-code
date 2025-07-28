/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  UserTierId,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  isApiError,
  isStructuredError,
} from '@iflytek/iflycode-core';
// 免费层级消息函数
const getRateLimitErrorMessageGoogleFree = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\n检测到可能的配额限制或响应缓慢。在本次会话剩余时间内切换到 ${fallbackModel} 模型。`;

const getRateLimitErrorMessageGoogleProQuotaFree = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\n您已达到每日 ${currentModel} 配额限制。在本次会话剩余时间内您将被切换到 ${fallbackModel} 模型。要提高限制，请升级到具有更高限制的 Gemini Code Assist 标准版或企业版计划，网址：https://goo.gle/set-up-gemini-code-assist，或使用 /auth 切换到使用来自 AI Studio 的付费 API 密钥，网址：https://aistudio.google.com/apikey`;

const getRateLimitErrorMessageGoogleGenericQuotaFree = () =>
  `\n您已达到每日配额限制。要提高限制，请升级到具有更高限制的 Gemini Code Assist 标准版或企业版计划，网址：https://goo.gle/set-up-gemini-code-assist，或使用 /auth 切换到使用来自 AI Studio 的付费 API 密钥，网址：https://aistudio.google.com/apikey`;

// 旧版/标准版层级消息函数
const getRateLimitErrorMessageGooglePaid = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\n检测到可能的配额限制或响应缓慢。在本次会话剩余时间内切换到 ${fallbackModel} 模型。感谢您选择 Gemini Code Assist 和 Gemini CLI。`;

const getRateLimitErrorMessageGoogleProQuotaPaid = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\n您已达到每日 ${currentModel} 配额限制。在本次会话剩余时间内您将被切换到 ${fallbackModel} 模型。感谢您选择 Gemini Code Assist 和 Gemini CLI。要继续在今天访问 ${currentModel} 模型，请考虑使用 /auth 切换到使用来自 AI Studio 的付费 API 密钥，网址：https://aistudio.google.com/apikey`;

const getRateLimitErrorMessageGoogleGenericQuotaPaid = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
) =>
  `\n您已达到每日配额限制。感谢您选择 Gemini Code Assist 和 Gemini CLI。要继续在今天访问 ${currentModel} 模型，请考虑使用 /auth 切换到使用来自 AI Studio 的付费 API 密钥，网址：https://aistudio.google.com/apikey`;
const RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI =
  '\n请稍等后重试。要提高限制，请通过 AI Studio 请求增加配额，或切换到其他 /auth 方法';
const RATE_LIMIT_ERROR_MESSAGE_VERTEX =
  '\n请稍等后重试。要提高限制，请通过 Vertex 请求增加配额，或切换到其他 /auth 方法';
const getRateLimitErrorMessageDefault = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\n检测到可能的配额限制或响应缓慢。在本次会话剩余时间内切换到 ${fallbackModel} 模型。`;

function getRateLimitMessage(
  authType?: AuthType,
  error?: unknown,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  switch (authType) {
    case AuthType.LOGIN_WITH_GOOGLE: {
      // 确定用户是否在付费层级（旧版或标准版）- 如果未指定则默认为免费
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

      if (isProQuotaExceededError(error)) {
        return isPaidTier
          ? getRateLimitErrorMessageGoogleProQuotaPaid(
              currentModel || DEFAULT_GEMINI_MODEL,
              fallbackModel,
            )
          : getRateLimitErrorMessageGoogleProQuotaFree(
              currentModel || DEFAULT_GEMINI_MODEL,
              fallbackModel,
            );
      } else if (isGenericQuotaExceededError(error)) {
        return isPaidTier
          ? getRateLimitErrorMessageGoogleGenericQuotaPaid(
              currentModel || DEFAULT_GEMINI_MODEL,
            )
          : getRateLimitErrorMessageGoogleGenericQuotaFree();
      } else {
        return isPaidTier
          ? getRateLimitErrorMessageGooglePaid(fallbackModel)
          : getRateLimitErrorMessageGoogleFree(fallbackModel);
      }
    }
    case AuthType.USE_GEMINI:
      return RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI;
    case AuthType.USE_VERTEX_AI:
      return RATE_LIMIT_ERROR_MESSAGE_VERTEX;
    default:
      return getRateLimitErrorMessageDefault(fallbackModel);
  }
}

export function parseAndFormatApiError(
  error: unknown,
  authType?: AuthType,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  if (isStructuredError(error)) {
    let text = `[API 错误: ${error.message}]`;
    if (error.status === 429) {
      text += getRateLimitMessage(
        authType,
        error,
        userTier,
        currentModel,
        fallbackModel,
      );
    }
    return text;
  }

  // 错误消息可能是一个包含 JSON 对象的字符串。
  if (typeof error === 'string') {
    const jsonStart = error.indexOf('{');
    if (jsonStart === -1) {
      return `[API 错误: ${error}]`; // 不是 JSON 错误，按原样返回。
    }

    const jsonString = error.substring(jsonStart);

    try {
      const parsedError = JSON.parse(jsonString) as unknown;
      if (isApiError(parsedError)) {
        let finalMessage = parsedError.error.message;
        try {
          // 查看消息是否是包含另一个错误的字符串化 JSON
          const nestedError = JSON.parse(finalMessage) as unknown;
          if (isApiError(nestedError)) {
            finalMessage = nestedError.error.message;
          }
        } catch (_e) {
          // 不是嵌套的 JSON 错误，所以我们按原样使用消息。
        }
        let text = `[API 错误: ${finalMessage} (状态: ${parsedError.error.status})]`;
        if (parsedError.error.code === 429) {
          text += getRateLimitMessage(
            authType,
            parsedError,
            userTier,
            currentModel,
            fallbackModel,
          );
        }
        return text;
      }
    } catch (_e) {
      // 不是有效的 JSON，继续执行并返回原始消息。
    }
    return `[API 错误: ${error}]`;
  }

  return '[API 错误: 发生未知错误。]';
}