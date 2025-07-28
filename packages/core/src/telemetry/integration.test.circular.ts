/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 集成测试：验证代理代理中的循环引用处理
 */

import { describe, it, expect } from 'vitest';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';
import { Config } from '../config/config.js';

describe('循环引用集成测试', () => {
  it('应在 clearcut 日志记录中处理类似 HttpsProxyAgent 的循环引用', () => {
    // 创建一个带代理的模拟配置
    const mockConfig = {
      getTelemetryEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding',
      getDebugMode: () => false,
      getProxy: () => 'http://proxy.example.com:8080',
    } as unknown as Config;

    // 模拟导致循环引用错误的结构
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxyAgentLike: any = {
      sockets: {},
      options: { proxy: 'http://proxy.example.com:8080' },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socketLike: any = {
      _httpMessage: {
        agent: proxyAgentLike,
        socket: null,
      },
    };

    socketLike._httpMessage.socket = socketLike; // 创建循环引用
    proxyAgentLike.sockets['cloudcode-pa.googleapis.com:443'] = [socketLike];

    // 创建一个包含此循环结构的事件
    const problematicEvent = {
      error: new Error('网络错误'),
      function_args: {
        filePath: '/test/file.txt',
        httpAgent: proxyAgentLike, // 这将导致循环引用
      },
    };

    // 测试 ClearcutLogger 能否处理此情况
    const logger = ClearcutLogger.getInstance(mockConfig);

    expect(() => {
      logger?.enqueueLogEvent(problematicEvent);
    }).not.toThrow();
  });
});