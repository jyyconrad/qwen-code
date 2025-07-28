/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { StatsDisplay } from './StatsDisplay.js';
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

  return render(<StatsDisplay duration="1s" />);
};

describe('<StatsDisplay />', () => {
  it('仅在其零状态下渲染 Performance 部分', () => {
    const zeroMetrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    const { lastFrame } = renderWithMockedStats(zeroMetrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).not.toContain('Interaction Summary');
    expect(output).not.toContain('Efficiency & Optimizations');
    expect(output).not.toContain('Model'); // 表格标题
    expect(output).toMatchSnapshot();
  });

  it('正确渲染包含两个模型的表格', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 15000 },
          tokens: {
            prompt: 1000,
            candidates: 2000,
            total: 43234,
            cached: 500,
            thoughts: 100,
            tool: 50,
          },
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 5, totalErrors: 1, totalLatencyMs: 4500 },
          tokens: {
            prompt: 25000,
            candidates: 15000,
            total: 150000000,
            cached: 10000,
            thoughts: 2000,
            tool: 1000,
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
    };

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('gemini-2.5-flash');
    expect(output).toContain('1,000');
    expect(output).toContain('25,000');
    expect(output).toMatchSnapshot();
  });

  it('当所有数据都存在时渲染所有部分', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 100,
            candidates: 100,
            total: 250,
            cached: 50,
            thoughts: 0,
            tool: 0,
          },
        },
      },
      tools: {
        totalCalls: 2,
        totalSuccess: 1,
        totalFail: 1,
        totalDurationMs: 123,
        totalDecisions: { accept: 1, reject: 0, modify: 0 },
        byName: {
          'test-tool': {
            count: 2,
            success: 1,
            fail: 1,
            durationMs: 123,
            decisions: { accept: 1, reject: 0, modify: 0 },
          },
        },
      },
    };

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).toContain('Interaction Summary');
    expect(output).toContain('User Agreement');
    expect(output).toContain('Savings Highlight');
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toMatchSnapshot();
  });

  describe('条件渲染测试', () => {
    it('当未做出决策时隐藏 User Agreement', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 2,
          totalSuccess: 1,
          totalFail: 1,
          totalDurationMs: 123,
          totalDecisions: { accept: 0, reject: 0, modify: 0 }, // 无决策
          byName: {
            'test-tool': {
              count: 2,
              success: 1,
              fail: 1,
              durationMs: 123,
              decisions: { accept: 0, reject: 0, modify: 0 },
            },
          },
        },
      };

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toContain('Interaction Summary');
      expect(output).toContain('Success Rate');
      expect(output).not.toContain('User Agreement');
      expect(output).toMatchSnapshot();
    });

    it('当未使用缓存时隐藏 Efficiency 部分', () => {
      const metrics: SessionMetrics = {
        models: {
          'gemini-2.5-pro': {
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              prompt: 100,
              candidates: 100,
              total: 200,
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
      };

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).not.toContain('Efficiency & Optimizations');
      expect(output).toMatchSnapshot();
    });
  });

  describe('条件颜色测试', () => {
    it('高值时以绿色渲染成功率', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 10,
          totalSuccess: 10,
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0 },
          byName: {},
        },
      };
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('中等值时以黄色渲染成功率', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 10,
          totalSuccess: 9,
          totalFail: 1,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0 },
          byName: {},
        },
      };
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('低值时以红色渲染成功率', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 10,
          totalSuccess: 5,
          totalFail: 5,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0 },
          byName: {},
        },
      };
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('标题渲染', () => {
    const zeroMetrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    it('未提供 title 属性时渲染默认标题', () => {
      const { lastFrame } = renderWithMockedStats(zeroMetrics);
      const output = lastFrame();
      expect(output).toContain('Session Stats');
      expect(output).not.toContain('Agent powering down');
      expect(output).toMatchSnapshot();
    });

    it('提供 title 属性时渲染自定义标题', () => {
      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionStartTime: new Date(),
          metrics: zeroMetrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },

        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = render(
        <StatsDisplay duration="1s" title="Agent powering down. Goodbye!" />,
      );
      const output = lastFrame();
      expect(output).toContain('Agent powering down. Goodbye!');
      expect(output).not.toContain('Session Stats');
      expect(output).toMatchSnapshot();
    });
  });
});