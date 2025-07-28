/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmbedContentParameters,
  GenerateContentConfig,
  Part,
  SchemaUnion,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import {
  Turn,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ChatCompressionInfo,
} from './turn.js';
import { Config } from '../config/config.js';
import { getCoreSystemPrompt, getCompressionPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { tokenLimit } from './tokenLimits.js';
import {
  AuthType,
  ContentGenerator,
  ContentGeneratorConfig,
  createContentGenerator,
} from './contentGenerator.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';

function isThinkingSupported(model: string) {
  if (model.startsWith('gemini-2.5')) return true;
  return false;
}

/**
 * 返回历史记录中总字符数的指定比例之后的内容索引。
 *
 * 为测试目的而导出。
 */
export function findIndexAfterFraction(
  history: Content[],
  fraction: number,
): number {
  if (fraction <= 0 || fraction >= 1) {
    throw new Error('Fraction must be between 0 and 1');
  }

  const contentLengths = history.map(
    (content) => JSON.stringify(content).length,
  );

  const totalCharacters = contentLengths.reduce(
    (sum, length) => sum + length,
    0,
  );
  const targetCharacters = totalCharacters * fraction;

  let charactersSoFar = 0;
  for (let i = 0; i < contentLengths.length; i++) {
    charactersSoFar += contentLengths[i];
    if (charactersSoFar >= targetCharacters) {
      return i;
    }
  }
  return contentLengths.length;
}

export class GeminiClient {
  private chat?: GeminiChat;
  private contentGenerator?: ContentGenerator;
  private embeddingModel: string;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private sessionTurnCount = 0;
  private readonly MAX_TURNS = 100;
  /**
   * 压缩令牌计数的阈值，作为模型令牌限制的一个分数。
   * 如果聊天历史记录超过此阈值，则将被压缩。
   */
  private readonly COMPRESSION_TOKEN_THRESHOLD = 0.7;
  /**
   * 要保留的最新聊天历史的比例。值为 0.3
   * 表示压缩后仅保留最后 30% 的聊天历史。
   */
  private readonly COMPRESSION_PRESERVE_THRESHOLD = 0.3;

  private readonly loopDetector: LoopDetectionService;
  private lastPromptId?: string;

  constructor(private config: Config) {
    if (config.getProxy()) {
      setGlobalDispatcher(new ProxyAgent(config.getProxy() as string));
    }

    this.embeddingModel = config.getEmbeddingModel();
    this.loopDetector = new LoopDetectionService(config);
  }

  async initialize(contentGeneratorConfig: ContentGeneratorConfig) {
    this.contentGenerator = await createContentGenerator(
      contentGeneratorConfig,
      this.config,
      this.config.getSessionId(),
    );
    this.chat = await this.startChat();
  }

  getContentGenerator(): ContentGenerator {
    if (!this.contentGenerator) {
      throw new Error('Content generator not initialized');
    }
    return this.contentGenerator;
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  isInitialized(): boolean {
    return this.chat !== undefined && this.contentGenerator !== undefined;
  }

  getHistory(): Content[] {
    return this.getChat().getHistory();
  }

  setHistory(history: Content[]) {
    this.getChat().setHistory(history);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
  }

  private async getEnvironment(): Promise<Part[]> {
    const cwd = this.config.getWorkingDir();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;
    const folderStructure = await getFolderStructure(cwd, {
      fileService: this.config.getFileService(),
    });
    const context = `
  这是 iFlyCode。我们正在为聊天设置上下文。
  今天的日期是 ${today}。
  我的操作系统是：${platform}
  我当前的工作目录是：${cwd}
  ${folderStructure}
          `.trim();

    const initialParts: Part[] = [{ text: context }];
    const toolRegistry = await this.config.getToolRegistry();

    // 如果设置了标志，则添加完整文件上下文
    if (this.config.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          // 读取目标目录中的所有文件
          const result = await readManyFilesTool.execute(
            {
              paths: ['**/*'], // 递归读取所有内容
              useDefaultExcludes: true, // 使用默认排除项
            },
            AbortSignal.timeout(30000),
          );
          if (result.llmContent) {
            initialParts.push({
              text: `\n--- 完整文件上下文 ---\n${result.llmContent}`,
            });
          } else {
            console.warn(
              '已请求完整上下文，但 read_many_files 未返回内容。',
            );
          }
        } else {
          console.warn(
            '已请求完整上下文，但未找到 read_many_files 工具。',
          );
        }
      } catch (error) {
        // 此处不使用 reportError，因为这是启动/配置阶段的错误，而非聊天/生成阶段的错误。
        console.error('读取完整文件上下文时出错：', error);
        initialParts.push({
          text: '\n--- 读取完整文件上下文时出错 ---',
        });
      }
    }

    return initialParts;
  }

  private async startChat(extraHistory?: Content[]): Promise<GeminiChat> {
    const envParts = await this.getEnvironment();
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    const history: Content[] = [
      {
        role: 'user',
        parts: envParts,
      },
      {
        role: 'model',
        parts: [{ text: '明白了。感谢提供上下文！' }],
      },
      ...(extraHistory ?? []),
    ];
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const generateContentConfigWithThinking = isThinkingSupported(
        this.config.getModel(),
      )
        ? {
            ...this.generateContentConfig,
            thinkingConfig: {
              includeThoughts: true,
            },
          }
        : this.generateContentConfig;
      return new GeminiChat(
        this.config,
        this.getContentGenerator(),
        {
          systemInstruction,
          ...generateContentConfigWithThinking,
          tools,
        },
        history,
      );
    } catch (error) {
      await reportError(
        error,
        '初始化 Gemini 聊天会话时出错。',
        history,
        'startChat',
      );
      throw new Error(`聊天初始化失败：${getErrorMessage(error)}`);
    }
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    turns: number = this.MAX_TURNS,
    originalModel?: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (this.lastPromptId !== prompt_id) {
      this.loopDetector.reset();
      this.lastPromptId = prompt_id;
    }
    this.sessionTurnCount++;
    if (
      this.config.getMaxSessionTurns() > 0 &&
      this.sessionTurnCount > this.config.getMaxSessionTurns()
    ) {
      yield { type: GeminiEventType.MaxSessionTurns };
      return new Turn(this.getChat(), prompt_id);
    }
    // 确保 turns 永远不超过 MAX_TURNS，以防止无限循环
    const boundedTurns = Math.min(turns, this.MAX_TURNS);
    if (!boundedTurns) {
      return new Turn(this.getChat(), prompt_id);
    }

    // 跟踪第一次调用的原始模型，以检测模型切换
    const initialModel = originalModel || this.config.getModel();

    const compressed = await this.tryCompressChat(prompt_id);

    if (compressed) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
    }
    const turn = new Turn(this.getChat(), prompt_id);
    const resultStream = turn.run(request, signal);
    for await (const event of resultStream) {
      if (this.loopDetector.addAndCheck(event)) {
        yield { type: GeminiEventType.LoopDetected };
        return turn;
      }
      yield event;
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      // 检查模型是否在调用期间被切换（可能由于配额错误）
      const currentModel = this.config.getModel();
      if (currentModel !== initialModel) {
        // 模型已被切换（可能由于配额错误回退）
        // 不继续递归调用，以防止意外执行 Flash 模型
        return turn;
      }

      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this,
        signal,
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: '请继续。' }];
        // 此递归调用的事件将被产出，但最终的
        // turn 对象将来自顶层调用。
        yield* this.sendMessageStream(
          nextRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          initialModel,
        );
      }
    }
    return turn;
  }

  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
    abortSignal: AbortSignal,
    model?: string,
    config: GenerateContentConfig = {},
  ): Promise<Record<string, unknown>> {
    // 使用配置中的当前模型，而不是硬编码的 Flash 模型
    const modelToUse =
      model || this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL;
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const requestConfig = {
        abortSignal,
        ...this.generateContentConfig,
        ...config,
      };

      const apiCall = () =>
        this.getContentGenerator().generateContent({
          model: modelToUse,
          config: {
            ...requestConfig,
            systemInstruction,
            responseSchema: schema,
            responseMimeType: 'application/json',
          },
          contents,
        });

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: async (authType?: string, error?: unknown) =>
          await this.handleFlashFallback(authType, error),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      const text = getResponseText(result);
      if (!text) {
        const error = new Error(
          'API returned an empty response for generateJson.',
        );
        await reportError(
          error,
          'generateJson 中出错：API 返回了空响应。',
          contents,
          'generateJson-empty-response',
        );
        throw error;
      }
      try {
        // 尝试从各种格式中提取 JSON
        const extractors = [
          // 匹配 ```json ... ``` 或 ``` ... ``` 块
          /```(?:json)?\s*\n?([\s\S]*?)\n?```/,
          // 匹配内联代码块 `{...}`
          /`(\{[\s\S]*?\})`/,
          // 匹配原始 JSON 对象或数组
          /(\{[\s\S]*\}|\[[\s\S]*\])/,
        ];

        for (const regex of extractors) {
          const match = text.match(regex);
          if (match && match[1]) {
            try {
              return JSON.parse(match[1].trim());
            } catch {
              // 如果解析失败，继续下一个模式
              continue;
            }
          }
        }

        // 如果没有模式匹配，则尝试解析整个文本
        return JSON.parse(text.trim());
      } catch (parseError) {
        await reportError(
          parseError,
          '无法解析 generateJson 的 JSON 响应。',
          {
            responseTextFailedToParse: text,
            originalRequestContents: contents,
          },
          'generateJson-parse',
        );
        throw new Error(
          `无法将 API 响应解析为 JSON：${getErrorMessage(parseError)}`,
        );
      }
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      // 避免对上面处理的空响应情况进行重复报告
      if (
        error instanceof Error &&
        error.message === 'API returned an empty response for generateJson.'
      ) {
        throw error;
      }

      await reportError(
        error,
        '通过 API 生成 JSON 内容时出错。',
        contents,
        'generateJson-api',
      );
      throw new Error(
        `生成 JSON 内容失败：${getErrorMessage(error)}`,
      );
    }
  }

  async generateContent(
    contents: Content[],
    generationConfig: GenerateContentConfig,
    abortSignal: AbortSignal,
    model?: string,
  ): Promise<GenerateContentResponse> {
    const modelToUse = model ?? this.config.getModel();
    const configToUse: GenerateContentConfig = {
      ...this.generateContentConfig,
      ...generationConfig,
    };

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      const requestConfig = {
        abortSignal,
        ...configToUse,
        systemInstruction,
      };

      const apiCall = () =>
        this.getContentGenerator().generateContent({
          model: modelToUse,
          config: requestConfig,
          contents,
        });

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: async (authType?: string, error?: unknown) =>
          await this.handleFlashFallback(authType, error),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      return result;
    } catch (error: unknown) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `通过 API 生成内容时出错，使用模型 ${modelToUse}。`,
        {
          requestContents: contents,
          requestConfig: configToUse,
        },
        'generateContent-api',
      );
      throw new Error(
        `使用模型 ${modelToUse} 生成内容失败：${getErrorMessage(error)}`,
      );
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    const embedModelParams: EmbedContentParameters = {
      model: this.embeddingModel,
      contents: texts,
    };

    const embedContentResponse =
      await this.getContentGenerator().embedContent(embedModelParams);
    if (
      !embedContentResponse.embeddings ||
      embedContentResponse.embeddings.length === 0
    ) {
      throw new Error('API 响应中未找到嵌入向量。');
    }

    if (embedContentResponse.embeddings.length !== texts.length) {
      throw new Error(
        `API 返回的嵌入向量数量不匹配。期望 ${texts.length}，实际得到 ${embedContentResponse.embeddings.length}。`,
      );
    }

    return embedContentResponse.embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length === 0) {
        throw new Error(
          `API 为索引 ${index} 处的输入文本返回了空嵌入向量："${texts[index]}"`,
        );
      }
      return values;
    });
  }

  async tryCompressChat(
    prompt_id: string,
    force: boolean = false,
  ): Promise<ChatCompressionInfo | null> {
    const curatedHistory = this.getChat().getHistory(true);

    // 无论是否 `force`，如果历史记录为空，则不执行任何操作。
    if (curatedHistory.length === 0) {
      return null;
    }

    const model = this.config.getModel();

    const { totalTokens: originalTokenCount } =
      await this.getContentGenerator().countTokens({
        model,
        contents: curatedHistory,
      });
    if (originalTokenCount === undefined) {
      console.warn(`无法确定模型 ${model} 的令牌计数。`);
      return null;
    }

    // 如果未强制且我们在限制范围内，则不压缩。
    if (
      !force &&
      originalTokenCount < this.COMPRESSION_TOKEN_THRESHOLD * tokenLimit(model)
    ) {
      return null;
    }

    let compressBeforeIndex = findIndexAfterFraction(
      curatedHistory,
      1 - this.COMPRESSION_PRESERVE_THRESHOLD,
    );
    // 找到索引后的第一个用户消息。这是下一轮的开始。
    while (
      compressBeforeIndex < curatedHistory.length &&
      (curatedHistory[compressBeforeIndex]?.role === 'model' ||
        isFunctionResponse(curatedHistory[compressBeforeIndex]))
    ) {
      compressBeforeIndex++;
    }

    const historyToCompress = curatedHistory.slice(0, compressBeforeIndex);
    const historyToKeep = curatedHistory.slice(compressBeforeIndex);

    this.getChat().setHistory(historyToCompress);

    const { text: summary } = await this.getChat().sendMessage(
      {
        message: {
          text: '首先，在你的草稿本中进行推理。然后，生成 <state_snapshot>。',
        },
        config: {
          systemInstruction: { text: getCompressionPrompt() },
        },
      },
      prompt_id,
    );
    this.chat = await this.startChat([
      {
        role: 'user',
        parts: [{ text: summary }],
      },
      {
        role: 'model',
        parts: [{ text: '明白了。感谢提供额外的上下文！' }],
      },
      ...historyToKeep,
    ]);

    const { totalTokens: newTokenCount } =
      await this.getContentGenerator().countTokens({
        // 调用 `sendMessage` 后模型可能发生变化，因此我们从配置中获取最新值
        model: this.config.getModel(),
        contents: this.getChat().getHistory(),
      });
    if (newTokenCount === undefined) {
      console.warn('无法确定压缩后历史记录的令牌计数。');
      return null;
    }

    return {
      originalTokenCount,
      newTokenCount,
    };
  }

  /**
   * 处理 OAuth 用户持续出现 429 错误时回退到 Flash 模型。
   * 如果配置提供了回退处理程序，则使用该处理程序，否则返回 null。
   */
  private async handleFlashFallback(
    authType?: string,
    error?: unknown,
  ): Promise<string | null> {
    // 仅处理 OAuth 用户的回退
    if (authType !== AuthType.LOGIN_WITH_GOOGLE) {
      return null;
    }

    const currentModel = this.config.getModel();
    const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;

    // 如果已经在使用 Flash 模型，则不回退
    if (currentModel === fallbackModel) {
      return null;
    }

    // 检查配置是否有回退处理程序（由 CLI 包设置）
    const fallbackHandler = this.config.flashFallbackHandler;
    if (typeof fallbackHandler === 'function') {
      try {
        const accepted = await fallbackHandler(
          currentModel,
          fallbackModel,
          error,
        );
        if (accepted !== false && accepted !== null) {
          this.config.setModel(fallbackModel);
          return fallbackModel;
        }
        // 检查处理程序中是否手动切换了模型
        if (this.config.getModel() === fallbackModel) {
          return null; // 模型已切换，但不继续当前提示
        }
      } catch (error) {
        console.warn('Flash 回退处理程序失败：', error);
      }
    }

    return null;
  }
}