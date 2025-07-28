/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../config/models.js';

/**
 * 检查默认的 "pro" 模型是否被限速，如果需要则返回备用的 "flash" 模型。此函数设计为静默运行。
 * @param apiKey 用于检查的 API 密钥。
 * @param currentConfiguredModel 当前在设置中配置的模型。
 * @returns 一个对象，指示要使用的模型、是否发生了切换，
 *          以及如果发生切换时的原始模型。
 */
export async function getEffectiveModel(
  apiKey: string,
  currentConfiguredModel: string,
): Promise<string> {
  if (currentConfiguredModel !== DEFAULT_GEMINI_MODEL) {
    // 仅当用户尝试使用我们想要回退的特定 pro 模型时才检查。
    return currentConfiguredModel;
  }

  const modelToTest = DEFAULT_GEMINI_MODEL;
  const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTest}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: 'test' }] }],
    generationConfig: {
      maxOutputTokens: 1,
      temperature: 0,
      topK: 1,
      thinkingConfig: { thinkingBudget: 128, includeThoughts: false },
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 500ms timeout for the request

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      console.log(
        `[INFO] 您配置的模型 (${modelToTest}) 暂时不可用。本次会话已切换到 ${fallbackModel}。`,
      );
      return fallbackModel;
    }
    // 对于任何其他情况（成功、其他错误代码），我们坚持使用原始模型。
    return currentConfiguredModel;
  } catch (_error) {
    clearTimeout(timeoutId);
    // 超时或任何其他获取错误时，坚持使用原始模型。
    return currentConfiguredModel;
  }
}