/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { CommandContext } from '../ui/commands/types.js';
import { LoadedSettings } from '../config/settings.js';
import { GitService } from '@google/gemini-cli-core';
import { SessionStatsState } from '../ui/contexts/SessionContext.js';

// 一个工具类型，使对象及其嵌套对象的所有属性都变为可选。
type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * 创建一个深度、完全类型的 CommandContext 模拟对象，用于测试。
 * 所有函数都预先使用 `vi.fn()` 进行模拟。
 *
 * @param overrides - 一个深度部分对象，用于覆盖任何默认的模拟值。
 * @returns 一个完整的、模拟的 CommandContext 对象。
 */
export const createMockCommandContext = (
  overrides: DeepPartial<CommandContext> = {},
): CommandContext => {
  const defaultMocks: CommandContext = {
    services: {
      config: null,
      settings: { merged: {} } as LoadedSettings,
      git: undefined as GitService | undefined,
      logger: {
        log: vi.fn(),
        logMessage: vi.fn(),
        saveCheckpoint: vi.fn(),
        loadCheckpoint: vi.fn().mockResolvedValue([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, // 强制转换，因为 Logger 是一个类。
    },
    ui: {
      addItem: vi.fn(),
      clear: vi.fn(),
      setDebugMessage: vi.fn(),
    },
    session: {
      stats: {
        sessionStartTime: new Date(),
        lastPromptTokenCount: 0,
        metrics: {
          models: {},
          tools: {
            totalCalls: 0,
            totalSuccess: 0,
            totalFail: 0,
            totalDurationMs: 0,
            totalDecisions: { accept: 0, reject: 0, modify: 0 },
            byName: {},
          },
        },
      } as SessionStatsState,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merge = (target: any, source: any): any => {
    const output = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = output[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          output[key] = merge(targetValue, sourceValue);
        } else {
          output[key] = sourceValue;
        }
      }
    }
    return output;
  };

  return merge(defaultMocks, overrides);
};