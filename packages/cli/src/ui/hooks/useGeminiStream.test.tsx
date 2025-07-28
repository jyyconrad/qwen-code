/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGeminiStream, mergePartListUnions } from './useGeminiStream.js';
import { useInput } from 'ink';
import {
  useReactToolScheduler,
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedExecutingToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';
import { Config, EditorType, AuthType } from '@iflytek/iflycode-core';
import { Part, PartListUnion } from '@google/genai';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import {
  HistoryItem,
  MessageType,
  SlashCommandProcessorResult,
  StreamingState,
} from '../types.js';
import { Dispatch, SetStateAction } from 'react';
import { LoadedSettings } from '../../config/settings.js';

// --- 模拟 ---
const mockSendMessageStream = vi
  .fn()
  .mockReturnValue((async function* () {})());
const mockStartChat = vi.fn();

const MockedGeminiClientClass = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: any, _config: any) {
    // _config
    this.startChat = mockStartChat;
    this.sendMessageStream = mockSendMessageStream;
    this.addHistory = vi.fn();
  }),
);

const MockedUserPromptEvent = vi.hoisted(() =>
  vi.fn().mockImplementation(() => {}),
);

vi.mock('@iflytek/iflycode-core', async (importOriginal) => {
  const actualCoreModule = (await importOriginal()) as any;
  return {
    ...actualCoreModule,
    GitService: vi.fn(),
    GeminiClient: MockedGeminiClientClass,
    UserPromptEvent: MockedUserPromptEvent,
  };
});

const mockUseReactToolScheduler = useReactToolScheduler as Mock;
vi.mock('./useReactToolScheduler.js', async (importOriginal) => {
  const actualSchedulerModule = (await importOriginal()) as any;
  return {
    ...(actualSchedulerModule || {}),
    useReactToolScheduler: vi.fn(),
  };
});

vi.mock('ink', async (importOriginal) => {
  const actualInkModule = (await importOriginal()) as any;
  return { ...(actualInkModule || {}), useInput: vi.fn() };
});

vi.mock('./shellCommandProcessor.js', () => ({
  useShellCommandProcessor: vi.fn().mockReturnValue({
    handleShellCommand: vi.fn(),
  }),
}));

vi.mock('./atCommandProcessor.js', () => ({
  handleAtCommand: vi
    .fn()
    .mockResolvedValue({ shouldProceed: true, processedQuery: 'mocked' }),
}));

vi.mock('../utils/markdownUtilities.js', () => ({
  findLastSafeSplitPoint: vi.fn((s: string) => s.length),
}));

vi.mock('./useStateAndRef.js', () => ({
  useStateAndRef: vi.fn((initial) => {
    let val = initial;
    const ref = { current: val };
    const setVal = vi.fn((updater) => {
      if (typeof updater === 'function') {
        val = updater(val);
      } else {
        val = updater;
      }
      ref.current = val;
    });
    return [ref, setVal];
  }),
}));

vi.mock('./useLogger.js', () => ({
  useLogger: vi.fn().mockReturnValue({
    logMessage: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockStartNewPrompt = vi.fn();
const mockAddUsage = vi.fn();
vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(() => ({
    startNewPrompt: mockStartNewPrompt,
    addUsage: mockAddUsage,
    getPromptCount: vi.fn(() => 5),
  })),
}));

vi.mock('./slashCommandProcessor.js', () => ({
  handleSlashCommand: vi.fn().mockReturnValue(false),
}));

const mockParseAndFormatApiError = vi.hoisted(() => vi.fn());
vi.mock('../utils/errorParsing.js', () => ({
  parseAndFormatApiError: mockParseAndFormatApiError,
}));

// --- 结束模拟 ---

describe('mergePartListUnions', () => {
  it('应合并多个 PartListUnion 数组', () => {
    const list1: PartListUnion = [{ text: 'Hello' }];
    const list2: PartListUnion = [
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
    ];
    const list3: PartListUnion = [{ text: 'World' }, { text: '!' }];
    const result = mergePartListUnions([list1, list2, list3]);
    expect(result).toEqual([
      { text: 'Hello' },
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
      { text: 'World' },
      { text: '!' },
    ]);
  });

  it('应处理输入列表中的空数组', () => {
    const list1: PartListUnion = [{ text: 'First' }];
    const list2: PartListUnion = [];
    const list3: PartListUnion = [{ text: 'Last' }];
    const result = mergePartListUnions([list1, list2, list3]);
    expect(result).toEqual([{ text: 'First' }, { text: 'Last' }]);
  });

  it('应处理单个 PartListUnion 数组', () => {
    const list1: PartListUnion = [
      { text: 'One' },
      { inlineData: { mimeType: 'image/jpeg', data: 'xyz' } },
    ];
    const result = mergePartListUnions([list1]);
    expect(result).toEqual(list1);
  });

  it('如果所有输入数组都为空，则应返回一个空数组', () => {
    const list1: PartListUnion = [];
    const list2: PartListUnion = [];
    const result = mergePartListUnions([list1, list2]);
    expect(result).toEqual([]);
  });

  it('应处理输入列表为空的情况', () => {
    const result = mergePartListUnions([]);
    expect(result).toEqual([]);
  });

  it('当 PartListUnion 项是单个部分而不是数组时，应正确合并', () => {
    const part1: Part = { text: 'Single part 1' };
    const part2: Part = { inlineData: { mimeType: 'image/gif', data: 'gif' } };
    const listContainingSingleParts: PartListUnion[] = [
      part1,
      [part2],
      { text: 'Another single part' },
    ];
    const result = mergePartListUnions(listContainingSingleParts);
    expect(result).toEqual([
      { text: 'Single part 1' },
      { inlineData: { mimeType: 'image/gif', data: 'gif' } },
      { text: 'Another single part' },
    ]);
  });

  it('应处理数组和单个部分的混合，包括空数组和未定义/空部分（尽管 PartListUnion 类型限制了这一点）', () => {
    const list1: PartListUnion = [{ text: 'A' }];
    const list2: PartListUnion = [];
    const part3: Part = { text: 'B' };
    const list4: PartListUnion = [
      { text: 'C' },
      { inlineData: { mimeType: 'text/plain', data: 'D' } },
    ];
    const result = mergePartListUnions([list1, list2, part3, list4]);
    expect(result).toEqual([
      { text: 'A' },
      { text: 'B' },
      { text: 'C' },
      { inlineData: { mimeType: 'text/plain', data: 'D' } },
    ]);
  });

  it('应保留输入数组中部分的顺序', () => {
    const listA: PartListUnion = [{ text: '1' }, { text: '2' }];
    const listB: PartListUnion = [{ text: '3' }];
    const listC: PartListUnion = [{ text: '4' }, { text: '5' }];
    const result = mergePartListUnions([listA, listB, listC]);
    expect(result).toEqual([
      { text: '1' },
      { text: '2' },
      { text: '3' },
      { text: '4' },
      { text: '5' },
    ]);
  });

  it('应处理某些 PartListUnion 项是单个部分而其他项是部分数组的情况', () => {
    const singlePart1: Part = { text: 'First single' };
    const arrayPart1: Part[] = [
      { text: 'Array item 1' },
      { text: 'Array item 2' },
    ];
    const singlePart2: Part = {
      inlineData: { mimeType: 'application/json', data: 'e30=' },
    }; // {}
    const arrayPart2: Part[] = [{ text: 'Last array item' }];

    const result = mergePartListUnions([
      singlePart1,
      arrayPart1,
      singlePart2,
      arrayPart2,
    ]);
    expect(result).toEqual([
      { text: 'First single' },
      { text: 'Array item 1' },
      { text: 'Array item 2' },
      { inlineData: { mimeType: 'application/json', data: 'e30=' } },
      { text: 'Last array item' },
    ]);
  });
});

// --- useGeminiStream Hook 的测试 ---
describe('useGeminiStream', () => {
  let mockAddItem: Mock;
  let mockSetShowHelp: Mock;
  let mockConfig: Config;
  let mockOnDebugMessage: Mock;
  let mockHandleSlashCommand: Mock;
  let mockScheduleToolCalls: Mock;
  let mockCancelAllToolCalls: Mock;
  let mockMarkToolsAsSubmitted: Mock;

  beforeEach(() => {
    vi.clearAllMocks(); // 在每次测试前清除模拟

    mockAddItem = vi.fn();
    mockSetShowHelp = vi.fn();
    // 定义 getGeminiClient 的模拟
    const mockGetGeminiClient = vi.fn().mockImplementation(() => {
      // MockedGeminiClientClass 在模块作用域中由之前的更改定义。
      // 它将使用在 beforeEach 中管理的 mockStartChat 和 mockSendMessageStream。
      const clientInstance = new MockedGeminiClientClass(mockConfig);
      return clientInstance;
    });

    const contentGeneratorConfig = {
      model: 'test-model',
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };

    mockConfig = {
      apiKey: 'test-api-key',
      model: 'gemini-pro',
      sandbox: false,
      targetDir: '/test/dir',
      debugMode: false,
      question: undefined,
      fullContext: false,
      coreTools: [],
      toolDiscoveryCommand: undefined,
      toolCallCommand: undefined,
      mcpServerCommand: undefined,
      mcpServers: undefined,
      userAgent: 'test-agent',
      userMemory: '',
      geminiMdFileCount: 0,
      alwaysSkipModificationConfirmation: false,
      vertexai: false,
      showMemoryUsage: false,
      contextFileName: undefined,
      getToolRegistry: vi.fn(
        () => ({ getToolSchemaList: vi.fn(() => []) }) as any,
      ),
      getProjectRoot: vi.fn(() => '/test/dir'),
      getCheckpointingEnabled: vi.fn(() => false),
      getGeminiClient: mockGetGeminiClient,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      addHistory: vi.fn(),
      getSessionId() {
        return 'test-session-id';
      },
      setQuotaErrorOccurred: vi.fn(),
      getQuotaErrorOccurred: vi.fn(() => false),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue(contentGeneratorConfig),
    } as unknown as Config;
    mockOnDebugMessage = vi.fn();
    mockHandleSlashCommand = vi.fn().mockResolvedValue(false);

    // useReactToolScheduler 的模拟返回值
    mockScheduleToolCalls = vi.fn();
    mockCancelAllToolCalls = vi.fn();
    mockMarkToolsAsSubmitted = vi.fn();

    // useReactToolScheduler 的默认模拟，防止 toolCalls 最初未定义
    mockUseReactToolScheduler.mockReturnValue([
      [], // 默认为空数组用于 toolCalls
      mockScheduleToolCalls,
      mockCancelAllToolCalls,
      mockMarkToolsAsSubmitted,
    ]);

    // 重置 GeminiClient 实例方法的模拟（startChat 和 sendMessageStream）
    // GeminiClient 构造函数本身在模块级别被模拟。
    mockStartChat.mockClear().mockResolvedValue({
      sendMessageStream: mockSendMessageStream,
    } as unknown as any); // GeminiChat -> any
    mockSendMessageStream
      .mockClear()
      .mockReturnValue((async function* () {})());
  });

  const mockLoadedSettings: LoadedSettings = {
    merged: { preferredEditor: 'vscode' },
    user: { path: '/user/settings.json', settings: {} },
    workspace: { path: '/workspace/.iflycode/settings.json', settings: {} },
    errors: [],
    forScope: vi.fn(),
    setValue: vi.fn(),
  } as unknown as LoadedSettings;

  const renderTestHook = (
    initialToolCalls: TrackedToolCall[] = [],
    geminiClient?: any,
  ) => {
    let currentToolCalls = initialToolCalls;
    const setToolCalls = (newToolCalls: TrackedToolCall[]) => {
      currentToolCalls = newToolCalls;
    };

    mockUseReactToolScheduler.mockImplementation(() => [
      currentToolCalls,
      mockScheduleToolCalls,
      mockCancelAllToolCalls,
      mockMarkToolsAsSubmitted,
    ]);

    const client = geminiClient || mockConfig.getGeminiClient();

    const { result, rerender } = renderHook(
      (props: {
        client: any;
        history: HistoryItem[];
        addItem: UseHistoryManagerReturn['addItem'];
        setShowHelp: Dispatch<SetStateAction<boolean>>;
        config: Config;
        onDebugMessage: (message: string) => void;
        handleSlashCommand: (
          cmd: PartListUnion,
        ) => Promise<SlashCommandProcessorResult | false>;
        shellModeActive: boolean;
        loadedSettings: LoadedSettings;
        toolCalls?: TrackedToolCall[]; // 允许传递更新的 toolCalls
      }) => {
        // 如果 props 中传递了新的 toolCalls，则更新模拟的返回值
        if (props.toolCalls) {
          setToolCalls(props.toolCalls);
        }
        return useGeminiStream(
          props.client,
          props.history,
          props.addItem,
          props.setShowHelp,
          props.config,
          props.onDebugMessage,
          props.handleSlashCommand,
          props.shellModeActive,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
        );
      },
      {
        initialProps: {
          client,
          history: [],
          addItem: mockAddItem as unknown as UseHistoryManagerReturn['addItem'],
          setShowHelp: mockSetShowHelp,
          config: mockConfig,
          onDebugMessage: mockOnDebugMessage,
          handleSlashCommand: mockHandleSlashCommand as unknown as (
            cmd: PartListUnion,
          ) => Promise<SlashCommandProcessorResult | false>,
          shellModeActive: false,
          loadedSettings: mockLoadedSettings,
          toolCalls: initialToolCalls,
        },
      },
    );
    return {
      result,
      rerender,
      mockMarkToolsAsSubmitted,
      mockSendMessageStream,
      client,
    };
  };

  it('如果并非所有工具调用都已完成，则不应提交工具响应', () => {
    const toolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
        status: 'success',
        responseSubmittedToGemini: false,
        response: {
          callId: 'call1',
          responseParts: [{ text: 'tool 1 response' }],
          error: undefined,
          resultDisplay: 'Tool 1 success display',
        },
        tool: {
          name: 'tool1',
          description: 'desc1',
          getDescription: vi.fn(),
        } as any,
        startTime: Date.now(),
        endTime: Date.now(),
      } as TrackedCompletedToolCall,
      {
        request: {
          callId: 'call2',
          name: 'tool2',
          args: {},
          prompt_id: 'prompt-id-1',
        },
        status: 'executing',
        responseSubmittedToGemini: false,
        tool: {
          name: 'tool2',
          description: 'desc2',
          getDescription: vi.fn(),
        } as any,
        startTime: Date.now(),
        liveOutput: '...',
      } as TrackedExecutingToolCall,
    ];

    const { mockMarkToolsAsSubmitted, mockSendMessageStream } =
      renderTestHook(toolCalls);

    // 提交工具响应的效果取决于 toolCalls 和 isResponding
    // isResponding 最初为 false，因此效果应该运行。

    expect(mockMarkToolsAsSubmitted).not.toHaveBeenCalled();
    expect(mockSendMessageStream).not.toHaveBeenCalled(); // submitQuery 使用这个
  });

  it('当所有工具调用都已完成并准备就绪时，应提交工具响应', async () => {
    const toolCall1ResponseParts: PartListUnion = [
      { text: 'tool 1 final response' },
    ];
    const toolCall2ResponseParts: PartListUnion = [
      { text: 'tool 2 final response' },
    ];
    const completedToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        status: 'success',
        responseSubmittedToGemini: false,
        response: { callId: 'call1', responseParts: toolCall1ResponseParts },
      } as TrackedCompletedToolCall,
      {
        request: {
          callId: 'call2',
          name: 'tool2',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        status: 'error',
        responseSubmittedToGemini: false,
        response: { callId: 'call2', responseParts: toolCall2ResponseParts },
      } as TrackedCompletedToolCall, // 将错误视为一种完成形式以进行提交
    ];

    // 捕获 onComplete 回调
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
    });

    renderHook(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // 使用已完成的工具触发 onComplete 回调
    await act(async () => {
      if (capturedOnComplete) {
        await capturedOnComplete(completedToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledTimes(1);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    const expectedMergedResponse = mergePartListUnions([
      toolCall1ResponseParts,
      toolCall2ResponseParts,
    ]);
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      expectedMergedResponse,
      expect.any(AbortSignal),
      'prompt-id-2',
    );
  });

  it('应处理所有工具调用都被取消的情况', async () => {
    const cancelledToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: '1',
          name: 'testTool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-3',
        },
        status: 'cancelled',
        response: { callId: '1', responseParts: [{ text: 'cancelled' }] },
        responseSubmittedToGemini: false,
      } as TrackedCancelledToolCall,
    ];
    const client = new MockedGeminiClientClass(mockConfig);

    // 捕获 onComplete 回调
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
    });

    renderHook(() =>
      useGeminiStream(
        client,
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // 使用已取消的工具触发 onComplete 回调
    await act(async () => {
      if (capturedOnComplete) {
        await capturedOnComplete(cancelledToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith(['1']);
      expect(client.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: [{ text: 'cancelled' }],
      });
      // 确保我们不会回调到 API
      expect(mockSendMessageStream).not.toHaveBeenCalled();
    });
  });

  it('应将多个已取消的工具调用响应分组到单个历史记录条目中', async () => {
    const cancelledToolCall1: TrackedCancelledToolCall = {
      request: {
        callId: 'cancel-1',
        name: 'toolA',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-7',
      },
      tool: {
        name: 'toolA',
        description: 'descA',
        getDescription: vi.fn(),
      } as any,
      status: 'cancelled',
      response: {
        callId: 'cancel-1',
        responseParts: [
          { functionResponse: { name: 'toolA', id: 'cancel-1' } },
        ],
        resultDisplay: undefined,
        error: undefined,
      },
      responseSubmittedToGemini: false,
    };
    const cancelledToolCall2: TrackedCancelledToolCall = {
      request: {
        callId: 'cancel-2',
        name: 'toolB',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-8',
      },
      tool: {
        name: 'toolB',
        description: 'descB',
        getDescription: vi.fn(),
      } as any,
      status: 'cancelled',
      response: {
        callId: 'cancel-2',
        responseParts: [
          { functionResponse: { name: 'toolB', id: 'cancel-2' } },
        ],
        resultDisplay: undefined,
        error: undefined,
      },
      responseSubmittedToGemini: false,
    };
    const allCancelledTools = [cancelledToolCall1, cancelledToolCall2];
    const client = new MockedGeminiClientClass(mockConfig);

    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
    });

    renderHook(() =>
      useGeminiStream(
        client,
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // 使用多个已取消的工具触发 onComplete 回调
    await act(async () => {
      if (capturedOnComplete) {
        await capturedOnComplete(allCancelledTools);
      }
    });

    await waitFor(() => {
      // 工具应被标记为本地提交
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith([
        'cancel-1',
        'cancel-2',
      ]);

      // 关键是，addHistory 应该只被调用一次
      expect(client.addHistory).toHaveBeenCalledTimes(1);

      // 该单次调用应包含两个函数响应
      expect(client.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: [
          ...(cancelledToolCall1.response.responseParts as Part[]),
          ...(cancelledToolCall2.response.responseParts as Part[]),
        ],
      });

      // 对于只有取消的回合，不应回调到 API
      expect(mockSendMessageStream).not.toHaveBeenCalled();
    });
  });

  it('在工具完成和提交之间不应闪烁流状态到空闲', async () => {
    const toolCallResponseParts: PartListUnion = [
      { text: 'tool 1 final response' },
    ];

    const initialToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-4',
        },
        status: 'executing',
        responseSubmittedToGemini: false,
        tool: {
          name: 'tool1',
          description: 'desc',
          getDescription: vi.fn(),
        } as any,
        startTime: Date.now(),
      } as TrackedExecutingToolCall,
    ];

    const completedToolCalls: TrackedToolCall[] = [
      {
        ...(initialToolCalls[0] as TrackedExecutingToolCall),
        status: 'success',
        response: {
          callId: 'call1',
          responseParts: toolCallResponseParts,
          error: undefined,
          resultDisplay: 'Tool 1 success display',
        },
        endTime: Date.now(),
      } as TrackedCompletedToolCall,
    ];

    // 捕获 onComplete 回调
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;
    let currentToolCalls = initialToolCalls;

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        currentToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
      ];
    });

    const { result, rerender } = renderHook(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // 1. 初始状态应为 Responding，因为工具正在执行。
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 2. 更新工具调用到完成状态并重新渲染
    currentToolCalls = completedToolCalls;
    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        completedToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
      ];
    });

    act(() => {
      rerender();
    });

    // 3. 状态应*仍然*为 Responding，而不是 Idle。
    // 这是因为已完成工具的响应尚未提交。
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 4. 触发 onComplete 回调以模拟工具完成
    await act(async () => {
      if (capturedOnComplete) {
        await capturedOnComplete(completedToolCalls);
      }
    });

    // 5. 等待 submitQuery 被调用
    await waitFor(() => {
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        toolCallResponseParts,
        expect.any(AbortSignal),
        'prompt-id-4',
      );
    });

    // 6. 提交后，状态应保持 Responding 直到流完成。
    expect(result.current.streamingState).toBe(StreamingState.Responding);
  });

  describe('用户取消', () => {
    let useInputCallback: (input: string, key: any) => void;
    const mockUseInput = useInput as Mock;

    beforeEach(() => {
      // 捕获传递给 useInput 的回调
      mockUseInput.mockImplementation((callback) => {
        useInputCallback = callback;
      });
    });

    const simulateEscapeKeyPress = () => {
      act(() => {
        useInputCallback('', { escape: true });
      });
    };

    it('当按下 escape 键时应取消正在进行的流', async () => {
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Part 1' };
        // 保持流打开
        await new Promise(() => {});
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderTestHook();

      // 开始查询
      await act(async () => {
        result.current.submitQuery('test query');
      });

      // 等待响应的第一部分
      await waitFor(() => {
        expect(result.current.streamingState).toBe(StreamingState.Responding);
      });

      // 模拟 escape 键按下
      simulateEscapeKeyPress();

      // 验证取消消息已添加
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: '请求已取消。',
          },
          expect.any(Number),
        );
      });

      // 验证状态已重置
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });

    it('当未响应时按下 escape 键不应执行任何操作', () => {
      const { result } = renderTestHook();

      expect(result.current.streamingState).toBe(StreamingState.Idle);

      // 模拟 escape 键按下
      simulateEscapeKeyPress();

      // 不应发生任何变化，不应有取消消息
      expect(mockAddItem).not.toHaveBeenCalledWith(
        expect.objectContaining({
          text: '请求已取消。',
        }),
        expect.any(Number),
      );
    });

    it('取消后应阻止进一步处理', async () => {
      let continueStream: () => void;
      const streamPromise = new Promise<void>((resolve) => {
        continueStream = resolve;
      });

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Initial' };
        await streamPromise; // 等到我们手动继续
        yield { type: 'content', value: ' Canceled' };
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderTestHook();

      await act(async () => {
        result.current.submitQuery('long running query');
      });

      await waitFor(() => {
        expect(result.current.streamingState).toBe(StreamingState.Responding);
      });

      // 取消请求
      simulateEscapeKeyPress();

      // 允许流继续
      act(() => {
        continueStream();
      });

      // 等待片刻查看第二部分是否被处理
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 文本不应更新为 " Canceled"
      const lastCall = mockAddItem.mock.calls.find(
        (call) => call[0].type === 'gemini',
      );
      expect(lastCall?.[0].text).toBe('Initial');

      // 取消后的最终状态应为空闲
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });

    it('如果有工具调用正在进行（不仅仅是响应），则不应取消', async () => {
      const toolCalls: TrackedToolCall[] = [
        {
          request: { callId: 'call1', name: 'tool1', args: {} },
          status: 'executing',
          responseSubmittedToGemini: false,
          tool: {
            name: 'tool1',
            description: 'desc1',
            getDescription: vi.fn(),
          } as any,
          startTime: Date.now(),
          liveOutput: '...',
        } as TrackedExecutingToolCall,
      ];

      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      const { result } = renderTestHook(toolCalls);

      // 状态为 `Responding`，因为工具正在运行
      expect(result.current.streamingState).toBe(StreamingState.Responding);

      // 尝试取消
      simulateEscapeKeyPress();

      // 不应发生任何事情，因为状态不是 `Responding`
      expect(abortSpy).not.toHaveBeenCalled();
    });
  });

  describe('斜杠命令处理', () => {
    it('当命令处理器返回 schedule_tool 操作时，应安排工具调用', async () => {
      const clientToolRequest: SlashCommandProcessorResult = {
        type: 'schedule_tool',
        toolName: 'save_memory',
        toolArgs: { fact: 'test fact' },
      };
      mockHandleSlashCommand.mockResolvedValue(clientToolRequest);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/memory add "test fact"');
      });

      await waitFor(() => {
        expect(mockScheduleToolCalls).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              name: 'save_memory',
              args: { fact: 'test fact' },
              isClientInitiated: true,
            }),
          ],
          expect.any(AbortSignal),
        );
        expect(mockSendMessageStream).not.toHaveBeenCalled();
      });
    });

    it('当命令处理后不调用工具时，应停止处理且不调用 Gemini', async () => {
      const uiOnlyCommandResult: SlashCommandProcessorResult = {
        type: 'handled',
      };
      mockHandleSlashCommand.mockResolvedValue(uiOnlyCommandResult);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/help');
      });

      await waitFor(() => {
        expect(mockHandleSlashCommand).toHaveBeenCalledWith('/help');
        expect(mockScheduleToolCalls).not.toHaveBeenCalled();
        expect(mockSendMessageStream).not.toHaveBeenCalled(); // 未进行 LLM 调用
      });
    });
  });

  describe('save_memory 上的内存刷新', () => {
    it('当 save_memory 工具调用成功完成时，应调用 performMemoryRefresh', async () => {
      const mockPerformMemoryRefresh = vi.fn();
      const completedToolCall: TrackedCompletedToolCall = {
        request: {
          callId: 'save-mem-call-1',
          name: 'save_memory',
          args: { fact: 'test' },
          isClientInitiated: true,
          prompt_id: 'prompt-id-6',
        },
        status: 'success',
        responseSubmittedToGemini: false,
        response: {
          callId: 'save-mem-call-1',
          responseParts: [{ text: 'Memory saved' }],
          resultDisplay: 'Success: Memory saved',
          error: undefined,
        },
        tool: {
          name: 'save_memory',
          description: 'Saves memory',
          getDescription: vi.fn(),
        } as any,
      };

      // 捕获 onComplete 回调
      let capturedOnComplete:
        | ((completedTools: TrackedToolCall[]) => Promise<void>)
        | null = null;

      mockUseReactToolScheduler.mockImplementation((onComplete) => {
        capturedOnComplete = onComplete;
        return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
      });

      renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          mockPerformMemoryRefresh,
          false,
          () => {},
        ),
      );

      // 使用已完成的 save_memory 工具触发 onComplete 回调
      await act(async () => {
        if (capturedOnComplete) {
          await capturedOnComplete([completedToolCall]);
        }
      });

      await waitFor(() => {
        expect(mockPerformMemoryRefresh).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('错误处理', () => {
    it('应在流初始化失败时使用正确的 authType 调用 parseAndFormatApiError', async () => {
      // 1. 设置
      const mockError = new Error('Rate limit exceeded');
      const mockAuthType = AuthType.LOGIN_WITH_GOOGLE;
      mockParseAndFormatApiError.mockClear();
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: '' };
          throw mockError;
        })(),
      );

      const testConfig = {
        ...mockConfig,
        getContentGeneratorConfig: vi.fn(() => ({
          authType: mockAuthType,
        })),
        getModel: vi.fn(() => 'gemini-2.5-pro'),
      } as unknown as Config;

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(testConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          testConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
        ),
      );

      // 2. 操作
      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // 3. 断言
      await waitFor(() => {
        expect(mockParseAndFormatApiError).toHaveBeenCalledWith(
          'Rate limit exceeded',
          mockAuthType,
          undefined,
          'gemini-2.5-pro',
          'gemini-2.5-flash',
        );
      });
    });
  });
});