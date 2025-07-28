/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 测试以验证遥测日志中对循环引用的处理
 */

import { describe, it, expect } from 'vitest';
import { logToolCall } from './loggers.js';
import { ToolCallEvent } from './types.js';
import { Config } from '../config/config.js';
import { CompletedToolCall } from '../core/coreToolScheduler.js';
import { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';
import { Tool } from '../tools/tools.js';

describe('循环引用处理', () => {
  it('应处理工具函数参数中的循环引用', () => {
    // 创建一个模拟配置
    const mockConfig = {
      getTelemetryEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding',
      getDebugMode: () => false,
    } as unknown as Config;

    // 创建一个包含循环引用的对象（类似于 HttpsProxyAgent）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circularObject: any = {
      sockets: {},
      agent: null,
    };
    circularObject.agent = circularObject; // 创建循环引用
    circularObject.sockets['test-host'] = [
      { _httpMessage: { agent: circularObject } },
    ];

    // 创建一个在 function_args 中包含循环引用的模拟 CompletedToolCall
    const mockRequest: ToolCallRequestInfo = {
      callId: 'test-call-id',
      name: 'ReadFile',
      args: circularObject, // 这会导致原始错误
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    };

    const mockResponse: ToolCallResponseInfo = {
      callId: 'test-call-id',
      responseParts: [{ text: 'test result' }],
      resultDisplay: undefined,
      error: undefined, // undefined 表示成功
    };

    const mockCompletedToolCall: CompletedToolCall = {
      status: 'success',
      request: mockRequest,
      response: mockResponse,
      tool: {} as Tool,
      durationMs: 100,
    };

    // 创建一个在 function_args 中包含循环引用的工具调用事件
    const event = new ToolCallEvent(mockCompletedToolCall);

    // 这不应抛出错误
    expect(() => {
      logToolCall(mockConfig, event);
    }).not.toThrow();
  });

  it('应处理不包含循环引用的普通对象', () => {
    const mockConfig = {
      getTelemetryEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding',
      getDebugMode: () => false,
    } as unknown as Config;

    const normalObject = {
      filePath: '/test/path',
      options: { encoding: 'utf8' },
    };

    const mockRequest: ToolCallRequestInfo = {
      callId: 'test-call-id',
      name: 'ReadFile',
      args: normalObject,
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    };

    const mockResponse: ToolCallResponseInfo = {
      callId: 'test-call-id',
      responseParts: [{ text: 'test result' }],
      resultDisplay: undefined,
      error: undefined, // undefined 表示成功
    };

    const mockCompletedToolCall: CompletedToolCall = {
      status: 'success',
      request: mockRequest,
      response: mockResponse,
      tool: {} as Tool,
      durationMs: 100,
    };

    const event = new ToolCallEvent(mockCompletedToolCall);

    expect(() => {
      logToolCall(mockConfig, event);
    }).not.toThrow();
  });
});