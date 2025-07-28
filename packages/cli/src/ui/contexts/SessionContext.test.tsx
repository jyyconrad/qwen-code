/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type MutableRefObject } from 'react';
import { render } from 'ink-testing-library';
import { renderHook } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import {
  SessionStatsProvider,
  useSessionStats,
  SessionMetrics,
} from './SessionContext.js';
import { describe, it, expect, vi } from 'vitest';
import { uiTelemetryService } from '@iflytek/iflycode-core';

/**
 * 一个测试工具组件，使用该 hook 并通过可变引用暴露上下文值。
 * 这允许我们在测试中直接与上下文的函数交互并对其状态进行断言。
 */
const TestHarness = ({
  contextRef,
}: {
  contextRef: MutableRefObject<ReturnType<typeof useSessionStats> | undefined>;
}) => {
  contextRef.current = useSessionStats();
  return null;
};

describe('SessionStatsContext', () => {
  it('应提供正确的初始状态', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    const stats = contextRef.current?.stats;

    expect(stats?.sessionStartTime).toBeInstanceOf(Date);
    expect(stats?.metrics).toBeDefined();
    expect(stats?.metrics.models).toEqual({});
  });

  it('当 uiTelemetryService 发出更新时应更新指标', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    const newMetrics: SessionMetrics = {
      models: {
        'gemini-pro': {
          api: {
            totalRequests: 1,
            totalErrors: 0,
            totalLatencyMs: 123,
          },
          tokens: {
            prompt: 100,
            candidates: 200,
            total: 300,
            cached: 50,
            thoughts: 20,
            tool: 10,
          },
        },
      },
      tools: {
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 456,
        totalDecisions: {
          accept: 1,
          reject: 0,
          modify: 0,
        },
        byName: {
          'test-tool': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 456,
            decisions: {
              accept: 1,
              reject: 0,
              modify: 0,
            },
          },
        },
      },
    };

    act(() => {
      uiTelemetryService.emit('update', {
        metrics: newMetrics,
        lastPromptTokenCount: 100,
      });
    });

    const stats = contextRef.current?.stats;
    expect(stats?.metrics).toEqual(newMetrics);
    expect(stats?.lastPromptTokenCount).toBe(100);
  });

  it('当 useSessionStats 在提供者外部使用时应抛出错误', () => {
    // 为此测试抑制 console.error，因为我们预期会出现错误
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      // 期望 renderHook 本身在 hook 在提供者外部使用时抛出异常
      expect(() => {
        renderHook(() => useSessionStats());
      }).toThrow('useSessionStats must be used within a SessionStatsProvider');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});