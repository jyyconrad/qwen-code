/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatDuration, formatMemoryUsage } from './formatters.js';

describe('formatters', () => {
  describe('formatMemoryUsage', () => {
    it('应将字节格式化为 KB', () => {
      expect(formatMemoryUsage(12345)).toBe('12.1 KB');
    });

    it('应将字节格式化为 MB', () => {
      expect(formatMemoryUsage(12345678)).toBe('11.8 MB');
    });

    it('应将字节格式化为 GB', () => {
      expect(formatMemoryUsage(12345678901)).toBe('11.50 GB');
    });
  });

  describe('formatDuration', () => {
    it('应格式化小于一秒的毫秒数', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('应格式化持续时间为 0', () => {
      expect(formatDuration(0)).toBe('0s');
    });

    it('应格式化整秒数', () => {
      expect(formatDuration(5000)).toBe('5.0s');
    });

    it('应格式化带一位小数的秒数持续时间', () => {
      expect(formatDuration(12345)).toBe('12.3s');
    });

    it('应格式化整分钟数', () => {
      expect(formatDuration(120000)).toBe('2m');
    });

    it('应格式化分钟和秒数的持续时间', () => {
      expect(formatDuration(123000)).toBe('2m 3s');
    });

    it('应格式化整小时数', () => {
      expect(formatDuration(3600000)).toBe('1h');
    });

    it('应格式化小时和秒数的持续时间', () => {
      expect(formatDuration(3605000)).toBe('1h 5s');
    });

    it('应格式化小时、分钟和秒数的持续时间', () => {
      expect(formatDuration(3723000)).toBe('1h 2m 3s');
    });

    it('应处理大持续时间', () => {
      expect(formatDuration(86400000 + 3600000 + 120000 + 1000)).toBe(
        '25h 2m 1s',
      );
    });

    it('应处理负持续时间', () => {
      expect(formatDuration(-100)).toBe('0s');
    });
  });
});