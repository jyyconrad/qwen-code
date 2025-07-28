/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runNonInteractive } from './nonInteractiveCli.js';
import { Config, GeminiClient, ToolRegistry } from '@iflytek/iflycode-core';
import { GenerateContentResponse, Part, FunctionCall } from '@google/genai';

// 模拟依赖项
vi.mock('@iflytek/iflycode-core', async () => {
  const actualCore = await vi.importActual<
    typeof import('@iflytek/iflycode-core')
  >('@iflytek/iflycode-core');
  return {
    ...actualCore,
    GeminiClient: vi.fn(),
    ToolRegistry: vi.fn(),
    executeToolCall: vi.fn(),
  };
});

describe('runNonInteractive', () => {
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;
  let mockToolRegistry: ToolRegistry;
  let mockChat: {
    sendMessageStream: ReturnType<typeof vi.fn>;
  };
  let mockProcessStdoutWrite: ReturnType<typeof vi.fn>;
  let mockProcessExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockChat = {
      sendMessageStream: vi.fn(),
    };
    mockGeminiClient = {
      getChat: vi.fn().mockResolvedValue(mockChat),
    } as unknown as GeminiClient;
    mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn(),
    } as unknown as ToolRegistry;

    vi.mocked(GeminiClient).mockImplementation(() => mockGeminiClient);
    vi.mocked(ToolRegistry).mockImplementation(() => mockToolRegistry);

    mockConfig = {
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      getContentGeneratorConfig: vi.fn().mockReturnValue({}),
      getMaxSessionTurns: vi.fn().mockReturnValue(10),
      initialize: vi.fn(),
    } as unknown as Config;

    mockProcessStdoutWrite = vi.fn().mockImplementation(() => true);
    process.stdout.write = mockProcessStdoutWrite as any; // 使用 any 绕过严格签名匹配以进行模拟
    mockProcessExit = vi
      .fn()
      .mockImplementation((_code?: number) => undefined as never);
    process.exit = mockProcessExit as any; // 使用 any 进行 process.exit 模拟
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // 如果全局修补了原始进程方法，则恢复它们
    // 这可能需要在 beforeEach 中修补它们之前存储原始方法
  });

  it('应处理输入并写入文本输出', async () => {
    const inputStream = (async function* () {
      yield {
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
      } as GenerateContentResponse;
      yield {
        candidates: [{ content: { parts: [{ text: ' World' }] } }],
      } as GenerateContentResponse;
    })();
    mockChat.sendMessageStream.mockResolvedValue(inputStream);

    await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');

    expect(mockChat.sendMessageStream).toHaveBeenCalledWith(
      {
        message: [{ text: 'Test input' }],
        config: {
          abortSignal: expect.any(AbortSignal),
          tools: [{ functionDeclarations: [] }],
        },
      },
      expect.any(String),
    );
    expect(mockProcessStdoutWrite).toHaveBeenCalledWith('Hello');
    expect(mockProcessStdoutWrite).toHaveBeenCalledWith(' World');
    expect(mockProcessStdoutWrite).toHaveBeenCalledWith('\n');
  });

  it('应处理单个工具调用并响应', async () => {
    const functionCall: FunctionCall = {
      id: 'fc1',
      name: 'testTool',
      args: { p: 'v' },
    };
    const toolResponsePart: Part = {
      functionResponse: {
        name: 'testTool',
        id: 'fc1',
        response: { result: 'tool success' },
      },
    };

    const { executeToolCall: mockCoreExecuteToolCall } = await import(
      '@iflytek/iflycode-core'
    );
    vi.mocked(mockCoreExecuteToolCall).mockResolvedValue({
      callId: 'fc1',
      responseParts: [toolResponsePart],
      resultDisplay: 'Tool success display',
      error: undefined,
    });

    const stream1 = (async function* () {
      yield { functionCalls: [functionCall] } as GenerateContentResponse;
    })();
    const stream2 = (async function* () {
      yield {
        candidates: [{ content: { parts: [{ text: 'Final answer' }] } }],
      } as GenerateContentResponse;
    })();
    mockChat.sendMessageStream
      .mockResolvedValueOnce(stream1)
      .mockResolvedValueOnce(stream2);

    await runNonInteractive(mockConfig, 'Use a tool', 'prompt-id-2');

    expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(mockCoreExecuteToolCall).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({ callId: 'fc1', name: 'testTool' }),
      mockToolRegistry,
      expect.any(AbortSignal),
    );
    expect(mockChat.sendMessageStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: [toolResponsePart],
      }),
      expect.any(String),
    );
    expect(mockProcessStdoutWrite).toHaveBeenCalledWith('Final answer');
  });

  it('应处理工具执行期间的错误', async () => {
    const functionCall: FunctionCall = {
      id: 'fcError',
      name: 'errorTool',
      args: {},
    };
    const errorResponsePart: Part = {
      functionResponse: {
        name: 'errorTool',
        id: 'fcError',
        response: { error: 'Tool failed' },
      },
    };

    const { executeToolCall: mockCoreExecuteToolCall } = await import(
      '@iflytek/iflycode-core'
    );
    vi.mocked(mockCoreExecuteToolCall).mockResolvedValue({
      callId: 'fcError',
      responseParts: [errorResponsePart],
      resultDisplay: 'Tool execution failed badly',
      error: new Error('Tool failed'),
    });

    const stream1 = (async function* () {
      yield { functionCalls: [functionCall] } as GenerateContentResponse;
    })();

    const stream2 = (async function* () {
      yield {
        candidates: [
          { content: { parts: [{ text: 'Could not complete request.' }] } },
        ],
      } as GenerateContentResponse;
    })();
    mockChat.sendMessageStream
      .mockResolvedValueOnce(stream1)
      .mockResolvedValueOnce(stream2);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await runNonInteractive(mockConfig, 'Trigger tool error', 'prompt-id-3');

    expect(mockCoreExecuteToolCall).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '执行工具 errorTool 时出错: Tool execution failed badly',
    );
    expect(mockChat.sendMessageStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: [errorResponsePart],
      }),
      expect.any(String),
    );
    expect(mockProcessStdoutWrite).toHaveBeenCalledWith(
      'Could not complete request.',
    );
  });

  it('如果 sendMessageStream 最初抛出错误则应退出并显示错误', async () => {
    const apiError = new Error('API connection failed');
    mockChat.sendMessageStream.mockRejectedValue(apiError);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await runNonInteractive(mockConfig, 'Initial fail', 'prompt-id-4');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[API 错误: API connection failed]',
    );
  });

  it('如果未找到工具不应退出，并应将错误发送回模型', async () => {
    const functionCall: FunctionCall = {
      id: 'fcNotFound',
      name: 'nonExistentTool',
      args: {},
    };
    const errorResponsePart: Part = {
      functionResponse: {
        name: 'nonExistentTool',
        id: 'fcNotFound',
        response: { error: 'Tool "nonExistentTool" not found in registry.' },
      },
    };

    const { executeToolCall: mockCoreExecuteToolCall } = await import(
      '@iflytek/iflycode-core'
    );
    vi.mocked(mockCoreExecuteToolCall).mockResolvedValue({
      callId: 'fcNotFound',
      responseParts: [errorResponsePart],
      resultDisplay: 'Tool "nonExistentTool" not found in registry.',
      error: new Error('Tool "nonExistentTool" not found in registry.'),
    });

    const stream1 = (async function* () {
      yield { functionCalls: [functionCall] } as GenerateContentResponse;
    })();
    const stream2 = (async function* () {
      yield {
        candidates: [
          {
            content: {
              parts: [{ text: 'Unfortunately the tool does not exist.' }],
            },
          },
        ],
      } as GenerateContentResponse;
    })();
    mockChat.sendMessageStream
      .mockResolvedValueOnce(stream1)
      .mockResolvedValueOnce(stream2);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await runNonInteractive(
      mockConfig,
      'Trigger tool not found',
      'prompt-id-5',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '执行工具 nonExistentTool 时出错: Tool "nonExistentTool" not found in registry.',
    );

    expect(mockProcessExit).not.toHaveBeenCalled();

    expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(mockChat.sendMessageStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: [errorResponsePart],
      }),
      expect.any(String),
    );

    expect(mockProcessStdoutWrite).toHaveBeenCalledWith(
      'Unfortunately the tool does not exist.',
    );
  });

  it('当超过最大会话轮次时应退出', async () => {
    const functionCall: FunctionCall = {
      id: 'fcLoop',
      name: 'loopTool',
      args: {},
    };
    const toolResponsePart: Part = {
      functionResponse: {
        name: 'loopTool',
        id: 'fcLoop',
        response: { result: 'still looping' },
      },
    };

    // 配置最大轮次为 1
    vi.mocked(mockConfig.getMaxSessionTurns).mockReturnValue(1);

    const { executeToolCall: mockCoreExecuteToolCall } = await import(
      '@iflytek/iflycode-core'
    );
    vi.mocked(mockCoreExecuteToolCall).mockResolvedValue({
      callId: 'fcLoop',
      responseParts: [toolResponsePart],
      resultDisplay: 'Still looping',
      error: undefined,
    });

    const stream = (async function* () {
      yield { functionCalls: [functionCall] } as GenerateContentResponse;
    })();

    mockChat.sendMessageStream.mockResolvedValue(stream);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await runNonInteractive(mockConfig, 'Trigger loop');

    expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `
 已达到此会话的最大轮次。通过在 settings.json 中指定 maxSessionTurns 来增加轮次数量。`,
    );
    expect(mockProcessExit).not.toHaveBeenCalled();
  });
});