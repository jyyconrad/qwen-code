/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  Chat,
  Content,
  EmbedContentResponse,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import { findIndexAfterFraction, GeminiClient } from './client.js';
import { AuthType, ContentGenerator } from './contentGenerator.js';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { GeminiEventType, Turn } from './turn.js';
import { getCoreSystemPrompt } from './prompts.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { setSimulate429 } from '../utils/testUtils.js';
import { tokenLimit } from './tokenLimits.js';

// --- 模拟 ---
const mockChatCreateFn = vi.fn();
const mockGenerateContentFn = vi.fn();
const mockEmbedContentFn = vi.fn();
const mockTurnRunFn = vi.fn();

vi.mock('@google/genai');
vi.mock('./turn', () => {
  // 定义一个与真实 Turn 具有相同结构的模拟类
  class MockTurn {
    pendingToolCalls = [];
    // run 方法是一个持有我们模拟函数的属性
    run = mockTurnRunFn;

    constructor() {
      // 构造函数可以为空或进行一些模拟设置
    }
  }
  // 将模拟类导出为 'Turn'
  return {
    Turn: MockTurn,
    GeminiEventType: {
      MaxSessionTurns: 'MaxSessionTurns',
      ChatCompressed: 'ChatCompressed',
    },
  };
});

vi.mock('../config/config.js');
vi.mock('./prompts');
vi.mock('../utils/getFolderStructure', () => ({
  getFolderStructure: vi.fn().mockResolvedValue('模拟文件夹结构'),
}));
vi.mock('../utils/errorReporting', () => ({ reportError: vi.fn() }));
vi.mock('../utils/nextSpeakerChecker', () => ({
  checkNextSpeaker: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/generateContentResponseUtilities', () => ({
  getResponseText: (result: GenerateContentResponse) =>
    result.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ||
    undefined,
}));
vi.mock('../telemetry/index.js', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
}));

describe('findIndexAfterFraction', () => {
  const history: Content[] = [
    { role: 'user', parts: [{ text: '这是第一条消息。' }] }, // JSON 长度: 66
    { role: 'model', parts: [{ text: '这是第二条消息。' }] }, // JSON 长度: 68
    { role: 'user', parts: [{ text: '这是第三条消息。' }] }, // JSON 长度: 66
    { role: 'model', parts: [{ text: '这是第四条消息。' }] }, // JSON 长度: 68
    { role: 'user', parts: [{ text: '这是第五条消息。' }] }, // JSON 长度: 65
  ];
  // 总长度: 333

  it('对于非正数应抛出错误', () => {
    expect(() => findIndexAfterFraction(history, 0)).toThrow(
      '分数必须在 0 和 1 之间',
    );
  });

  it('对于大于或等于 1 的分数应抛出错误', () => {
    expect(() => findIndexAfterFraction(history, 1)).toThrow(
      '分数必须在 0 和 1 之间',
    );
  });

  it('应处理中间的分数', () => {
    // 333 * 0.5 = 166.5
    // 0: 66
    // 1: 66 + 68 = 134
    // 2: 134 + 66 = 200
    // 200 >= 166.5, 所以索引是 2
    expect(findIndexAfterFraction(history, 0.5)).toBe(2);
  });

  it('应处理导致最后一个索引的分数', () => {
    // 333 * 0.9 = 299.7
    // ...
    // 3: 200 + 68 = 268
    // 4: 268 + 65 = 333
    // 333 >= 299.7, 所以索引是 4
    expect(findIndexAfterFraction(history, 0.9)).toBe(4);
  });

  it('应处理空历史记录', () => {
    expect(findIndexAfterFraction([], 0.5)).toBe(0);
  });

  it('应处理只有一项的历史记录', () => {
    expect(findIndexAfterFraction(history.slice(0, 1), 0.5)).toBe(0);
  });

  it('应处理包含奇怪部分的历史记录', () => {
    const historyWithEmptyParts: Content[] = [
      { role: 'user', parts: [{ text: '消息 1' }] },
      { role: 'model', parts: [{ fileData: { fileUri: 'derp' } }] },
      { role: 'user', parts: [{ text: '消息 2' }] },
    ];
    expect(findIndexAfterFraction(historyWithEmptyParts, 0.5)).toBe(1);
  });
});

describe('Gemini 客户端 (client.ts)', () => {
  let client: GeminiClient;
  beforeEach(async () => {
    vi.resetAllMocks();

    // 在测试中禁用 429 模拟
    setSimulate429(false);

    // 设置 GoogleGenAI 构造函数及其方法的模拟
    const MockedGoogleGenAI = vi.mocked(GoogleGenAI);
    MockedGoogleGenAI.mockImplementation(() => {
      const mock = {
        chats: { create: mockChatCreateFn },
        models: {
          generateContent: mockGenerateContentFn,
          embedContent: mockEmbedContentFn,
        },
      };
      return mock as unknown as GoogleGenAI;
    });

    mockChatCreateFn.mockResolvedValue({} as Chat);
    mockGenerateContentFn.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: '{"key": "value"}' }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    // 由于 GeminiClient 构造函数启动了一个异步过程 (startChat)
    // 该过程依赖于一个完全形成的 Config 对象，我们需要为这些测试模拟
    // Config 的整个实现。
    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(null),
    };
    const fileService = new FileDiscoveryService('/test/dir');
    const MockedConfig = vi.mocked(Config, true);
    const contentGeneratorConfig = {
      model: 'test-model',
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };
    MockedConfig.mockImplementation(() => {
      const mock = {
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue(contentGeneratorConfig),
        getToolRegistry: vi.fn().mockResolvedValue(mockToolRegistry),
        getModel: vi.fn().mockReturnValue('test-model'),
        getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
        getApiKey: vi.fn().mockReturnValue('test-key'),
        getVertexAI: vi.fn().mockReturnValue(false),
        getUserAgent: vi.fn().mockReturnValue('test-agent'),
        getUserMemory: vi.fn().mockReturnValue(''),
        getFullContext: vi.fn().mockReturnValue(false),
        getSessionId: vi.fn().mockReturnValue('test-session-id'),
        getProxy: vi.fn().mockReturnValue(undefined),
        getWorkingDir: vi.fn().mockReturnValue('/test/dir'),
        getFileService: vi.fn().mockReturnValue(fileService),
        getMaxSessionTurns: vi.fn().mockReturnValue(0),
        getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
        setQuotaErrorOccurred: vi.fn(),
        getNoBrowser: vi.fn().mockReturnValue(false),
      };
      return mock as unknown as Config;
    });

    // 我们可以在这里实例化客户端，因为 Config 已被模拟
    // 并且构造函数将使用模拟的 GoogleGenAI
    const mockConfig = new Config({} as never);
    client = new GeminiClient(mockConfig);
    await client.initialize(contentGeneratorConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 注意：由于 @google/genai 模拟存在持续问题，以下 startChat 测试已被移除。
  // 具体来说，mockChatCreateFn (代表 instance.chats.create)
  // 未被检测为由 GeminiClient 实例调用。
  // 这可能指向 GoogleGenerativeAI 类构造函数及其
  // 实例方法如何被模拟和使用的问题。
  // 对于未来的调试，请确保 GeminiClient 中的 `this.client` (即
  // GoogleGenerativeAI 的模拟实例) 的 `chats.create` 方法
  // 正确指向 `mockChatCreateFn`。
  // it('startChat 应使用 userMemory 调用 getCoreSystemPrompt 并传递给 chats.create', async () => { ... });
  // it('如果 userMemory 为空，startChat 应使用空字符串调用 getCoreSystemPrompt', async () => { ... });

  // 注意：由于 @google/genai 模拟存在持续问题，以下 generateJson 测试已被移除，
  // 与 startChat 测试类似。mockGenerateContentFn
  // (代表 instance.models.generateContent) 未被检测为已调用，或者模拟
  // 未能阻止实际的 API 调用 (导致 API 密钥错误)。
  // 对于未来的调试，请确保 GeminiClient 中的 `this.client.models.generateContent` 正确
  // 使用 `mockGenerateContentFn`。
  // it('generateJson 应使用 userMemory 调用 getCoreSystemPrompt 并传递给 generateContent', async () => { ... });
  // it('如果 userMemory 为空，generateJson 应使用空字符串调用 getCoreSystemPrompt', async () => { ... });

  describe('generateEmbedding', () => {
    const texts = ['hello world', 'goodbye world'];
    const testEmbeddingModel = 'test-embedding-model';

    it('应使用正确的参数调用 embedContent 并返回嵌入向量', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      const mockResponse: EmbedContentResponse = {
        embeddings: [
          { values: mockEmbeddings[0] },
          { values: mockEmbeddings[1] },
        ],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      const result = await client.generateEmbedding(texts);

      expect(mockEmbedContentFn).toHaveBeenCalledTimes(1);
      expect(mockEmbedContentFn).toHaveBeenCalledWith({
        model: testEmbeddingModel,
        contents: texts,
      });
      expect(result).toEqual(mockEmbeddings);
    });

    it('如果传递空数组应返回空数组', async () => {
      const result = await client.generateEmbedding([]);
      expect(result).toEqual([]);
      expect(mockEmbedContentFn).not.toHaveBeenCalled();
    });

    it('如果 API 响应没有嵌入向量数组应抛出错误', async () => {
      mockEmbedContentFn.mockResolvedValue({} as EmbedContentResponse); // 没有 `embeddings` 键

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API 响应中未找到嵌入向量。',
      );
    });

    it('如果 API 响应有空的嵌入向量数组应抛出错误', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);
      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API 响应中未找到嵌入向量。',
      );
    });

    it('如果 API 返回不匹配数量的嵌入向量应抛出错误', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }], // 只有一个，但 texts 有两个
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API 返回的嵌入向量数量不匹配。期望 2 个，得到 1 个。',
      );
    });

    it('如果任何嵌入向量有 nullish 值应抛出错误', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }, { values: undefined }], // 第二个是坏的
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API 为索引 1 处的输入文本返回了空嵌入向量: "goodbye world"',
      );
    });

    it('如果任何嵌入向量有空的值数组应抛出错误', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [] }, { values: [1, 2, 3] }], // 第一个是坏的
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API 为索引 0 处的输入文本返回了空嵌入向量: "hello world"',
      );
    });

    it('应传播来自 API 调用的错误', async () => {
      const apiError = new Error('API 故障');
      mockEmbedContentFn.mockRejectedValue(apiError);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API 故障',
      );
    });
  });

  describe('generateContent', () => {
    it('应使用正确的参数调用 generateContent', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const generationConfig = { temperature: 0.5 };
      const abortSignal = new AbortController().signal;

      // 模拟 countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateContent(contents, generationConfig, abortSignal);

      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: 'test-model',
        config: {
          abortSignal,
          systemInstruction: getCoreSystemPrompt(''),
          temperature: 0.5,
          topP: 1,
        },
        contents,
      });
    });
  });

  describe('generateJson', () => {
    it('应使用正确的参数调用 generateContent', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const schema = { type: 'string' };
      const abortSignal = new AbortController().signal;

      // 模拟 countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateJson(contents, schema, abortSignal);

      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: 'test-model', // 应使用配置中的当前模型
        config: {
          abortSignal,
          systemInstruction: getCoreSystemPrompt(''),
          temperature: 0,
          topP: 1,
          responseSchema: schema,
          responseMimeType: 'application/json',
        },
        contents,
      });
    });

    it('应允许覆盖模型和配置', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const schema = { type: 'string' };
      const abortSignal = new AbortController().signal;
      const customModel = 'custom-json-model';
      const customConfig = { temperature: 0.9, topK: 20 };

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateJson(
        contents,
        schema,
        abortSignal,
        customModel,
        customConfig,
      );

      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: customModel,
        config: {
          abortSignal,
          systemInstruction: getCoreSystemPrompt(''),
          temperature: 0.9,
          topP: 1, // 来自默认值
          topK: 20,
          responseSchema: schema,
          responseMimeType: 'application/json',
        },
        contents,
      });
    });
  });

  describe('addHistory', () => {
    it('应使用提供的内容调用 chat.addHistory', async () => {
      const mockChat = {
        addHistory: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client['chat'] = mockChat as any;

      const newContent = {
        role: 'user',
        parts: [{ text: '新的历史记录项' }],
      };
      await client.addHistory(newContent);

      expect(mockChat.addHistory).toHaveBeenCalledWith(newContent);
    });
  });

  describe('resetChat', () => {
    it('应创建新的聊天会话，清除旧的历史记录', async () => {
      // 1. 获取初始聊天实例并添加一些历史记录。
      const initialChat = client.getChat();
      const initialHistory = await client.getHistory();
      await client.addHistory({
        role: 'user',
        parts: [{ text: '一些旧消息' }],
      });
      const historyWithOldMessage = await client.getHistory();
      expect(historyWithOldMessage.length).toBeGreaterThan(
        initialHistory.length,
      );

      // 2. 调用 resetChat。
      await client.resetChat();

      // 3. 获取新的聊天实例及其历史记录。
      const newChat = client.getChat();
      const newHistory = await client.getHistory();

      // 4. 断言聊天实例是新的且历史记录已重置。
      expect(newChat).not.toBe(initialChat);
      expect(newHistory.length).toBe(initialHistory.length);
      expect(JSON.stringify(newHistory)).not.toContain('一些旧消息');
    });
  });

  describe('tryCompressChat', () => {
    const mockCountTokens = vi.fn();
    const mockSendMessage = vi.fn();
    const mockGetHistory = vi.fn();

    beforeEach(() => {
      vi.mock('./tokenLimits', () => ({
        tokenLimit: vi.fn(),
      }));

      client['contentGenerator'] = {
        countTokens: mockCountTokens,
      } as unknown as ContentGenerator;

      client['chat'] = {
        getHistory: mockGetHistory,
        addHistory: vi.fn(),
        setHistory: vi.fn(),
        sendMessage: mockSendMessage,
      } as unknown as GeminiChat;
    });

    it('如果令牌计数低于阈值不应触发摘要', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...历史记录...' }] },
      ]);

      mockCountTokens.mockResolvedValue({
        totalTokens: MOCKED_TOKEN_LIMIT * 0.699, // TOKEN_THRESHOLD_FOR_SUMMARIZATION = 0.7
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-2');
      const newChat = client.getChat();

      expect(tokenLimit).toHaveBeenCalled();
      expect(result).toBeNull();
      expect(newChat).toBe(initialChat);
    });

    it('如果令牌计数达到阈值应触发摘要', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...历史记录...' }] },
      ]);

      const originalTokenCount = 1000 * 0.7;
      const newTokenCount = 100;

      mockCountTokens
        .mockResolvedValueOnce({ totalTokens: originalTokenCount }) // 第一次调用用于检查
        .mockResolvedValueOnce({ totalTokens: newTokenCount }); // 第二次调用用于新历史记录

      // 模拟来自聊天的摘要响应
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: '这是一个摘要。' }],
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-3');
      const newChat = client.getChat();

      expect(tokenLimit).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();

      // 断言摘要已发生并返回了正确的统计信息
      expect(result).toEqual({
        originalTokenCount,
        newTokenCount,
      });

      // 断言聊天已被重置
      expect(newChat).not.toBe(initialChat);
    });

    it('不应跨函数调用响应进行压缩', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...历史记录 1...' }] },
        { role: 'model', parts: [{ text: '...历史记录 2...' }] },
        { role: 'user', parts: [{ text: '...历史记录 3...' }] },
        { role: 'model', parts: [{ text: '...历史记录 4...' }] },
        { role: 'user', parts: [{ text: '...历史记录 5...' }] },
        { role: 'model', parts: [{ text: '...历史记录 6...' }] },
        { role: 'user', parts: [{ text: '...历史记录 7...' }] },
        { role: 'model', parts: [{ text: '...历史记录 8...' }] },
        // 通常我们会在这里中断，但我们有一个函数响应。
        {
          role: 'user',
          parts: [{ functionResponse: { name: '...历史记录 8...' } }],
        },
        { role: 'model', parts: [{ text: '...历史记录 10...' }] },
        // 相反，我们在这里中断。
        { role: 'user', parts: [{ text: '...历史记录 10...' }] },
      ]);

      const originalTokenCount = 1000 * 0.7;
      const newTokenCount = 100;

      mockCountTokens
        .mockResolvedValueOnce({ totalTokens: originalTokenCount }) // 第一次调用用于检查
        .mockResolvedValueOnce({ totalTokens: newTokenCount }); // 第二次调用用于新历史记录

      // 模拟来自聊天的摘要响应
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: '这是一个摘要。' }],
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-3');
      const newChat = client.getChat();

      expect(tokenLimit).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();

      // 断言摘要已发生并返回了正确的统计信息
      expect(result).toEqual({
        originalTokenCount,
        newTokenCount,
      });
      // 断言聊天已被重置
      expect(newChat).not.toBe(initialChat);

      // 1. 标准开始上下文消息
      // 2. 标准预设用户开始消息
      // 3. 压缩摘要消息
      // 4. 标准预设用户摘要消息
      // 5. 最后一条用户消息 (不是最后 3 条，因为那会以函数响应开始)
      expect(newChat.getHistory().length).toEqual(5);
    });

    it('当 force 为 true 时应始终触发摘要，无论令牌计数如何', async () => {
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...历史记录...' }] },
      ]);

      const originalTokenCount = 10; // 远低于阈值
      const newTokenCount = 5;

      mockCountTokens
        .mockResolvedValueOnce({ totalTokens: originalTokenCount })
        .mockResolvedValueOnce({ totalTokens: newTokenCount });

      // 模拟来自聊天的摘要响应
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: '这是一个摘要。' }],
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-1', true); // force = true
      const newChat = client.getChat();

      expect(mockSendMessage).toHaveBeenCalled();

      expect(result).toEqual({
        originalTokenCount,
        newTokenCount,
      });

      // 断言聊天已被重置
      expect(newChat).not.toBe(initialChat);
    });
  });

  describe('sendMessageStream', () => {
    it('流完成后应返回 turn 实例', async () => {
      // 安排
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // 行动
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-1',
      );

      // 手动消费流以获取最终返回值。
      let finalResult: Turn | undefined;
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
      }

      // 断言
      expect(finalResult).toBeInstanceOf(Turn);
    });

    it('当 nextSpeaker 总是返回 model 时应在 MAX_TURNS 后停止无限循环', async () => {
      // 获取模拟的 checkNextSpeaker 函数并配置它以触发无限循环
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);
      mockCheckNextSpeaker.mockResolvedValue({
        next_speaker: 'model',
        reasoning: '测试用例 - 总是继续',
      });

      // 模拟 Turn 没有待处理的工具调用 (这将允许 nextSpeaker 检查)
      const mockStream = (async function* () {
        yield { type: 'content', value: '继续...' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // 使用一个永远不会被中止的信号
      const abortController = new AbortController();
      const signal = abortController.signal;

      // 行动 - 启动应循环的流
      const stream = client.sendMessageStream(
        [{ text: '开始对话' }],
        signal,
        'prompt-id-2',
      );

      // 计算我们获得的流事件数量
      let eventCount = 0;
      let finalResult: Turn | undefined;

      // 消费流并计算迭代次数
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
        eventCount++;

        // 安全检查以防止测试中的实际无限循环
        if (eventCount > 200) {
          abortController.abort();
          throw new Error(
            '测试超过了预期的事件限制 - 可能存在实际的无限循环',
          );
        }
      }

      // 断言
      expect(finalResult).toBeInstanceOf(Turn);

      // 调试: 检查 checkNextSpeaker 被调用了多少次
      const callCount = mockCheckNextSpeaker.mock.calls.length;

      // 如果无限循环保护正在工作，checkNextSpeaker 应该被调用多次
      // 但在达到 MAX_TURNS (100) 时停止。由于每次递归调用都应触发 checkNextSpeaker，
      // 我们期望它在达到限制之前被调用多次
      expect(mockCheckNextSpeaker).toHaveBeenCalled();

      // 测试应演示无限循环保护是否有效:
      // - 如果 checkNextSpeaker 被调用多次 (接近 MAX_TURNS)，则表明循环正在发生
      // - 如果只被调用一次，则递归行为可能未被触发
      if (callCount === 0) {
        throw new Error(
          'checkNextSpeaker 从未被调用 - 未满足递归条件',
        );
      } else if (callCount === 1) {
        // 这可能是预期行为，如果 turn 有待处理的工具调用或其他条件阻止递归
        console.log(
          'checkNextSpeaker 仅被调用一次 - 未发生无限循环',
        );
      } else {
        console.log(
          `checkNextSpeaker 被调用 ${callCount} 次 - 无限循环保护有效`,
        );
        // 如果被调用多次，我们期望它在 MAX_TURNS 之前停止
        expect(callCount).toBeLessThanOrEqual(100); // 不应超过 MAX_TURNS
      }

      // 流应产生事件并最终终止
      expect(eventCount).toBeGreaterThanOrEqual(1);
      expect(eventCount).toBeLessThan(200); // 不应超过我们的安全限制
    });

    it('当达到会话轮次限制时应产生 MaxSessionTurns 并停止', async () => {
      // 安排
      const MAX_SESSION_TURNS = 5;
      vi.spyOn(client['config'], 'getMaxSessionTurns').mockReturnValue(
        MAX_SESSION_TURNS,
      );

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // 行动 & 断言
      // 运行到限制
      for (let i = 0; i < MAX_SESSION_TURNS; i++) {
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-4',
        );
        // 消费流
        for await (const _event of stream) {
          // 什么都不做
        }
      }

      // 此调用应超出限制
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-5',
      );

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([{ type: GeminiEventType.MaxSessionTurns }]);
      expect(mockTurnRunFn).toHaveBeenCalledTimes(MAX_SESSION_TURNS);
    });

    it('即使 turns 参数设置为大值也应遵守 MAX_TURNS 限制', async () => {
      // 此测试验证即使当
      // 有人试图通过使用非常大的 turns 值调用来绕过它时，无限循环保护也能工作

      // 获取模拟的 checkNextSpeaker 函数并配置它以触发无限循环
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);
      mockCheckNextSpeaker.mockResolvedValue({
        next_speaker: 'model',
        reasoning: '测试用例 - 总是继续',
      });

      // 模拟 Turn 没有待处理的工具调用 (这将允许 nextSpeaker 检查)
      const mockStream = (async function* () {
        yield { type: 'content', value: '继续...' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // 使用一个永远不会被中止的信号
      const abortController = new AbortController();
      const signal = abortController.signal;

      // 行动 - 使用极高的 turns 值启动流
      // 这模拟了有人试图绕过 turns 保护的情况
      const stream = client.sendMessageStream(
        [{ text: '开始对话' }],
        signal,
        'prompt-id-3',
        Number.MAX_SAFE_INTEGER, // 绕过 MAX_TURNS 保护
      );

      // 计算我们获得的流事件数量
      let eventCount = 0;
      const maxTestIterations = 1000; // 更高的限制以显示循环继续

      // 消费流并计算迭代次数
      try {
        while (true) {
          const result = await stream.next();
          if (result.done) {
            break;
          }
          eventCount++;

          // 此测试应达到此限制，演示无限循环
          if (eventCount > maxTestIterations) {
            abortController.abort();
            // 这是预期行为 - 我们遇到了无限循环
            break;
          }
        }
      } catch (error) {
        // 如果测试框架超时，这也演示了无限循环
        console.error('测试超时或出错:', error);
      }

      // 断言修复是否有效 - 循环应在 MAX_TURNS 处停止
      const callCount = mockCheckNextSpeaker.mock.calls.length;

      // 有了修复: 即使 turns 设置为非常高的值，
      // 循环也应在 MAX_TURNS (100) 处停止
      expect(callCount).toBeLessThanOrEqual(100); // 不应超过 MAX_TURNS
      expect(eventCount).toBeLessThanOrEqual(200); // 应有合理数量的事件

      console.log(
        `无限循环保护有效: checkNextSpeaker 被调用 ${callCount} 次, ` +
          `生成了 ${eventCount} 个事件 (由 MAX_TURNS 正确限制)`,
      );
    });
  });

  describe('generateContent', () => {
    it('内容生成时应使用配置中的当前模型', async () => {
      const initialModel = client['config'].getModel();
      const contents = [{ role: 'user', parts: [{ text: 'test' }] }];
      const currentModel = initialModel + '-changed';

      vi.spyOn(client['config'], 'getModel').mockReturnValueOnce(currentModel);

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateContent(contents, {}, new AbortController().signal);

      expect(mockGenerateContentFn).not.toHaveBeenCalledWith({
        model: initialModel,
        config: expect.any(Object),
        contents,
      });
      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: currentModel,
        config: expect.any(Object),
        contents,
      });
    });
  });

  describe('tryCompressChat', () => {
    it('sendMessage 后应使用配置中的当前模型进行令牌计数', async () => {
      const initialModel = client['config'].getModel();

      const mockCountTokens = vi
        .fn()
        .mockResolvedValueOnce({ totalTokens: 100000 })
        .mockResolvedValueOnce({ totalTokens: 5000 });

      const mockSendMessage = vi.fn().mockResolvedValue({ text: '摘要' });

      const mockChatHistory = [
        { role: 'user', parts: [{ text: '长对话' }] },
        { role: 'model', parts: [{ text: '长响应' }] },
      ];

      const mockChat: Partial<GeminiChat> = {
        getHistory: vi.fn().mockReturnValue(mockChatHistory),
        setHistory: vi.fn(),
        sendMessage: mockSendMessage,
      };

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: mockCountTokens,
      };

      // 模拟模型在 `countTokens` 调用之间已更改
      const firstCurrentModel = initialModel + '-changed-1';
      const secondCurrentModel = initialModel + '-changed-2';
      vi.spyOn(client['config'], 'getModel')
        .mockReturnValueOnce(firstCurrentModel)
        .mockReturnValueOnce(secondCurrentModel);

      client['chat'] = mockChat as GeminiChat;
      client['contentGenerator'] = mockGenerator as ContentGenerator;
      client['startChat'] = vi.fn().mockResolvedValue(mockChat);

      const result = await client.tryCompressChat('prompt-id-4', true);

      expect(mockCountTokens).toHaveBeenCalledTimes(2);
      expect(mockCountTokens).toHaveBeenNthCalledWith(1, {
        model: firstCurrentModel,
        contents: mockChatHistory,
      });
      expect(mockCountTokens).toHaveBeenNthCalledWith(2, {
        model: secondCurrentModel,
        contents: expect.any(Array),
      });

      expect(result).toEqual({
        originalTokenCount: 100000,
        newTokenCount: 5000,
      });
    });
  });

  describe('handleFlashFallback', () => {
    it('检查回退时应使用配置中的当前模型', async () => {
      const initialModel = client['config'].getModel();
      const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;

      // 模拟配置已更改
      const currentModel = initialModel + '-changed';
      vi.spyOn(client['config'], 'getModel').mockReturnValueOnce(currentModel);

      const mockFallbackHandler = vi.fn().mockResolvedValue(true);
      client['config'].flashFallbackHandler = mockFallbackHandler;
      client['config'].setModel = vi.fn();

      const result = await client['handleFlashFallback'](
        AuthType.LOGIN_WITH_GOOGLE,
      );

      expect(result).toBe(fallbackModel);

      expect(mockFallbackHandler).toHaveBeenCalledWith(
        currentModel,
        fallbackModel,
        undefined,
      );
    });
  });
});