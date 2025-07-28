/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { SessionMetrics } from '../contexts/SessionContext.js';

// 模拟上下文以提供受控数据用于测试
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = (metrics: SessionMetrics) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  });

  return render(<ModelStatsDisplay />);
};

describe('<ModelStatsDisplay />', () => {
  it('当没有活动模型时应渲染 "no API calls" 消息', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    expect(lastFrame()).toContain(
      'No API calls have been made in this session.',
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('如果没有模型具有相关数据，则不应显示条件行', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    const output = lastFrame();
    expect(output).not.toContain('Cached');
    expect(output).not.toContain('Thoughts');
    expect(output).not.toContain('Tool');
    expect(output).toMatchSnapshot();
  });

  it('如果至少有一个模型具有数据，则应显示条件行', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 5,
            thoughts: 2,
            tool: 0,
          },
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 50 },
          tokens: {
            prompt: 5,
            candidates: 10,
            total: 15,
            cached: 0,
            thoughts: 0,
            tool: 3,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    const output = lastFrame();
    expect(output).toContain('Cached');
    expect(output).toContain('Thoughts');
    expect(output).toContain('Tool');
    expect(output).toMatchSnapshot();
  });

  it('应正确显示多个模型的统计信息', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 1000 },
          tokens: {
            prompt: 100,
            candidates: 200,
            total: 300,
            cached: 50,
            thoughts: 10,
            tool: 5,
          },
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 20, totalErrors: 2, totalLatencyMs: 500 },
          tokens: {
            prompt: 200,
            candidates: 400,
            total: 600,
            cached: 100,
            thoughts: 20,
            tool: 10,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    const output = lastFrame();
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('gemini-2.5-flash');
    expect(output).toMatchSnapshot();
  });

  it('应处理大值而不换行或重叠', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: {
            totalRequests: 999999999,
            totalErrors: 123456789,
            totalLatencyMs: 9876,
          },
          tokens: {
            prompt: 987654321,
            candidates: 123456789,
            total: 999999999,
            cached: 123456789,
            thoughts: 111111111,
            tool: 222222222,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('应正确显示单个模型', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 5,
            thoughts: 2,
            tool: 1,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    const output = lastFrame();
    expect(output).toContain('gemini-2.5-pro');
    expect(output).not.toContain('gemini-2.5-flash');
    expect(output).toMatchSnapshot();
  });
});