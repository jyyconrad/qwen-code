/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Content,
  Models,
  GenerateContentConfig,
  Part,
  GenerateContentResponse,
} from '@google/genai';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { setSimulate429 } from '../utils/testUtils.js';

// 模拟
const mockModelsModule = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
  batchEmbedContents: vi.fn(),
} as unknown as Models;

describe('GeminiChat', () => {
  let chat: GeminiChat;
  let mockConfig: Config;
  const config: GenerateContentConfig = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getContentGeneratorConfig: () => ({
        authType: 'oauth-personal',
        model: 'test-model',
      }),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      setModel: vi.fn(),
      getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
      setQuotaErrorOccurred: vi.fn(),
      flashFallbackHandler: undefined,
    } as unknown as Config;

    // 禁用测试中的 429 模拟
    setSimulate429(false);
    // 通过创建新实例为每个测试重置历史记录
    chat = new GeminiChat(mockConfig, mockModelsModule, config, []);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  describe('sendMessage', () => {
    it('应使用正确的参数调用 generateContent', async () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [{ text: 'response' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: [],
          },
        ],
        text: () => 'response',
      } as unknown as GenerateContentResponse;
      vi.mocked(mockModelsModule.generateContent).mockResolvedValue(response);

      await chat.sendMessage({ message: 'hello' }, 'prompt-id-1');

      expect(mockModelsModule.generateContent).toHaveBeenCalledWith({
        model: 'gemini-pro',
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        config: {},
      });
    });
  });

  describe('sendMessageStream', () => {
    it('应使用正确的参数调用 generateContentStream', async () => {
      const response = (async function* () {
        yield {
          candidates: [
            {
              content: {
                parts: [{ text: 'response' }],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: [],
            },
          ],
          text: () => 'response',
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        response,
      );

      await chat.sendMessageStream({ message: 'hello' }, 'prompt-id-1');

      expect(mockModelsModule.generateContentStream).toHaveBeenCalledWith({
        model: 'gemini-pro',
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        config: {},
      });
    });
  });

  describe('recordHistory', () => {
    const userInput: Content = {
      role: 'user',
      parts: [{ text: 'User input' }],
    };

    it('应将用户输入和单个模型输出添加到历史记录中', () => {
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model output' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutput);
      const history = chat.getHistory();
      expect(history).toEqual([userInput, modelOutput[0]]);
    });

    it('应合并相邻的模型输出', () => {
      const modelOutputParts: Content[] = [
        { role: 'model', parts: [{ text: 'Model part 1' }] },
        { role: 'model', parts: [{ text: 'Model part 2' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputParts);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Model part 1Model part 2' }]);
    });

    it('应处理 outputContents 中用户和模型角色的混合（尽管不常见）', () => {
      const mixedOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model 1' }] },
        { role: 'user', parts: [{ text: 'Unexpected User' }] }, // 这应该按原样推送
        { role: 'model', parts: [{ text: 'Model 2' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, mixedOutput);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // user, model1, user_unexpected, model2
      expect(history[0]).toEqual(userInput);
      expect(history[1]).toEqual(mixedOutput[0]);
      expect(history[2]).toEqual(mixedOutput[1]);
      expect(history[3]).toEqual(mixedOutput[2]);
    });

    it('应正确合并多个相邻的模型输出', () => {
      const modelOutputParts: Content[] = [
        { role: 'model', parts: [{ text: 'M1' }] },
        { role: 'model', parts: [{ text: 'M2' }] },
        { role: 'model', parts: [{ text: 'M3' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputParts);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[1].parts).toEqual([{ text: 'M1M2M3' }]);
    });

    it('如果模型输出之间的角色不同，则不应合并', () => {
      const modelOutputParts: Content[] = [
        { role: 'model', parts: [{ text: 'M1' }] },
        { role: 'user', parts: [{ text: 'Interjecting User' }] },
        { role: 'model', parts: [{ text: 'M2' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputParts);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // user, M1, Interjecting User, M2
      expect(history[1].parts).toEqual([{ text: 'M1' }]);
      expect(history[3].parts).toEqual([{ text: 'M2' }]);
    });

    it('如果最后一个历史记录条目也是模型输出，则应与之合并', () => {
      // @ts-expect-error 访问私有属性用于测试设置
      chat.history = [
        userInput,
        { role: 'model', parts: [{ text: 'Initial Model Output' }] },
      ]; // 预设历史记录

      const newModelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'New Model Part 1' }] },
        { role: 'model', parts: [{ text: 'New Model Part 2' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, newModelOutput); // 这里的 userInput 是用于 *下一个* 回合的，但历史记录已经预设

      // 重置并设置更真实的合并现有历史记录场景
      chat = new GeminiChat(mockConfig, mockModelsModule, config, []);
      const firstUserInput: Content = {
        role: 'user',
        parts: [{ text: 'First user input' }],
      };
      const firstModelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'First model response' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(firstUserInput, firstModelOutput);

      const secondUserInput: Content = {
        role: 'user',
        parts: [{ text: 'Second user input' }],
      };
      const secondModelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Second model response part 1' }] },
        { role: 'model', parts: [{ text: 'Second model response part 2' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(secondUserInput, secondModelOutput);

      const finalHistory = chat.getHistory();
      expect(finalHistory.length).toBe(4); // user1, model1, user2, model2(consolidated)
      expect(finalHistory[0]).toEqual(firstUserInput);
      expect(finalHistory[1]).toEqual(firstModelOutput[0]);
      expect(finalHistory[2]).toEqual(secondUserInput);
      expect(finalHistory[3].role).toBe('model');
      expect(finalHistory[3].parts).toEqual([
        { text: 'Second model response part 1Second model response part 2' },
      ]);
    });

    it('应正确合并已合并的新输出与现有的模型历史记录', () => {
      // 设置：历史记录以模型回合结束
      const initialUser: Content = {
        role: 'user',
        parts: [{ text: 'Initial user query' }],
      };
      const initialModel: Content = {
        role: 'model',
        parts: [{ text: 'Initial model answer.' }],
      };
      chat = new GeminiChat(mockConfig, mockModelsModule, config, [
        initialUser,
        initialModel,
      ]);

      // 新交互
      const currentUserInput: Content = {
        role: 'user',
        parts: [{ text: 'Follow-up question' }],
      };
      const newModelParts: Content[] = [
        { role: 'model', parts: [{ text: 'Part A of new answer.' }] },
        { role: 'model', parts: [{ text: 'Part B of new answer.' }] },
      ];

      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(currentUserInput, newModelParts);
      const history = chat.getHistory();

      // 预期：initialUser, initialModel, currentUserInput, consolidatedNewModelParts
      expect(history.length).toBe(4);
      expect(history[0]).toEqual(initialUser);
      expect(history[1]).toEqual(initialModel);
      expect(history[2]).toEqual(currentUserInput);
      expect(history[3].role).toBe('model');
      expect(history[3].parts).toEqual([
        { text: 'Part A of new answer.Part B of new answer.' },
      ]);
    });

    it('应处理空的 modelOutput 数组', () => {
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, []);
      const history = chat.getHistory();
      // 如果 modelOutput 为空，它可能会推送一个默认的空模型部分，具体取决于 isFunctionResponse
      // 假设 isFunctionResponse(userInput) 对于这个简单的文本输入为 false
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([]);
    });

    it('应处理聚合 modelOutput', () => {
      const modelOutputUndefinedParts: Content[] = [
        { role: 'model', parts: [{ text: 'First model part' }] },
        { role: 'model', parts: [{ text: 'Second model part' }] },
        { role: 'model', parts: undefined as unknown as Part[] }, // 测试未定义的部分
        { role: 'model', parts: [{ text: 'Third model part' }] },
        { role: 'model', parts: [] }, // 测试空部分数组
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputUndefinedParts);
      const history = chat.getHistory();
      expect(history.length).toBe(5);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([
        { text: 'First model partSecond model part' },
      ]);
      expect(history[2].role).toBe('model');
      expect(history[2].parts).toBeUndefined();
      expect(history[3].role).toBe('model');
      expect(history[3].parts).toEqual([{ text: 'Third model part' }]);
      expect(history[4].role).toBe('model');
      expect(history[4].parts).toEqual([]);
    });

    it('应处理 parts 为 undefined 或空的 modelOutput（如果它们通过初始的 every 检查）', () => {
      const modelOutputUndefinedParts: Content[] = [
        { role: 'model', parts: [{ text: 'Text part' }] },
        { role: 'model', parts: undefined as unknown as Part[] }, // 测试未定义的部分
        { role: 'model', parts: [] }, // 测试空部分数组
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputUndefinedParts);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // userInput, model1 (text), model2 (undefined parts), model3 (empty parts)
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Text part' }]);
      expect(history[2].role).toBe('model');
      expect(history[2].parts).toBeUndefined();
      expect(history[3].role).toBe('model');
      expect(history[3].parts).toEqual([]);
    });

    it('应正确处理 automaticFunctionCallingHistory', () => {
      const afcHistory: Content[] = [
        { role: 'user', parts: [{ text: 'AFC User' }] },
        { role: 'model', parts: [{ text: 'AFC Model' }] },
      ];
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Regular Model Output' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutput, afcHistory);
      const history = chat.getHistory();
      expect(history.length).toBe(3);
      expect(history[0]).toEqual(afcHistory[0]);
      expect(history[1]).toEqual(afcHistory[1]);
      expect(history[2]).toEqual(modelOutput[0]);
    });

    it('如果 AFC 历史记录存在但为空，则应添加 userInput', () => {
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model Output' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutput, []); // 空的 AFC 历史记录
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1]).toEqual(modelOutput[0]);
    });

    it('应跳过 modelOutput 中的 "thought" 内容', () => {
      const modelOutputWithThought: Content[] = [
        { role: 'model', parts: [{ thought: true }, { text: 'Visible text' }] },
        { role: 'model', parts: [{ text: 'Another visible text' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputWithThought);
      const history = chat.getHistory();
      expect(history.length).toBe(2); // 用户输入 + 合并的模型输出
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      // 'thought' 部分被跳过，'Another visible text' 成为第一部分。
      expect(history[1].parts).toEqual([{ text: 'Another visible text' }]);
    });

    it('即使它是唯一的内容也应跳过 "thought" 内容', () => {
      const modelOutputOnlyThought: Content[] = [
        { role: 'model', parts: [{ thought: true }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputOnlyThought);
      const history = chat.getHistory();
      expect(history.length).toBe(1); // 用户输入 + 默认空模型部分
      expect(history[0]).toEqual(userInput);
    });

    it('当 thought 部分在中间时应正确合并文本部分', () => {
      const modelOutputMixed: Content[] = [
        { role: 'model', parts: [{ text: 'Part 1.' }] },
        {
          role: 'model',
          parts: [{ thought: true }, { text: 'Should be skipped' }],
        },
        { role: 'model', parts: [{ text: 'Part 2.' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputMixed);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Part 1.Part 2.' }]);
    });

    it('应正确处理多个 thought 部分', () => {
      const modelOutputMultipleThoughts: Content[] = [
        { role: 'model', parts: [{ thought: true }] },
        { role: 'model', parts: [{ text: 'Visible 1' }] },
        { role: 'model', parts: [{ thought: true }] },
        { role: 'model', parts: [{ text: 'Visible 2' }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputMultipleThoughts);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Visible 1Visible 2' }]);
    });

    it('应处理 outputContents 末尾的 thought 部分', () => {
      const modelOutputThoughtAtEnd: Content[] = [
        { role: 'model', parts: [{ text: 'Visible text' }] },
        { role: 'model', parts: [{ thought: true }] },
      ];
      // @ts-expect-error 访问私有方法用于测试目的
      chat.recordHistory(userInput, modelOutputThoughtAtEnd);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Visible text' }]);
    });
  });

  describe('addHistory', () => {
    it('应将新的内容项添加到历史记录中', () => {
      const newContent: Content = {
        role: 'user',
        parts: [{ text: 'A new message' }],
      };
      chat.addHistory(newContent);
      const history = chat.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]).toEqual(newContent);
    });

    it('应正确添加多个项目', () => {
      const content1: Content = {
        role: 'user',
        parts: [{ text: 'Message 1' }],
      };
      const content2: Content = {
        role: 'model',
        parts: [{ text: 'Message 2' }],
      };
      chat.addHistory(content1);
      chat.addHistory(content2);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(content1);
      expect(history[1]).toEqual(content2);
    });
  });
});