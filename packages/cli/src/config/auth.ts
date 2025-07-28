/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@iflytek/iflycode-core';
import { loadEnvironment } from './settings.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.CLOUD_SHELL
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return '未找到 GEMINI_API_KEY 环境变量。请将其添加到您的环境中，然后重试（如果使用 .env 文件则无需重新加载）！';
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env.GOOGLE_CLOUD_PROJECT && !!process.env.GOOGLE_CLOUD_LOCATION;
    const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        '使用 Vertex AI 时，您必须指定以下之一：\n' +
        '• GOOGLE_CLOUD_PROJECT 和 GOOGLE_CLOUD_LOCATION 环境变量。\n' +
        '• GOOGLE_API_KEY 环境变量（如果使用快速模式）。\n' +
        '请更新您的环境并重试（如果使用 .env 文件则无需重新加载）！'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_OPENAI) {
    if (!process.env.OPENAI_API_KEY) {
      return '未找到 OPENAI_API_KEY 环境变量。您可以交互式输入或将其添加到您的 .env 文件中。';
    }
    return null;
  }

  return '选择了无效的身份验证方法。';
};

export const setOpenAIApiKey = (apiKey: string): void => {
  process.env.OPENAI_API_KEY = apiKey;
};

export const setOpenAIBaseUrl = (baseUrl: string): void => {
  process.env.OPENAI_BASE_URL = baseUrl;
};

export const setOpenAIModel = (model: string): void => {
  process.env.OPENAI_MODEL = model;
};