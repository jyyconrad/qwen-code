/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimer } from './useTimer.js';

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应初始化为 0', () => {
    const { result } = renderHook(() => useTimer(false, 0));
    expect(result.current).toBe(0);
  });

  it('如果 isActive 为 false，则不应增加时间', () => {
    const { result } = renderHook(() => useTimer(false, 0));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it('如果 isActive 为 true，则每秒增加时间', () => {
    const { result } = renderHook(() => useTimer(true, 0));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(3);
  });

  it('当 isActive 从 false 变为 true 时，应重置为 0 并开始递增', () => {
    const { result, rerender } = renderHook(
      ({ isActive, resetKey }) => useTimer(isActive, resetKey),
      { initialProps: { isActive: false, resetKey: 0 } },
    );
    expect(result.current).toBe(0);

    rerender({ isActive: true, resetKey: 0 });
    expect(result.current).toBe(0); // 激活时应重置为 0

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });

  it('当 resetKey 改变时，即使处于活动状态也应重置为 0', () => {
    const { result, rerender } = renderHook(
      ({ isActive, resetKey }) => useTimer(isActive, resetKey),
      { initialProps: { isActive: true, resetKey: 0 } },
    );
    act(() => {
      vi.advanceTimersByTime(3000); // 3秒
    });
    expect(result.current).toBe(3);

    rerender({ isActive: true, resetKey: 1 }); // 更改 resetKey
    expect(result.current).toBe(0); // 应重置为 0

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1); // 从 0 开始递增
  });

  it('如果 isActive 为 false，无论 resetKey 如何变化，都应为 0', () => {
    const { result, rerender } = renderHook(
      ({ isActive, resetKey }) => useTimer(isActive, resetKey),
      { initialProps: { isActive: false, resetKey: 0 } },
    );
    expect(result.current).toBe(0);

    rerender({ isActive: false, resetKey: 1 });
    expect(result.current).toBe(0);
  });

  it('应在卸载时清除计时器', () => {
    const { unmount } = renderHook(() => useTimer(true, 0));
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('当 isActive 变为 false 时应保留已用时间，再次变为 active 时应重置为 0', () => {
    const { result, rerender } = renderHook(
      ({ isActive, resetKey }) => useTimer(isActive, resetKey),
      { initialProps: { isActive: true, resetKey: 0 } },
    );

    act(() => {
      vi.advanceTimersByTime(3000); // 前进到 3 秒
    });
    expect(result.current).toBe(3);

    rerender({ isActive: false, resetKey: 0 });
    expect(result.current).toBe(3); // 计时器变为非活动状态时应保留时间

    // 现在再次激活，应重置为 0
    rerender({ isActive: true, resetKey: 0 });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });
});