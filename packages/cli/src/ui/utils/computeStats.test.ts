/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAverageLatency,
  calculateCacheHitRate,
  calculateErrorRate,
  computeSessionStats,
} from './computeStats.js';
import { ModelMetrics, SessionMetrics } from '../contexts/SessionContext.js';

describe('calculateErrorRate', () => {
  it('如果 totalRequests 为 0，应返回 0', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateErrorRate(metrics)).toBe(0);
  });

  it('应正确计算错误率', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 10, totalErrors: 2, totalLatencyMs: 0 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateErrorRate(metrics)).toBe(20);
  });
});

describe('calculateAverageLatency', () => {
  it('如果 totalRequests 为 0，应返回 0', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 1000 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateAverageLatency(metrics)).toBe(0);
  });

  it('应正确计算平均延迟', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 10, totalErrors: 0, totalLatencyMs: 1500 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateAverageLatency(metrics)).toBe(150);
  });
});

describe('calculateCacheHitRate', () => {
  it('如果提示词令牌为 0，应返回 0', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 100,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateCacheHitRate(metrics)).toBe(0);
  });

  it('应正确计算缓存命中率', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
      tokens: {
        prompt: 200,
        candidates: 0,
        total: 0,
        cached: 50,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateCacheHitRate(metrics)).toBe(25);
  });
});

describe('computeSessionStats', () => {
  it('对于初始空指标，应返回全零', () => {
    const metrics: SessionMetrics = {
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

    const result = computeSessionStats(metrics);

    expect(result).toEqual({
      totalApiTime: 0,
      totalToolTime: 0,
      agentActiveTime: 0,
      apiTimePercent: 0,
      toolTimePercent: 0,
      cacheEfficiency: 0,
      totalDecisions: 0,
      successRate: 0,
      agreementRate: 0,
      totalPromptTokens: 0,
      totalCachedTokens: 0,
    });
  });

  it('应正确计算 API 和工具时间百分比', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 750 },
          tokens: {
            prompt: 10,
            candidates: 10,
            total: 20,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        },
      },
      tools: {
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 250,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    const result = computeSessionStats(metrics);

    expect(result.totalApiTime).toBe(750);
    expect(result.totalToolTime).toBe(250);
    expect(result.agentActiveTime).toBe(1000);
    expect(result.apiTimePercent).toBe(75);
    expect(result.toolTimePercent).toBe(25);
  });

  it('应正确计算缓存效率', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-pro': {
          api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 1000 },
          tokens: {
            prompt: 150,
            candidates: 10,
            total: 160,
            cached: 50,
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

    const result = computeSessionStats(metrics);

    expect(result.cacheEfficiency).toBeCloseTo(33.33); // 50 / 150
  });

  it('应正确计算成功率和一致率', () => {
    const metrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 10,
        totalSuccess: 8,
        totalFail: 2,
        totalDurationMs: 1000,
        totalDecisions: { accept: 6, reject: 2, modify: 2 },
        byName: {},
      },
    };

    const result = computeSessionStats(metrics);

    expect(result.successRate).toBe(80); // 8 / 10
    expect(result.agreementRate).toBe(60); // 6 / 10
  });

  it('应优雅地处理除零情况', () => {
    const metrics: SessionMetrics = {
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

    const result = computeSessionStats(metrics);

    expect(result.apiTimePercent).toBe(0);
    expect(result.toolTimePercent).toBe(0);
    expect(result.cacheEfficiency).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.agreementRate).toBe(0);
  });
});