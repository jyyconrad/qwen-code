/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type {
  Counter,
  Meter,
  Attributes,
  Context,
  Histogram,
} from '@opentelemetry/api';
import { Config } from '../config/config.js';
import { FileOperation } from './metrics.js';

const mockCounterAddFn: Mock<
  (value: number, attributes?: Attributes, context?: Context) => void
> = vi.fn();
const mockHistogramRecordFn: Mock<
  (value: number, attributes?: Attributes, context?: Context) => void
> = vi.fn();

const mockCreateCounterFn: Mock<(name: string, options?: unknown) => Counter> =
  vi.fn();
const mockCreateHistogramFn: Mock<
  (name: string, options?: unknown) => Histogram
> = vi.fn();

const mockCounterInstance = {
  add: mockCounterAddFn,
} as unknown as Counter;

const mockHistogramInstance = {
  record: mockHistogramRecordFn,
} as unknown as Histogram;

const mockMeterInstance = {
  createCounter: mockCreateCounterFn.mockReturnValue(mockCounterInstance),
  createHistogram: mockCreateHistogramFn.mockReturnValue(mockHistogramInstance),
} as unknown as Meter;

function originalOtelMockFactory() {
  return {
    metrics: {
      getMeter: vi.fn(),
    },
    ValueType: {
      INT: 1,
    },
  };
}

vi.mock('@opentelemetry/api', originalOtelMockFactory);

describe('遥测指标', () => {
  let initializeMetricsModule: typeof import('./metrics.js').initializeMetrics;
  let recordTokenUsageMetricsModule: typeof import('./metrics.js').recordTokenUsageMetrics;
  let recordFileOperationMetricModule: typeof import('./metrics.js').recordFileOperationMetric;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@opentelemetry/api', () => {
      const actualApi = originalOtelMockFactory();
      (actualApi.metrics.getMeter as Mock).mockReturnValue(mockMeterInstance);
      return actualApi;
    });

    const metricsJsModule = await import('./metrics.js');
    initializeMetricsModule = metricsJsModule.initializeMetrics;
    recordTokenUsageMetricsModule = metricsJsModule.recordTokenUsageMetrics;
    recordFileOperationMetricModule = metricsJsModule.recordFileOperationMetric;

    const otelApiModule = await import('@opentelemetry/api');

    mockCounterAddFn.mockClear();
    mockCreateCounterFn.mockClear();
    mockCreateHistogramFn.mockClear();
    mockHistogramRecordFn.mockClear();
    (otelApiModule.metrics.getMeter as Mock).mockClear();

    (otelApiModule.metrics.getMeter as Mock).mockReturnValue(mockMeterInstance);
    mockCreateCounterFn.mockReturnValue(mockCounterInstance);
    mockCreateHistogramFn.mockReturnValue(mockHistogramInstance);
  });

  describe('recordTokenUsageMetrics', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
    } as unknown as Config;

    it('如果未初始化则不应记录指标', () => {
      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 100, 'input');
      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('应使用正确的属性记录令牌使用情况', () => {
      initializeMetricsModule(mockConfig);
      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 100, 'input');
      expect(mockCounterAddFn).toHaveBeenCalledTimes(2);
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(1, 1, {
        'session.id': 'test-session-id',
      });
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(2, 100, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'input',
      });
    });

    it('应记录不同类型的令牌使用情况', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 50, 'output');
      expect(mockCounterAddFn).toHaveBeenCalledWith(50, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'output',
      });

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 25, 'thought');
      expect(mockCounterAddFn).toHaveBeenCalledWith(25, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'thought',
      });

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 75, 'cache');
      expect(mockCounterAddFn).toHaveBeenCalledWith(75, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'cache',
      });

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 125, 'tool');
      expect(mockCounterAddFn).toHaveBeenCalledWith(125, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'tool',
      });
    });

    it('应处理不同的模型', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordTokenUsageMetricsModule(mockConfig, 'gemini-ultra', 200, 'input');
      expect(mockCounterAddFn).toHaveBeenCalledWith(200, {
        'session.id': 'test-session-id',
        model: 'gemini-ultra',
        type: 'input',
      });
    });
  });

  describe('recordFileOperationMetric', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
    } as unknown as Config;

    it('如果未初始化则不应记录指标', () => {
      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.CREATE,
        10,
        'text/plain',
        'txt',
      );
      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('应记录包含所有属性的文件创建操作', () => {
      initializeMetricsModule(mockConfig);
      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.CREATE,
        10,
        'text/plain',
        'txt',
      );

      expect(mockCounterAddFn).toHaveBeenCalledTimes(2);
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(1, 1, {
        'session.id': 'test-session-id',
      });
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(2, 1, {
        'session.id': 'test-session-id',
        operation: FileOperation.CREATE,
        lines: 10,
        mimetype: 'text/plain',
        extension: 'txt',
      });
    });

    it('应记录包含最少属性的文件读取操作', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(mockConfig, FileOperation.READ);
      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.READ,
      });
    });

    it('应记录包含部分属性的文件更新操作', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.UPDATE,
        undefined,
        'application/javascript',
      );
      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
        mimetype: 'application/javascript',
      });
    });
  });
});