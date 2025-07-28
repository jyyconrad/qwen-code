/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 免责声明：这是 https://github.com/googleapis/js-genai/blob/main/src/chats.ts 的复制版本，目的是解决一个关键错误
// 即函数响应未被视为“有效”响应：https://b.corp.google.com/issues/420354090

import {
  GenerateContentResponse,
  Content,
  GenerateContentConfig,
  SendMessageParameters,
  createUserContent,
  Part,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { retryWithBackoff } from '../utils/retry.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { ContentGenerator, AuthType } from './contentGenerator.js';
import { Config } from '../config/config.js';
import {
  logApiRequest,
  logApiResponse,
  logApiError,
} from '../telemetry/loggers.js';
import {
  getStructuredResponse,
  getStructuredResponseFromParts,
} from '../utils/generateContentResponseUtilities.js';
import {
  ApiErrorEvent,
  ApiRequestEvent,
  ApiResponseEvent,
} from '../telemetry/types.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';

/**
 * 如果响应有效则返回 true，否则返回 false。
 */
function isValidResponse(response: GenerateContentResponse): boolean {
  if (response.candidates === undefined || response.candidates.length === 0) {
    return false;
  }
  const content = response.candidates[0]?.content;
  if (content === undefined) {
    return false;
  }
  return isValidContent(content);
}

function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}

/**
 * 验证历史记录包含正确的角色。
 *
 * @throws Error 如果历史记录未以用户回合开始。
 * @throws Error 如果历史记录包含无效角色。
 */
function validateHistory(history: Content[]) {
  for (const content of history) {
    if (content.role !== 'user' && content.role !== 'model') {
      throw new Error(`角色必须是 user 或 model，但得到的是 ${content.role}。`);
    }
  }
}

/**
 * 从完整历史记录中提取精选（有效）的历史记录。
 *
 * @remarks
 * 模型有时可能会生成无效或空的内容（例如，由于安全过滤器或引用）。从历史记录中提取有效回合
 * 可确保后续请求能被模型接受。
 */
function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] {
  if (comprehensiveHistory === undefined || comprehensiveHistory.length === 0) {
    return [];
  }
  const curatedHistory: Content[] = [];
  const length = comprehensiveHistory.length;
  let i = 0;
  while (i < length) {
    if (comprehensiveHistory[i].role === 'user') {
      curatedHistory.push(comprehensiveHistory[i]);
      i++;
    } else {
      const modelOutput: Content[] = [];
      let isValid = true;
      while (i < length && comprehensiveHistory[i].role === 'model') {
        modelOutput.push(comprehensiveHistory[i]);
        if (isValid && !isValidContent(comprehensiveHistory[i])) {
          isValid = false;
        }
        i++;
      }
      if (isValid) {
        curatedHistory.push(...modelOutput);
      } else {
        // 当模型内容无效时，移除最后一个用户输入。
        curatedHistory.pop();
      }
    }
  }
  return curatedHistory;
}

/**
 * 聊天会话，支持在之前的对话上下文中向模型发送消息。
 *
 * @remarks
 * 会话维护用户和模型之间的所有回合。
 */
export class GeminiChat {
  // 一个 Promise，表示当前发送给模型的消息的状态。
  private sendPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: Config,
    private readonly contentGenerator: ContentGenerator,
    private readonly generationConfig: GenerateContentConfig = {},
    private history: Content[] = [],
  ) {
    validateHistory(history);
  }

  private _getRequestTextFromContents(contents: Content[]): string {
    return contents
      .flatMap((content) => content.parts ?? [])
      .map((part) => part.text)
      .filter(Boolean)
      .join('');
  }

  private async _logApiRequest(
    contents: Content[],
    model: string,
    prompt_id: string,
  ): Promise<void> {
    const requestText = this._getRequestTextFromContents(contents);
    logApiRequest(
      this.config,
      new ApiRequestEvent(model, prompt_id, requestText),
    );
  }

  private async _logApiResponse(
    durationMs: number,
    prompt_id: string,
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
  ): Promise<void> {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        this.config.getModel(),
        durationMs,
        prompt_id,
        this.config.getContentGeneratorConfig()?.authType,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(
    durationMs: number,
    error: unknown,
    prompt_id: string,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        this.config.getModel(),
        errorMessage,
        durationMs,
        prompt_id,
        this.config.getContentGeneratorConfig()?.authType,
        errorType,
      ),
    );
  }

  /**
   * 当 OAuth 用户持续出现 429 错误时，处理回退到 Flash 模型。
   * 如果配置提供了回退处理程序，则使用它，否则返回 null。
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
          return null; // 模型已切换但不继续当前提示
        }
      } catch (error) {
        console.warn('Flash 回退处理程序失败:', error);
      }
    }

    return null;
  }

  /**
   * 向模型发送消息并返回响应。
   *
   * @remarks
   * 此方法将等待前一条消息处理完成后再发送下一条消息。
   *
   * @see {@link Chat#sendMessageStream} 获取流式方法。
   * @param params - 在聊天会话中发送消息的参数。
   * @returns 模型的响应。
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessage({
   *   message: '为什么天空是蓝色的？'
   * });
   * console.log(response.text);
   * ```
   */
  async sendMessage(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<GenerateContentResponse> {
    await this.sendPromise;
    const userContent = createUserContent(params.message);
    const requestContents = this.getHistory(true).concat(userContent);

    this._logApiRequest(requestContents, this.config.getModel(), prompt_id);

    const startTime = Date.now();
    let response: GenerateContentResponse;

    try {
      const apiCall = () => {
        const modelToUse = this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL;

        // 防止在配额错误后立即调用 Flash 模型
        if (
          this.config.getQuotaErrorOccurred() &&
          modelToUse === DEFAULT_GEMINI_FLASH_MODEL
        ) {
          throw new Error(
            '请提交新查询以继续使用 Flash 模型。',
          );
        }

        return this.contentGenerator.generateContent({
          model: modelToUse,
          contents: requestContents,
          config: { ...this.generationConfig, ...params.config },
        });
      };

      response = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false;
        },
        onPersistent429: async (authType?: string, error?: unknown) =>
          await this.handleFlashFallback(authType, error),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      const durationMs = Date.now() - startTime;
      await this._logApiResponse(
        durationMs,
        prompt_id,
        response.usageMetadata,
        getStructuredResponse(response),
      );

      this.sendPromise = (async () => {
        const outputContent = response.candidates?.[0]?.content;
        // 因为 AFC 输入包含完整的精选聊天历史记录以及新的用户输入，我们需要截断 AFC 历史记录
        // 以去重现有的聊天历史。
        const fullAutomaticFunctionCallingHistory =
          response.automaticFunctionCallingHistory;
        const index = this.getHistory(true).length;
        let automaticFunctionCallingHistory: Content[] = [];
        if (fullAutomaticFunctionCallingHistory != null) {
          automaticFunctionCallingHistory =
            fullAutomaticFunctionCallingHistory.slice(index) ?? [];
        }
        const modelOutput = outputContent ? [outputContent] : [];
        this.recordHistory(
          userContent,
          modelOutput,
          automaticFunctionCallingHistory,
        );
      })();
      await this.sendPromise.catch(() => {
        // 重置 sendPromise 以避免后续调用失败
        this.sendPromise = Promise.resolve();
      });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, prompt_id);
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * 向模型发送消息并以块的形式返回响应。
   *
   * @remarks
   * 此方法将等待前一条消息处理完成后再发送下一条消息。
   *
   * @see {@link Chat#sendMessage} 获取非流式方法。
   * @param params - 发送消息的参数。
   * @return 模型的响应。
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessageStream({
   *   message: '为什么天空是蓝色的？'
   * });
   * for await (const chunk of response) {
   *   console.log(chunk.text);
   * }
   * ```
   */
  async sendMessageStream(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    await this.sendPromise;
    const userContent = createUserContent(params.message);
    const requestContents = this.getHistory(true).concat(userContent);
    this._logApiRequest(requestContents, this.config.getModel(), prompt_id);

    const startTime = Date.now();

    try {
      const apiCall = () => {
        const modelToUse = this.config.getModel();

        // 防止在配额错误后立即调用 Flash 模型
        if (
          this.config.getQuotaErrorOccurred() &&
          modelToUse === DEFAULT_GEMINI_FLASH_MODEL
        ) {
          throw new Error(
            '请提交新查询以继续使用 Flash 模型。',
          );
        }

        return this.contentGenerator.generateContentStream({
          model: modelToUse,
          contents: requestContents,
          config: { ...this.generationConfig, ...params.config },
        });
      };

      // 注意：重试流可能很复杂。如果 generateContentStream 本身在产生异步生成器之前不处理重试
      // 用于瞬态问题，此重试将重新启动流。对于初始调用时的简单 429/500 错误，这没有问题。
      // 如果错误发生在流中间，此设置不会恢复流；它会重新启动流。
      const streamResponse = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          // 检查错误消息中的状态码，或已知的特定错误名称
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false; // 默认不重试其他错误
        },
        onPersistent429: async (authType?: string, error?: unknown) =>
          await this.handleFlashFallback(authType, error),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      // 解析内部跟踪发送完成承诺 - `sendPromise`
      // 无论成功还是失败响应。实际失败仍通过 `await streamResponse` 传播。
      this.sendPromise = Promise.resolve(streamResponse)
        .then(() => undefined)
        .catch(() => undefined);

      const result = this.processStreamResponse(
        streamResponse,
        userContent,
        startTime,
        prompt_id,
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, prompt_id);
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * 返回聊天历史记录。
   *
   * @remarks
   * 历史记录是用户和模型之间交替的内容列表。
   *
   * 有两种类型的历史记录：
   * - `精选历史记录` 仅包含用户和模型之间的有效回合，这些回合将包含在发送给模型的后续请求中。
   * - `完整历史记录` 包含所有回合，包括无效或空的模型输出，提供完整的历史记录。
   *
   * 历史记录在收到模型响应后更新，
   * 对于流式响应，这意味着收到响应的最后一个块。
   *
   * 默认返回 `完整历史记录`。要获取 `精选历史记录`，请将 `curated` 参数设置为 `true`。
   *
   * @param curated - 是否返回精选历史记录或完整历史记录。
   * @return 整个聊天会话中用户和模型交替的历史内容。
   */
  getHistory(curated: boolean = false): Content[] {
    const history = curated
      ? extractCuratedHistory(this.history)
      : this.history;
    // 深度复制历史记录以避免在聊天会话外部修改历史记录。
    return structuredClone(history);
  }

  /**
   * 清除聊天历史记录。
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 向聊天历史记录添加新条目。
   *
   * @param content - 要添加到历史记录的内容。
   */
  addHistory(content: Content): void {
    this.history.push(content);
  }
  setHistory(history: Content[]): void {
    this.history = history;
  }

  getFinalUsageMetadata(
    chunks: GenerateContentResponse[],
  ): GenerateContentResponseUsageMetadata | undefined {
    const lastChunkWithMetadata = chunks
      .slice()
      .reverse()
      .find((chunk) => chunk.usageMetadata);

    return lastChunkWithMetadata?.usageMetadata;
  }

  private async *processStreamResponse(
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    inputContent: Content,
    startTime: number,
    prompt_id: string,
  ) {
    const outputContent: Content[] = [];
    const chunks: GenerateContentResponse[] = [];
    let errorOccurred = false;

    try {
      for await (const chunk of streamResponse) {
        if (isValidResponse(chunk)) {
          chunks.push(chunk);
          const content = chunk.candidates?.[0]?.content;
          if (content !== undefined) {
            if (this.isThoughtContent(content)) {
              yield chunk;
              continue;
            }
            outputContent.push(content);
          }
        }
        yield chunk;
      }
    } catch (error) {
      errorOccurred = true;
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, prompt_id);
      throw error;
    }

    if (!errorOccurred) {
      const durationMs = Date.now() - startTime;
      const allParts: Part[] = [];
      for (const content of outputContent) {
        if (content.parts) {
          allParts.push(...content.parts);
        }
      }
      const fullText = getStructuredResponseFromParts(allParts);
      await this._logApiResponse(
        durationMs,
        prompt_id,
        this.getFinalUsageMetadata(chunks),
        fullText,
      );
    }
    this.recordHistory(inputContent, outputContent);
  }

  private recordHistory(
    userInput: Content,
    modelOutput: Content[],
    automaticFunctionCallingHistory?: Content[],
  ) {
    const nonThoughtModelOutput = modelOutput.filter(
      (content) => !this.isThoughtContent(content),
    );

    let outputContents: Content[] = [];
    if (
      nonThoughtModelOutput.length > 0 &&
      nonThoughtModelOutput.every((content) => content.role !== undefined)
    ) {
      outputContents = nonThoughtModelOutput;
    } else if (nonThoughtModelOutput.length === 0 && modelOutput.length > 0) {
      // 此情况处理模型仅返回思考的情况。
      // 在这种情况下，我们不想添加空的模型响应。
    } else {
      // 当不是函数响应时，如果模型返回空响应则追加空内容，这样
      // 历史记录始终在用户和模型之间交替。
      // 解决方案：https://b.corp.google.com/issues/420354090
      if (!isFunctionResponse(userInput)) {
        outputContents.push({
          role: 'model',
          parts: [],
        } as Content);
      }
    }
    if (
      automaticFunctionCallingHistory &&
      automaticFunctionCallingHistory.length > 0
    ) {
      this.history.push(
        ...extractCuratedHistory(automaticFunctionCallingHistory),
      );
    } else {
      this.history.push(userInput);
    }

    // 合并 outputContents 中相邻的模型角色
    const consolidatedOutputContents: Content[] = [];
    for (const content of outputContents) {
      if (this.isThoughtContent(content)) {
        continue;
      }
      const lastContent =
        consolidatedOutputContents[consolidatedOutputContents.length - 1];
      if (this.isTextContent(lastContent) && this.isTextContent(content)) {
        // 如果当前和最后一个是文本，将它们的文本合并到最后一个内容的第一个部分中
        // 并将当前内容的其他部分附加到其中。
        lastContent.parts[0].text += content.parts[0].text || '';
        if (content.parts.length > 1) {
          lastContent.parts.push(...content.parts.slice(1));
        }
      } else {
        consolidatedOutputContents.push(content);
      }
    }

    if (consolidatedOutputContents.length > 0) {
      const lastHistoryEntry = this.history[this.history.length - 1];
      const canMergeWithLastHistory =
        !automaticFunctionCallingHistory ||
        automaticFunctionCallingHistory.length === 0;

      if (
        canMergeWithLastHistory &&
        this.isTextContent(lastHistoryEntry) &&
        this.isTextContent(consolidatedOutputContents[0])
      ) {
        // 如果当前和最后一个是文本，将它们的文本合并到最后一个历史条目的第一个部分中
        // 并将当前内容的其他部分附加到其中。
        lastHistoryEntry.parts[0].text +=
          consolidatedOutputContents[0].parts[0].text || '';
        if (consolidatedOutputContents[0].parts.length > 1) {
          lastHistoryEntry.parts.push(
            ...consolidatedOutputContents[0].parts.slice(1),
          );
        }
        consolidatedOutputContents.shift(); // 移除第一个元素，因为它已被合并
      }
      this.history.push(...consolidatedOutputContents);
    }
  }

  private isTextContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ text: string }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].text === 'string' &&
      content.parts[0].text !== ''
    );
  }

  private isThoughtContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ thought: boolean }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].thought === 'boolean' &&
      content.parts[0].thought === true
    );
  }
}