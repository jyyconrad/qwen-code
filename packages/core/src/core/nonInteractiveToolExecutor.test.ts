/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolCall } from './nonInteractiveToolExecutor.js';
import {
  ToolRegistry,
  ToolCallRequestInfo,
  ToolResult,
  Tool,
  ToolCallConfirmationDetails,
  Config,
} from '../index.js';
import { Part, Type } from '@google/genai';

const mockConfig = {
  getSessionId: () => 'test-session-id',
  getUsageStatisticsEnabled: () => true,
  getDebugMode: () => false,
} as unknown as Config;

describe('executeToolCall', () => {
  let mockToolRegistry: ToolRegistry;
  let mockTool: Tool;
  let abortController: AbortController;

  beforeEach(() => {
    mockTool = {
      name: 'testTool',
      displayName: 'Test Tool',
      description: '用于测试的工具',
      schema: {
        name: 'testTool',
        description: '用于测试的工具',
        parameters: {
          type: Type.OBJECT,
          properties: {
            param1: { type: Type.STRING },
          },
          required: ['param1'],
        },
      },
      execute: vi.fn(),
      validateToolParams: vi.fn(() => null),
      shouldConfirmExecute: vi.fn(() =>
        Promise.resolve(false as false | ToolCallConfirmationDetails),
      ),
      isOutputMarkdown: false,
      canUpdateOutput: false,
      getDescription: vi.fn(),
    };

    mockToolRegistry = {
      getTool: vi.fn(),
      // 如有需要，添加其他 ToolRegistry 方法，或使用更完整的模拟
    } as unknown as ToolRegistry;

    abortController = new AbortController();
  });

  it('应成功执行工具', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'testTool',
      args: { param1: 'value1' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    };
    const toolResult: ToolResult = {
      llmContent: '工具执行成功',
      returnDisplay: '成功！',
    };
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);
    vi.mocked(mockTool.execute).mockResolvedValue(toolResult);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('testTool');
    expect(mockTool.execute).toHaveBeenCalledWith(
      request.args,
      abortController.signal,
    );
    expect(response.callId).toBe('call1');
    expect(response.error).toBeUndefined();
    expect(response.resultDisplay).toBe('成功！');
    expect(response.responseParts).toEqual({
      functionResponse: {
        name: 'testTool',
        id: 'call1',
        response: { output: '工具执行成功' },
      },
    });
  });

  it('如果未找到工具应返回错误', async () => {
      const request: ToolCallRequestInfo = {
      callId: 'call2',
      name: 'nonExistentTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-2',
    };
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(undefined);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.callId).toBe('call2');
    expect(response.error).toBeInstanceOf(Error);
    expect(response.error?.message).toBe(
      '工具 "nonExistentTool" 在注册表中未找到。',
    );
    expect(response.resultDisplay).toBe(
      '工具 "nonExistentTool" 在注册表中未找到。',
    );
    expect(response.responseParts).toEqual([
      {
        functionResponse: {
          name: 'nonExistentTool',
          id: 'call2',
          response: { error: '工具 "nonExistentTool" 在注册表中未找到。' },
        },
      },
    ]);
  });

  it('如果工具执行失败应返回错误', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call3',
      name: 'testTool',
      args: { param1: 'value1' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-3',
    };
    const executionError = new Error('工具执行失败');
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);
    vi.mocked(mockTool.execute).mockRejectedValue(executionError);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.callId).toBe('call3');
    expect(response.error).toBe(executionError);
    expect(response.resultDisplay).toBe('工具执行失败');
    expect(response.responseParts).toEqual([
      {
        functionResponse: {
          name: 'testTool',
          id: 'call3',
          response: { error: '工具执行失败' },
        },
      },
    ]);
  });

  it('应处理工具执行期间的取消操作', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call4',
      name: 'testTool',
      args: { param1: 'value1' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-4',
    };
    const cancellationError = new Error('操作已取消');
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);

    vi.mocked(mockTool.execute).mockImplementation(async (_args, signal) => {
      if (signal?.aborted) {
        return Promise.reject(cancellationError);
      }
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(cancellationError);
        });
        // 模拟如果未立即中止可能发生的工作
        const timeoutId = setTimeout(
          () =>
            reject(
              new Error('如果之前未中止，应已被取消'),
            ),
          100,
        );
        signal?.addEventListener('abort', () => clearTimeout(timeoutId));
      });
    });

    abortController.abort(); // 调用前中止
    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.callId).toBe('call4');
    expect(response.error?.message).toBe(cancellationError.message);
    expect(response.resultDisplay).toBe('操作已取消');
  });

  it('应正确格式化包含 inlineData 的 llmContent', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call5',
      name: 'testTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-5',
    };
    const imageDataPart: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64data' },
    };
    const toolResult: ToolResult = {
      llmContent: [imageDataPart],
      returnDisplay: '图像已处理',
    };
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);
    vi.mocked(mockTool.execute).mockResolvedValue(toolResult);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.resultDisplay).toBe('图像已处理');
    expect(response.responseParts).toEqual([
      {
        functionResponse: {
          name: 'testTool',
          id: 'call5',
          response: {
            output: '已处理类型为 image/png 的二进制内容。',
          },
        },
      },
      imageDataPart,
    ]);
  });
});