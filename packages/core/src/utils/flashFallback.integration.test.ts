/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Config } from '../config/config.js';
import {
  setSimulate429,
  disableSimulationAfterFallback,
  shouldSimulate429,
  createSimulated429Error,
  resetRequestCounter,
} from './testUtils.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { retryWithBackoff } from './retry.js';
import { AuthType } from '../core/contentGenerator.js';

describe('Flash Fallback Integration', () => {
  let config: Config;

  beforeEach(() => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: 'gemini-2.5-pro',
    });

    // 为每个测试重置模拟状态
    setSimulate429(false);
    resetRequestCounter();
  });

  it('应自动接受回退', async () => {
    // 设置一个最小的 flash 回退处理器用于测试
    const flashFallbackHandler = async (): Promise<boolean> => true;

    config.setFlashFallbackHandler(flashFallbackHandler);

    // 直接调用处理器进行测试
    const result = await config.flashFallbackHandler!(
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );

    // 验证它自动接受了回退
    expect(result).toBe(true);
  });

  it('应在连续2次429错误后为OAuth用户触发回退', async () => {
    let fallbackCalled = false;
    let fallbackModel = '';

    // 模拟函数，恰好产生2次429错误，然后在回退后成功
    const mockApiCall = vi
      .fn()
      .mockRejectedValueOnce(createSimulated429Error())
      .mockRejectedValueOnce(createSimulated429Error())
      .mockResolvedValueOnce('success after fallback');

    // 模拟回退处理器
    const mockFallbackHandler = vi.fn(async (_authType?: string) => {
      fallbackCalled = true;
      fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;
      return fallbackModel;
    });

    // 使用OAuth个人认证类型进行测试，maxAttempts = 2以确保触发回退
    const result = await retryWithBackoff(mockApiCall, {
      maxAttempts: 2,
      initialDelayMs: 1,
      maxDelayMs: 10,
      shouldRetry: (error: Error) => {
        const status = (error as Error & { status?: number }).status;
        return status === 429;
      },
      onPersistent429: mockFallbackHandler,
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    // 验证回退已被触发
    expect(fallbackCalled).toBe(true);
    expect(fallbackModel).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    expect(mockFallbackHandler).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
      expect.any(Error),
    );
    expect(result).toBe('success after fallback');
    // 应该有：2次失败，然后触发回退，然后重试重置后1次成功
    expect(mockApiCall).toHaveBeenCalledTimes(3);
  });

  it('不应为API密钥用户触发回退', async () => {
    let fallbackCalled = false;

    // 模拟产生429错误的函数
    const mockApiCall = vi.fn().mockRejectedValue(createSimulated429Error());

    // 模拟回退处理器
    const mockFallbackHandler = vi.fn(async () => {
      fallbackCalled = true;
      return DEFAULT_GEMINI_FLASH_MODEL;
    });

    // 使用API密钥认证类型进行测试 - 不应触发回退
    try {
      await retryWithBackoff(mockApiCall, {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        shouldRetry: (error: Error) => {
          const status = (error as Error & { status?: number }).status;
          return status === 429;
        },
        onPersistent429: mockFallbackHandler,
        authType: AuthType.USE_GEMINI, // API密钥认证类型
      });
    } catch (error) {
      // 预期在最大尝试次数后抛出异常
      expect((error as Error).message).toContain('Rate limit exceeded');
    }

    // 验证对于API密钥用户未触发回退
    expect(fallbackCalled).toBe(false);
    expect(mockFallbackHandler).not.toHaveBeenCalled();
  });

  it('应在回退后正确禁用模拟状态', () => {
    // 启用模拟
    setSimulate429(true);

    // 验证模拟已启用
    expect(shouldSimulate429()).toBe(true);

    // 在回退后禁用模拟
    disableSimulationAfterFallback();

    // 验证模拟现在已禁用
    expect(shouldSimulate429()).toBe(false);
  });
});