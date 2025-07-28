/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@iflytek/iflycode-core';
import { vi } from 'vitest';
import { validateAuthMethod } from './auth.js';

vi.mock('./settings.js', () => ({
  loadEnvironment: vi.fn(),
}));

describe('validateAuthMethod', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null for LOGIN_WITH_GOOGLE', () => {
    expect(validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE)).toBeNull();
  });

  it('should return null for CLOUD_SHELL', () => {
    expect(validateAuthMethod(AuthType.CLOUD_SHELL)).toBeNull();
  });

  describe('USE_GEMINI', () => {
    it('should return null if GEMINI_API_KEY is set', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      expect(validateAuthMethod(AuthType.USE_GEMINI)).toBeNull();
    });

    it('should return an error message if GEMINI_API_KEY is not set', () => {
      expect(validateAuthMethod(AuthType.USE_GEMINI)).toBe(
        '未找到 GEMINI_API_KEY 环境变量。请将其添加到您的环境中，然后重试（如果使用 .env 文件则无需重新加载）！',
      );
    });
  });

  describe('USE_VERTEX_AI', () => {
    it('should return null if GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are set', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.GOOGLE_CLOUD_LOCATION = 'test-location';
      expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
    });

    it('should return null if GOOGLE_API_KEY is set', () => {
      process.env.GOOGLE_API_KEY = 'test-api-key';
      expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
    });

    it('should return an error message if no required environment variables are set', () => {
      expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBe(
        '使用 Vertex AI 时，您必须指定以下之一：\n' +
          '• GOOGLE_CLOUD_PROJECT 和 GOOGLE_CLOUD_LOCATION 环境变量。\n' +
          '• GOOGLE_API_KEY 环境变量（如果使用快速模式）。\n' +
          '请更新您的环境并重试（如果使用 .env 文件则无需重新加载）！',
      );
    });
  });

  it('should return an error message for an invalid auth method', () => {
    expect(validateAuthMethod('invalid-method')).toBe(
      '选择了无效的身份验证方法。',
    );
  });
});