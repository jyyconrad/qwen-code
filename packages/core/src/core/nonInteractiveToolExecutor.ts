/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  logToolCall,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolRegistry,
  ToolResult,
} from '../index.js';
import { Config } from '../config/config.js';
import { convertToFunctionResponse } from './coreToolScheduler.js';

/**
 * 非交互式执行单个工具调用。
 * 不处理确认、多次调用或实时更新。
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  toolRegistry: ToolRegistry,
  abortSignal?: AbortSignal,
): Promise<ToolCallResponseInfo> {
  const tool = toolRegistry.getTool(toolCallRequest.name);

  const startTime = Date.now();
  if (!tool) {
    const error = new Error(
      `工具 "${toolCallRequest.name}" 在注册表中未找到。`,
    );
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      prompt_id: toolCallRequest.prompt_id,
    });
    // 确保响应结构符合 API 对错误的预期
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }

  try {
    // 直接执行，不进行确认或实时输出处理
    const effectiveAbortSignal = abortSignal ?? new AbortController().signal;
    const toolResult: ToolResult = await tool.execute(
      toolCallRequest.args,
      effectiveAbortSignal,
      // 非交互模式下无实时输出回调
    );

    const tool_output = toolResult.llmContent;

    const tool_display = toolResult.returnDisplay;

    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: true,
      prompt_id: toolCallRequest.prompt_id,
    });

    const response = convertToFunctionResponse(
      toolCallRequest.name,
      toolCallRequest.callId,
      tool_output,
    );

    return {
      callId: toolCallRequest.callId,
      responseParts: response,
      resultDisplay: tool_display,
      error: undefined,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      prompt_id: toolCallRequest.prompt_id,
    });
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }
}