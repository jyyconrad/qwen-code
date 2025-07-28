/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  CoreToolScheduler,
  ToolCall,
  ValidatingToolCall,
  convertToFunctionResponse,
} from './coreToolScheduler.js';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolConfirmationPayload,
  ToolResult,
  Config,
} from '../index.js';
import { Part, PartListUnion } from '@google/genai';

import { ModifiableTool, ModifyContext } from '../tools/modifiable-tool.js';

class MockTool extends BaseTool<Record<string, unknown>, ToolResult> {
  shouldConfirm = false;
  executeFn = vi.fn();

  constructor(name = 'mockTool') {
    super(name, name, '一个模拟工具', {});
  }

  async shouldConfirmExecute(
    _params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldConfirm) {
      return {
        type: 'exec',
        title: '确认模拟工具',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };
    }
    return false;
  }

  async execute(
    params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    this.executeFn(params);
    return { llmContent: '工具已执行', returnDisplay: '工具已执行' };
  }
}

class MockModifiableTool
  extends MockTool
  implements ModifiableTool<Record<string, unknown>>
{
  constructor(name = 'mockModifiableTool') {
    super(name);
    this.shouldConfirm = true;
  }

  getModifyContext(
    _abortSignal: AbortSignal,
  ): ModifyContext<Record<string, unknown>> {
    return {
      getFilePath: () => 'test.txt',
      getCurrentContent: async () => '旧内容',
      getProposedContent: async () => '新内容',
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        _originalParams: Record<string, unknown>,
      ) => ({ newContent: modifiedProposedContent }),
    };
  }

  async shouldConfirmExecute(
    _params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldConfirm) {
      return {
        type: 'edit',
        title: '确认模拟工具',
        fileName: 'test.txt',
        fileDiff: 'diff',
        onConfirm: async () => {},
      };
    }
    return false;
  }
}

describe('CoreToolScheduler', () => {
  it('如果信号在确认前被中止，应取消工具调用', async () => {
    const mockTool = new MockTool();
    mockTool.shouldConfirm = true;
    const toolRegistry = {
      getTool: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {} as any,
      registerTool: () => {},
      getToolByName: () => mockTool,
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    };

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
    } as unknown as Config;

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    };

    abortController.abort();
    await scheduler.schedule([request], abortController.signal);

    const _waitingCall = onToolCallsUpdate.mock
      .calls[1][0][0] as ValidatingToolCall;
    const confirmationDetails = await mockTool.shouldConfirmExecute(
      {},
      abortController.signal,
    );
    if (confirmationDetails) {
      await scheduler.handleConfirmationResponse(
        '1',
        confirmationDetails.onConfirm,
        ToolConfirmationOutcome.ProceedOnce,
        abortController.signal,
      );
    }

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('cancelled');
  });
});

describe('CoreToolScheduler with payload', () => {
  it('当提供 payload 时，应更新参数和差异并执行工具', async () => {
    const mockTool = new MockModifiableTool();
    const toolRegistry = {
      getTool: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {} as any,
      registerTool: () => {},
      getToolByName: () => mockTool,
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    };

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
    } as unknown as Config;

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockModifiableTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-2',
    };

    await scheduler.schedule([request], abortController.signal);

    const confirmationDetails = await mockTool.shouldConfirmExecute(
      {},
      abortController.signal,
    );

    if (confirmationDetails) {
      const payload: ToolConfirmationPayload = { newContent: '最终版本' };
      await scheduler.handleConfirmationResponse(
        '1',
        confirmationDetails.onConfirm,
        ToolConfirmationOutcome.ProceedOnce,
        abortController.signal,
        payload,
      );
    }

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('success');
    expect(mockTool.executeFn).toHaveBeenCalledWith({
      newContent: '最终版本',
    });
  });
});

describe('convertToFunctionResponse', () => {
  const toolName = 'testTool';
  const callId = 'call1';

  it('应处理简单的字符串 llmContent', () => {
    const llmContent = '简单文本输出';
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '简单文本输出' },
      },
    });
  });

  it('应处理作为单个带文本 Part 的 llmContent', () => {
    const llmContent: Part = { text: '来自 Part 对象的文本' };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '来自 Part 对象的文本' },
      },
    });
  });

  it('应处理作为带单个文本 Part 的 PartListUnion 数组的 llmContent', () => {
    const llmContent: PartListUnion = [{ text: '来自数组的文本' }];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '来自数组的文本' },
      },
    });
  });

  it('应处理带有 inlineData 的 llmContent', () => {
    const llmContent: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64...' },
    };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: '类型为 image/png 的二进制内容已处理。',
          },
        },
      },
      llmContent,
    ]);
  });

  it('应处理带有 fileData 的 llmContent', () => {
    const llmContent: Part = {
      fileData: { mimeType: 'application/pdf', fileUri: 'gs://...' },
    };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: '类型为 application/pdf 的二进制内容已处理。',
          },
        },
      },
      llmContent,
    ]);
  });

  it('应处理作为多个 Parts（文本和 inlineData）数组的 llmContent', () => {
    const llmContent: PartListUnion = [
      { text: '一些文本描述' },
      { inlineData: { mimeType: 'image/jpeg', data: 'base64data...' } },
      { text: '另一个文本部分' },
    ];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: { output: '工具执行成功。' },
        },
      },
      ...llmContent,
    ]);
  });

  it('应处理作为带单个 inlineData Part 的数组的 llmContent', () => {
    const llmContent: PartListUnion = [
      { inlineData: { mimeType: 'image/gif', data: 'gifdata...' } },
    ];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: '类型为 image/gif 的二进制内容已处理。',
          },
        },
      },
      ...llmContent,
    ]);
  });

  it('应处理作为通用 Part（非文本、inlineData 或 fileData）的 llmContent', () => {
    const llmContent: Part = { functionCall: { name: 'test', args: {} } };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '工具执行成功。' },
      },
    });
  });

  it('应处理空字符串 llmContent', () => {
    const llmContent = '';
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '' },
      },
    });
  });

  it('应处理作为空数组的 llmContent', () => {
    const llmContent: PartListUnion = [];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: { output: '工具执行成功。' },
        },
      },
    ]);
  });

  it('应处理带有未定义 inlineData/fileData/text 的 Part 的 llmContent', () => {
    const llmContent: Part = {}; // 一个空的 part 对象
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '工具执行成功。' },
      },
    });
  });
});