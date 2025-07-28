/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePhraseCycler,
  WITTY_LOADING_PHRASES,
  PHRASE_CHANGE_INTERVAL_MS,
} from './usePhraseCycler.js';

describe('usePhraseCycler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('当未激活且未等待时，应使用第一个诙谐短语初始化', () => {
    const { result } = renderHook(() => usePhraseCycler(false, false));
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);
  });

  it('当 isWaiting 为 true 时，应显示 "Waiting for user confirmation..."', () => {
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: true, isWaiting: false } },
    );
    rerender({ isActive: true, isWaiting: true });
    expect(result.current).toBe('Waiting for user confirmation...');
  });

  it('如果 isActive 为 false 且未等待，则不应循环短语', () => {
    const { result } = renderHook(() => usePhraseCycler(false, false));
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS * 2);
    });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);
  });

  it('当 isActive 为 true 且未等待时，应循环显示诙谐短语', () => {
    const { result } = renderHook(() => usePhraseCycler(true, false));
    // 初始短语应为诙谐短语之一
    expect(WITTY_LOADING_PHRASES).toContain(result.current);
    const _initialPhrase = result.current;

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    // 短语应更改并为诙谐短语之一
    expect(WITTY_LOADING_PHRASES).toContain(result.current);

    const _secondPhrase = result.current;
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(WITTY_LOADING_PHRASES).toContain(result.current);
  });

  it('当 isActive 从 false 变为 true 后（且未等待），应重置为诙谐短语', () => {
    // 确保至少有两个短语以使此测试有意义。
    if (WITTY_LOADING_PHRASES.length < 2) {
      return;
    }

    // 模拟 Math.random 以使测试具有确定性。
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      // 循环 0, 1, 0, 1, ...
      const val = callCount % 2;
      callCount++;
      return val / WITTY_LOADING_PHRASES.length;
    });

    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: false, isWaiting: false } },
    );

    // 激活
    rerender({ isActive: true, isWaiting: false });
    const firstActivePhrase = result.current;
    expect(WITTY_LOADING_PHRASES).toContain(firstActivePhrase);
    // 使用我们的模拟，这应为第一个短语。
    expect(firstActivePhrase).toBe(WITTY_LOADING_PHRASES[0]);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });

    // 短语应更改为第二个短语。
    expect(result.current).not.toBe(firstActivePhrase);
    expect(result.current).toBe(WITTY_LOADING_PHRASES[1]);

    // 设置为非激活 - 应重置为默认初始短语
    rerender({ isActive: false, isWaiting: false });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);

    // 重新设置为激活 - 应随机选择一个诙谐短语（由我们的模拟控制）
    act(() => {
      rerender({ isActive: true, isWaiting: false });
    });
    // 随机模拟现在将返回 0，因此应再次为第一个短语。
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);
  });

  it('当激活时，在卸载时应清除短语间隔', () => {
    const { unmount } = renderHook(() => usePhraseCycler(true, false));
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('当从等待状态转换到激活状态时，应重置为诙谐短语', () => {
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: true, isWaiting: false } },
    );

    const _initialPhrase = result.current;
    expect(WITTY_LOADING_PHRASES).toContain(_initialPhrase);

    // 循环到不同短语（可能）
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    if (WITTY_LOADING_PHRASES.length > 1) {
      // 此检查在随机选择时具有概率性
    }
    expect(WITTY_LOADING_PHRASES).toContain(result.current);

    // 进入等待状态
    rerender({ isActive: false, isWaiting: true });
    expect(result.current).toBe('Waiting for user confirmation...');

    // 返回到激活循环 - 应随机选择一个诙谐短语
    rerender({ isActive: true, isWaiting: false });
    expect(WITTY_LOADING_PHRASES).toContain(result.current);
  });
});