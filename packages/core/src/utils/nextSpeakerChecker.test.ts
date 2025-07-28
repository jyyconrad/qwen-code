/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { Content, GoogleGenAI, Models } from '@google/genai';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import { checkNextSpeaker, NextSpeakerResponse } from './nextSpeakerChecker.js';
import { GeminiChat } from '../core/geminiChat.js';

// 模拟 GeminiClient 和 Config 构造函数
vi.mock('../core/client.js');
vi.mock('../config/config.js');

// 定义将在测试中使用的 GoogleGenAI 和 Models 实例的模拟对象
const mockModelsInstance = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
  batchEmbedContents: vi.fn(),
} as unknown as Models;

const mockGoogleGenAIInstance = {
  getGenerativeModel: vi.fn().mockReturnValue(mockModelsInstance),
  // 如果 GeminiChat 构造函数或其方法直接使用了 GoogleGenAI 的其他方法，请在此添加
} as unknown as GoogleGenAI;

vi.mock('@google/genai', async () => {
  const actualGenAI =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actualGenAI,
    GoogleGenAI: vi.fn(() => mockGoogleGenAIInstance), // 模拟构造函数以返回预定义的实例
    // 如果 Models 在 GeminiChat 中被直接实例化，也要模拟其构造函数
    // 目前假设 Models 实例是通过 getGenerativeModel 获得的
  };
});

describe('checkNextSpeaker', () => {
  let chatInstance: GeminiChat;
  let mockGeminiClient: GeminiClient;
  let MockConfig: Mock;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    MockConfig = vi.mocked(Config);
    const mockConfigInstance = new MockConfig(
      'test-api-key',
      'gemini-pro',
      false,
      '.',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
    );

    mockGeminiClient = new GeminiClient(mockConfigInstance);

    // 在每次测试前重置模拟对象以确保测试隔离
    vi.mocked(mockModelsInstance.generateContent).mockReset();
    vi.mocked(mockModelsInstance.generateContentStream).mockReset();

    // GeminiChat 将通过模拟的 GoogleGenAI 构造函数接收模拟实例
    chatInstance = new GeminiChat(
      mockConfigInstance,
      mockModelsInstance, // 这是 mockGoogleGenAIInstance.getGenerativeModel 返回的实例
      {},
      [], // 初始历史记录
    );

    // 监视 chatInstance 的 getHistory 方法
    vi.spyOn(chatInstance, 'getHistory');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('如果历史记录为空，应返回 null', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it('如果最后一位发言者是用户，应返回 null', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ] as Content[]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it("当模型意图继续时，应返回 { next_speaker: 'model' }", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'I will now do something.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: '模型声明它将执行某些操作。',
      next_speaker: 'model',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
    expect(mockGeminiClient.generateJson).toHaveBeenCalledTimes(1);
  });

  it("当模型提出问题时，应返回 { next_speaker: 'user' }", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'What would you like to do?' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: '模型提出了一个问题。',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it("当模型做出陈述时，应返回 { next_speaker: 'user' }", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'This is a statement.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: '模型做出了陈述，等待用户输入。',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it('如果 geminiClient.generateJson 抛出错误，应返回 null', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockRejectedValue(
      new Error('API Error'),
    );

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('如果 geminiClient.generateJson 返回无效 JSON（缺少 next_speaker），应返回 null', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: '这是不完整的。',
    } as unknown as NextSpeakerResponse); // 类型断言以模拟无效响应

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('如果 geminiClient.generateJson 返回非字符串类型的 next_speaker，应返回 null', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: '模型做出了陈述，等待用户输入。',
      next_speaker: 123, // 无效类型
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('如果 geminiClient.generateJson 返回无效的 next_speaker 字符串值，应返回 null', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: '模型做出了陈述，等待用户输入。',
      next_speaker: 'neither', // 无效的枚举值
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('应使用 DEFAULT_GEMINI_FLASH_MODEL 调用 generateJson', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: '模型做出了陈述，等待用户输入。',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    await checkNextSpeaker(chatInstance, mockGeminiClient, abortSignal);

    expect(mockGeminiClient.generateJson).toHaveBeenCalled();
    const generateJsonCall = (mockGeminiClient.generateJson as Mock).mock
      .calls[0];
    expect(generateJsonCall[3]).toBe(DEFAULT_GEMINI_FLASH_MODEL);
  });
});