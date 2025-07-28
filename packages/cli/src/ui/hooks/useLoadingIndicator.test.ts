/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadingIndicator } from './useLoadingIndicator.js';
import { StreamingState } from '../types.js';
import {
  WITTY_LOADING_PHRASES,
  PHRASE_CHANGE_INTERVAL_MS,
} from './usePhraseCycler.js';

describe('useLoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers(); // 每次测试后恢复真实计时器
    act(() => vi.runOnlyPendingTimers);
  });

  it('应在空闲时使用默认值初始化', () => {
    const { result } = renderHook(() =>
      useLoadingIndicator(StreamingState.Idle),
    );
    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);
  });

  it('应在响应时反映值', async () => {
    const { result } = renderHook(() =>
      useLoadingIndicator(StreamingState.Responding),
    );

    // 计时器推进前的初始状态
    expect(result.current.elapsedTime).toBe(0);
    expect(WITTY_LOADING_PHRASES).toContain(
      result.current.currentLoadingPhrase,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 1);
    });

    // 如果已过去 PHRASE_CHANGE_INTERVAL_MS，短语应循环
    expect(WITTY_LOADING_PHRASES).toContain(
      result.current.currentLoadingPhrase,
    );
  });

  it('在等待确认时应显示等待短语并保留 elapsedTime', async () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useLoadingIndicator(streamingState),
      { initialProps: { streamingState: StreamingState.Responding } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(result.current.elapsedTime).toBe(60);

    act(() => {
      rerender({ streamingState: StreamingState.WaitingForConfirmation });
    });

    expect(result.current.currentLoadingPhrase).toBe(
      '等待用户确认...',
    );
    expect(result.current.elapsedTime).toBe(60); // 应保留已用时间

    // 计时器不应继续推进
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.elapsedTime).toBe(60);
  });

  it('从等待确认转换到响应时应重置 elapsedTime 并使用机智短语', async () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useLoadingIndicator(streamingState),
      { initialProps: { streamingState: StreamingState.Responding } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000); // 5秒
    });
    expect(result.current.elapsedTime).toBe(5);

    act(() => {
      rerender({ streamingState: StreamingState.WaitingForConfirmation });
    });
    expect(result.current.elapsedTime).toBe(5);
    expect(result.current.currentLoadingPhrase).toBe(
      '等待用户确认...',
    );

    act(() => {
      rerender({ streamingState: StreamingState.Responding });
    });
    expect(result.current.elapsedTime).toBe(0); // 应重置
    expect(WITTY_LOADING_PHRASES).toContain(
      result.current.currentLoadingPhrase,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.elapsedTime).toBe(1);
  });

  it('当 streamingState 从响应变为空闲时应重置计时器和短语', async () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useLoadingIndicator(streamingState),
      { initialProps: { streamingState: StreamingState.Responding } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000); // 10秒
    });
    expect(result.current.elapsedTime).toBe(10);

    act(() => {
      rerender({ streamingState: StreamingState.Idle });
    });

    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);

    // 计时器不应推进
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.elapsedTime).toBe(0);
  });
});