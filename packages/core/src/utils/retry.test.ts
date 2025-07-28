/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff } from './retry.js';
import { setSimulate429 } from './testUtils.js';

// 定义一个带有 status 属性的错误接口
interface HttpError extends Error {
  status?: number;
}

// 辅助函数：创建一个在指定次数内失败的模拟函数
const createFailingFunction = (
  failures: number,
  successValue: string = 'success',
) => {
  let attempts = 0;
  return vi.fn(async () => {
    attempts++;
    if (attempts <= failures) {
      // 模拟可重试错误
      const error: HttpError = new Error(`模拟错误尝试 ${attempts}`);
      error.status = 500; // 模拟服务器错误
      throw error;
    }
    return successValue;
  });
};

// 自定义错误，用于测试不可重试的情况
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 禁用测试中的 429 模拟
    setSimulate429(false);
    // 抑制测试中预期错误的未处理 Promise 拒绝警告
    console.warn = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('如果第一次尝试成功，应返回结果', async () => {
    const mockFn = createFailingFunction(0);
    const result = await retryWithBackoff(mockFn);
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('如果失败次数在最大尝试次数内，应重试并成功', async () => {
    const mockFn = createFailingFunction(2);
    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    await vi.runAllTimersAsync(); // 确保所有延迟和重试完成

    const result = await promise;
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('如果所有尝试都失败，应抛出错误', async () => {
    const mockFn = createFailingFunction(3);

    // 1. 启动可重试操作，返回一个 Promise。
    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    // 2. 重要：立即向 Promise 附加拒绝预期。
    //    这确保在 Promise 可能被拒绝之前存在 'catch' 处理程序。
    //    结果是一个在断言满足时解析的新 Promise。
    const assertionPromise = expect(promise).rejects.toThrow(
      '模拟错误尝试 3',
    );

    // 3. 现在，推进计时器。这将触发重试和最终的拒绝。
    //    在步骤 2 中附加的处理程序将捕获它。
    await vi.runAllTimersAsync();

    // 4. 等待断言 Promise 本身以确保测试成功。
    await assertionPromise;

    // 5. 最后，断言调用次数。
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('如果 shouldRetry 返回 false，不应重试', async () => {
    const mockFn = vi.fn(async () => {
      throw new NonRetryableError('不可重试的错误');
    });
    const shouldRetry = (error: Error) => !(error instanceof NonRetryableError);

    const promise = retryWithBackoff(mockFn, {
      shouldRetry,
      initialDelayMs: 10,
    });

    await expect(promise).rejects.toThrow('不可重试的错误');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('如果未提供 shouldRetry，应使用默认值，在 429 时重试', async () => {
    const mockFn = vi.fn(async () => {
      const error = new Error('请求过多') as any;
      error.status = 429;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    // 在运行计时器之前附加拒绝预期
    const assertionPromise =
      expect(promise).rejects.toThrow('请求过多');

    // 运行计时器以触发重试和最终的拒绝
    await vi.runAllTimersAsync();

    // 等待断言
    await assertionPromise;

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('如果未提供 shouldRetry，应使用默认值，不在 400 时重试', async () => {
    const mockFn = vi.fn(async () => {
      const error = new Error('错误请求') as any;
      error.status = 400;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });
    await expect(promise).rejects.toThrow('错误请求');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('应遵守 maxDelayMs', async () => {
    const mockFn = createFailingFunction(3);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      maxDelayMs: 250, // 最大延迟小于 100 * 2 * 2 = 400
    });

    await vi.advanceTimersByTimeAsync(1000); // 大幅推进所有延迟
    await promise;

    const delays = setTimeoutSpy.mock.calls.map((call) => call[1] as number);

    // 延迟应约为初始值、初始值*2、最大延迟（由于上限）
    // 抖动使精确断言困难，因此我们检查范围/上限
    expect(delays.length).toBe(3);
    expect(delays[0]).toBeGreaterThanOrEqual(100 * 0.7);
    expect(delays[0]).toBeLessThanOrEqual(100 * 1.3);
    expect(delays[1]).toBeGreaterThanOrEqual(200 * 0.7);
    expect(delays[1]).toBeLessThanOrEqual(200 * 1.3);
    // 第三个延迟应由 maxDelayMs（250ms）限制，考虑抖动
    expect(delays[2]).toBeGreaterThanOrEqual(250 * 0.7);
    expect(delays[2]).toBeLessThanOrEqual(250 * 1.3);
  });

  it('应正确处理抖动，确保延迟变化', async () => {
    let mockFn = createFailingFunction(5);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    // 多次运行 retryWithBackoff 以观察抖动
    const runRetry = () =>
      retryWithBackoff(mockFn, {
        maxAttempts: 2, // 仅一次重试，所以一个延迟
        initialDelayMs: 100,
        maxDelayMs: 1000,
      });

    // 我们预期 mockFn 失败 5 次时被拒绝
    const promise1 = runRetry();
    // 在运行计时器之前附加拒绝预期
    const assertionPromise1 = expect(promise1).rejects.toThrow();
    await vi.runAllTimersAsync(); // 推进第一次 runRetry 中的延迟
    await assertionPromise1;

    const firstDelaySet = setTimeoutSpy.mock.calls.map(
      (call) => call[1] as number,
    );
    setTimeoutSpy.mockClear(); // 清除下一次运行的调用

    // 重置 mockFn 以重置其内部尝试计数器用于下一次运行
    mockFn = createFailingFunction(5); // 重新初始化为 5 次失败

    const promise2 = runRetry();
    // 在运行计时器之前附加拒绝预期
    const assertionPromise2 = expect(promise2).rejects.toThrow();
    await vi.runAllTimersAsync(); // 推进第二次 runRetry 中的延迟
    await assertionPromise2;

    const secondDelaySet = setTimeoutSpy.mock.calls.map(
      (call) => call[1] as number,
    );

    // 检查由于抖动延迟不完全相同
    // 这是一个概率测试，但 +/-30% 的抖动使其很可能不同。
    if (firstDelaySet.length > 0 && secondDelaySet.length > 0) {
      // 检查每组的第一个延迟
      expect(firstDelaySet[0]).not.toBe(secondDelaySet[0]);
    } else {
      // 如果未捕获延迟（例如测试设置问题），明确失败
      throw new Error('未捕获抖动测试的延迟');
    }

    // 确保延迟在预期的抖动范围内 [70, 130]（initialDelayMs = 100）
    [...firstDelaySet, ...secondDelaySet].forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(100 * 0.7);
      expect(d).toBeLessThanOrEqual(100 * 1.3);
    });
  });

  describe('OAuth 用户的 Flash 模型回退', () => {
    it('在持续的 429 错误后，应为 OAuth 个人用户触发回退', async () => {
      const fallbackCallback = vi.fn().mockResolvedValue('gemini-2.5-flash');

      let fallbackOccurred = false;
      const mockFn = vi.fn().mockImplementation(async () => {
        if (!fallbackOccurred) {
          const error: HttpError = new Error('超出速率限制');
          error.status = 429;
          throw error;
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: async (authType?: string) => {
          fallbackOccurred = true;
          return await fallbackCallback(authType);
        },
        authType: 'oauth-personal',
      });

      // 推进所有计时器以完成重试
      await vi.runAllTimersAsync();

      // 回退后应成功
      await expect(promise).resolves.toBe('success');

      // 验证回调使用正确的认证类型被调用
      expect(fallbackCallback).toHaveBeenCalledWith('oauth-personal');

      // 回退后应再次重试
      expect(mockFn).toHaveBeenCalledTimes(3); // 2 次初始尝试 + 1 次回退后尝试
    });

    it('不应为 API 密钥用户触发回退', async () => {
      const fallbackCallback = vi.fn();

      const mockFn = vi.fn(async () => {
        const error: HttpError = new Error('超出速率限制');
        error.status = 429;
        throw error;
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: fallbackCallback,
        authType: 'gemini-api-key',
      });

      // 正确处理 Promise 以避免未处理的拒绝
      const resultPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // 所有重试后应失败而无回退
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('超出速率限制');

      // API 密钥用户不应调用回调
      expect(fallbackCallback).not.toHaveBeenCalled();
    });

    it('回退成功后应重置尝试计数器并继续', async () => {
      let fallbackCalled = false;
      const fallbackCallback = vi.fn().mockImplementation(async () => {
        fallbackCalled = true;
        return 'gemini-2.5-flash';
      });

      const mockFn = vi.fn().mockImplementation(async () => {
        if (!fallbackCalled) {
          const error: HttpError = new Error('超出速率限制');
          error.status = 429;
          throw error;
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: fallbackCallback,
        authType: 'oauth-personal',
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');
      expect(fallbackCallback).toHaveBeenCalledOnce();
    });

    it('如果回退被拒绝，应继续使用原始错误', async () => {
      const fallbackCallback = vi.fn().mockResolvedValue(null); // 用户拒绝回退

      const mockFn = vi.fn(async () => {
        const error: HttpError = new Error('超出速率限制');
        error.status = 429;
        throw error;
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: fallbackCallback,
        authType: 'oauth-personal',
      });

      // 正确处理 Promise 以避免未处理的拒绝
      const resultPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // 回退被拒绝时应使用原始错误失败
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('超出速率限制');
      expect(fallbackCallback).toHaveBeenCalledWith(
        'oauth-personal',
        expect.any(Error),
      );
    });

    it('应处理混合错误类型（仅计算连续的 429）', async () => {
      const fallbackCallback = vi.fn().mockResolvedValue('gemini-2.5-flash');
      let attempts = 0;
      let fallbackOccurred = false;

      const mockFn = vi.fn().mockImplementation(async () => {
        attempts++;
        if (fallbackOccurred) {
          return 'success';
        }
        if (attempts === 1) {
          // 第一次尝试：500 错误（重置连续计数）
          const error: HttpError = new Error('服务器错误');
          error.status = 500;
          throw error;
        } else {
          // 剩余尝试：429 错误
          const error: HttpError = new Error('超出速率限制');
          error.status = 429;
          throw error;
        }
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 5,
        initialDelayMs: 100,
        onPersistent429: async (authType?: string) => {
          fallbackOccurred = true;
          return await fallbackCallback(authType);
        },
        authType: 'oauth-personal',
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');

      // 应在 2 次连续 429 后触发回退（尝试 2-3）
      expect(fallbackCallback).toHaveBeenCalledWith('oauth-personal');
    });
  });
});