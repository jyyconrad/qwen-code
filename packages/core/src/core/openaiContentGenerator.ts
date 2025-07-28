/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  FinishReason,
  Part,
  Content,
  Tool,
  ToolListUnion,
  CallableTool,
  FunctionCall,
  FunctionResponse,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/index.js';
import { logApiResponse } from '../telemetry/loggers.js';
import { ApiResponseEvent } from '../telemetry/types.js';
import { Config } from '../config/config.js';
import { openaiLogger } from '../utils/openaiLogger.js';

// OpenAI API type definitions for logging
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string;
}

interface OpenAIRequestFormat {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: unknown[];
}

interface OpenAIResponseFormat {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

export class OpenAIContentGenerator implements ContentGenerator {
  private client: OpenAI;
  private model: string;
  private config: Config;
  private streamingToolCalls: Map<
    number,
    {
      id?: string;
      name?: string;
      arguments: string;
    }
  > = new Map();

  constructor(apiKey: string, model: string, config: Config) {
    this.model = model;
    this.config = config;
    const baseURL = process.env.OPENAI_BASE_URL || '';

    // 配置超时设置 - 使用渐进式超时
    const timeoutConfig = {
      // 大多数请求的基础超时时间（2分钟）
      timeout: 120000,
      // 请求失败的最大重试次数
      maxRetries: 3,
      // HTTP 客户端选项
      httpAgent: undefined, // 让客户端使用默认代理
    };

    // 允许配置覆盖超时设置
    const contentGeneratorConfig = this.config.getContentGeneratorConfig();
    if (contentGeneratorConfig?.timeout) {
      timeoutConfig.timeout = contentGeneratorConfig.timeout;
    }
    if (contentGeneratorConfig?.maxRetries !== undefined) {
      timeoutConfig.maxRetries = contentGeneratorConfig.maxRetries;
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout: timeoutConfig.timeout,
      maxRetries: timeoutConfig.maxRetries,
    });
  }

  /**
   * 检查错误是否为超时错误
   */
  private isTimeoutError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorCode = (error as any)?.code;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorType = (error as any)?.type;

    // 检查常见的超时指示符
    return (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('connection timeout') ||
      errorMessage.includes('request timeout') ||
      errorMessage.includes('read timeout') ||
      errorMessage.includes('etimedout') || // 在消息检查中包含 ETIMEDOUT
      errorMessage.includes('esockettimedout') || // 在消息检查中包含 ESOCKETTIMEDOUT
      errorCode === 'ETIMEDOUT' ||
      errorCode === 'ESOCKETTIMEDOUT' ||
      errorType === 'timeout' ||
      // OpenAI 特定的超时指示符
      errorMessage.includes('request timed out') ||
      errorMessage.includes('deadline exceeded')
    );
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const startTime = Date.now();
    const messages = this.convertToOpenAIFormat(request);

    try {
      // 构建采样参数，明确优先级：
      // 1. 请求级别的参数（最高优先级）
      // 2. 配置级别的采样参数（中等优先级）
      // 3. 默认值（最低优先级）
      const samplingParams = this.buildSamplingParameters(request);

      const createParams: Parameters<
        typeof this.client.chat.completions.create
      >[0] = {
        model: this.model,
        messages,
        ...samplingParams,
      };

      if (request.config?.tools) {
        createParams.tools = await this.convertGeminiToolsToOpenAI(
          request.config.tools,
        );
      }
      // console.log('createParams', createParams);
      const completion = (await this.client.chat.completions.create(
        createParams,
      )) as ChatCompletion;

      const response = this.convertToGeminiFormat(completion);
      const durationMs = Date.now() - startTime;

      // 记录 API 响应事件用于 UI 遥测
      const responseEvent = new ApiResponseEvent(
        this.model,
        durationMs,
        `openai-${Date.now()}`, // 生成提示 ID
        this.config.getContentGeneratorConfig()?.authType,
        response.usageMetadata,
      );

      logApiResponse(this.config, responseEvent);

      // 如果启用则记录交互
      if (this.config.getContentGeneratorConfig()?.enableOpenAILogging) {
        const openaiRequest = await this.convertGeminiRequestToOpenAI(request);
        const openaiResponse = this.convertGeminiResponseToOpenAI(response);
        await openaiLogger.logInteraction(openaiRequest, openaiResponse);
      }

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // 专门识别超时错误
      const isTimeoutError = this.isTimeoutError(error);
      const errorMessage = isTimeoutError
        ? `请求在 ${Math.round(durationMs / 1000)} 秒后超时。尝试减少输入长度或在配置中增加超时时间。`
        : error instanceof Error
          ? error.message
          : String(error);

      // 即使出现错误也估算 token 使用量
      // 这有助于跟踪失败请求的成本和使用情况
      let estimatedUsage;
      try {
        const tokenCountResult = await this.countTokens({
          contents: request.contents,
          model: this.model,
        });
        estimatedUsage = {
          promptTokenCount: tokenCountResult.totalTokens,
          candidatesTokenCount: 0, // 请求失败，无完成 token
          totalTokenCount: tokenCountResult.totalTokens,
        };
      } catch {
        // 如果 token 计数也失败，则提供最小估算
        const contentStr = JSON.stringify(request.contents);
        const estimatedTokens =this.roughCount(contentStr);
        estimatedUsage = {
          promptTokenCount: estimatedTokens,
          candidatesTokenCount: 0,
          totalTokenCount: estimatedTokens,
        };
      }

      // 记录带有估算使用量的 API 错误事件用于 UI 遥测
      const errorEvent = new ApiResponseEvent(
        this.model,
        durationMs,
        `openai-${Date.now()}`, // 生成提示 ID
        this.config.getContentGeneratorConfig()?.authType,
        estimatedUsage,
        undefined,
        errorMessage,
      );
      logApiResponse(this.config, errorEvent);

      // 如果启用则记录错误交互
      if (this.config.getContentGeneratorConfig()?.enableOpenAILogging) {
        const openaiRequest = await this.convertGeminiRequestToOpenAI(request);
        await openaiLogger.logInteraction(
          openaiRequest,
          undefined,
          error as Error,
        );
      }

      console.error('OpenAI API 错误:', errorMessage);

      // 提供有用的超时特定错误消息
      if (isTimeoutError) {
        throw new Error(
          `${errorMessage}\n\n故障排除提示:\n` +
            `- 减少输入长度或复杂性\n` +
            `- 在配置中增加超时时间: contentGenerator.timeout\n` +
            `- 检查网络连接\n` +
            `- 考虑对长响应使用流式模式`,
        );
      }

      throw new Error(`OpenAI API 错误: ${errorMessage}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const startTime = Date.now();
    const messages = this.convertToOpenAIFormat(request);

    try {
      // 构建采样参数，明确优先级
      const samplingParams = this.buildSamplingParameters(request);

      const createParams: Parameters<
        typeof this.client.chat.completions.create
      >[0] = {
        model: this.model,
        messages,
        ...samplingParams,
        stream: true,
        stream_options: { include_usage: true },
      };

      if (request.config?.tools) {
        createParams.tools = await this.convertGeminiToolsToOpenAI(
          request.config.tools,
        );
      }

      // console.log('createParams', createParams);

      const stream = (await this.client.chat.completions.create(
        createParams,
      )) as AsyncIterable<ChatCompletionChunk>;

      const originalStream = this.streamGenerator(stream);

      // 收集所有响应用于最终记录（流式传输期间不记录）
      const responses: GenerateContentResponse[] = [];

      // 返回一个既生成响应又收集响应的新生成器
      const wrappedGenerator = async function* (this: OpenAIContentGenerator) {
        try {
          for await (const response of originalStream) {
            responses.push(response);
            yield response;
          }

          const durationMs = Date.now() - startTime;

          // 从最后一个有使用量元数据的响应中获取最终使用量元数据
          const finalUsageMetadata = responses
            .slice()
            .reverse()
            .find((r) => r.usageMetadata)?.usageMetadata;

          // 记录 API 响应事件用于 UI 遥测
          const responseEvent = new ApiResponseEvent(
            this.model,
            durationMs,
            `openai-stream-${Date.now()}`, // 生成提示 ID
            this.config.getContentGeneratorConfig()?.authType,
            finalUsageMetadata,
          );

          logApiResponse(this.config, responseEvent);

          // 如果启用则记录交互（与 generateContent 方法相同）
          if (this.config.getContentGeneratorConfig()?.enableOpenAILogging) {
            const openaiRequest =
              await this.convertGeminiRequestToOpenAI(request);
            // 对于流式传输，我们将所有响应合并为单个响应用于记录
            const combinedResponse =
              this.combineStreamResponsesForLogging(responses);
            const openaiResponse =
              this.convertGeminiResponseToOpenAI(combinedResponse);
            await openaiLogger.logInteraction(openaiRequest, openaiResponse);
          }
        } catch (error) {
          const durationMs = Date.now() - startTime;

          // 专门识别流式传输的超时错误
          const isTimeoutError = this.isTimeoutError(error);
          const errorMessage = isTimeoutError
            ? `流式请求在 ${Math.round(durationMs / 1000)} 秒后超时。尝试减少输入长度或在配置中增加超时时间。`
            : error instanceof Error
              ? error.message
              : String(error);

          // 即使流式传输出现错误也估算 token 使用量
          let estimatedUsage;
          try {
            const tokenCountResult = await this.countTokens({
              contents: request.contents,
              model: this.model,
            });
            estimatedUsage = {
              promptTokenCount: tokenCountResult.totalTokens,
              candidatesTokenCount: 0, // 请求失败，无完成 token
              totalTokenCount: tokenCountResult.totalTokens,
            };
          } catch {
            // 如果 token 计数也失败，则提供最小估算
            const contentStr = JSON.stringify(request.contents);
            const estimatedTokens =this.roughCount(contentStr);
            estimatedUsage = {
              promptTokenCount: estimatedTokens,
              candidatesTokenCount: 0,
              totalTokenCount: estimatedTokens,
            };
          }

          // 记录带有估算使用量的 API 错误事件用于 UI 遥测
          const errorEvent = new ApiResponseEvent(
            this.model,
            durationMs,
            `openai-stream-${Date.now()}`, // 生成提示 ID
            this.config.getContentGeneratorConfig()?.authType,
            estimatedUsage,
            undefined,
            errorMessage,
          );
          logApiResponse(this.config, errorEvent);

          // 如果启用则记录错误交互
          if (this.config.getContentGeneratorConfig()?.enableOpenAILogging) {
            const openaiRequest =
              await this.convertGeminiRequestToOpenAI(request);
            await openaiLogger.logInteraction(
              openaiRequest,
              undefined,
              error as Error,
            );
          }

          // 为流式传输提供有用的超时特定错误消息
          if (isTimeoutError) {
            throw new Error(
              `${errorMessage}\n\n流式传输超时故障排除:\n` +
                `- 减少输入长度或复杂性\n` +
                `- 在配置中增加超时时间: contentGenerator.timeout\n` +
                `- 检查流式连接的网络稳定性\n` +
                `- 考虑对非常长的输入使用非流式模式`,
            );
          }

          throw error;
        }
      }.bind(this);

      return wrappedGenerator();
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // 专门识别流式传输设置的超时错误
      const isTimeoutError = this.isTimeoutError(error);
      const errorMessage = isTimeoutError
        ? `流式传输设置在 ${Math.round(durationMs / 1000)} 秒后超时。尝试减少输入长度或在配置中增加超时时间。`
        : error instanceof Error
          ? error.message
          : String(error);

      // 即使流式传输设置出现错误也估算 token 使用量
      let estimatedUsage;
      try {
        const tokenCountResult = await this.countTokens({
          contents: request.contents,
          model: this.model,
        });
        estimatedUsage = {
          promptTokenCount: tokenCountResult.totalTokens,
          candidatesTokenCount: 0, // 请求失败，无完成 token
          totalTokenCount: tokenCountResult.totalTokens,
        };
      } catch {
        // 如果 token 计数也失败，则提供最小估算
        const contentStr = JSON.stringify(request.contents);
        const estimatedTokens = this.roughCount(contentStr);
        estimatedUsage = {
          promptTokenCount: estimatedTokens,
          candidatesTokenCount: 0,
          totalTokenCount: estimatedTokens,
        };
      }

      // 记录带有估算使用量的 API 错误事件用于 UI 遥测
      const errorEvent = new ApiResponseEvent(
        this.model,
        durationMs,
        `openai-stream-${Date.now()}`, // 生成提示 ID
        this.config.getContentGeneratorConfig()?.authType,
        estimatedUsage,
        undefined,
        errorMessage,
      );
      logApiResponse(this.config, errorEvent);

      console.error('OpenAI API 流式传输错误:', errorMessage);

      // 为流式传输设置提供有用的超时特定错误消息
      if (isTimeoutError) {
        throw new Error(
          `${errorMessage}\n\n流式传输设置超时故障排除:\n` +
            `- 减少输入长度或复杂性\n` +
            `- 在配置中增加超时时间: contentGenerator.timeout\n` +
            `- 检查网络连接和防火墙设置\n` +
            `- 考虑对非常长的输入使用非流式模式`,
        );
      }

      throw new Error(`OpenAI API 错误: ${errorMessage}`);
    }
  }

  private async *streamGenerator(
    stream: AsyncIterable<ChatCompletionChunk>,
  ): AsyncGenerator<GenerateContentResponse> {
    // 为每个新流重置累加器
    this.streamingToolCalls.clear();

    for await (const chunk of stream) {
      yield this.convertStreamChunkToGeminiFormat(chunk);
    }
  }

  /**
   * 合并流式响应用于记录目的
   */
  private combineStreamResponsesForLogging(
    responses: GenerateContentResponse[],
  ): GenerateContentResponse {
    if (responses.length === 0) {
      return new GenerateContentResponse();
    }

    // 查找最后一个有使用量元数据的响应
    const finalUsageMetadata = responses
      .slice()
      .reverse()
      .find((r) => r.usageMetadata)?.usageMetadata;

    // 合并流中的所有文本内容
    const combinedParts: Part[] = [];
    let combinedText = '';
    const functionCalls: Part[] = [];

    for (const response of responses) {
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if ('text' in part && part.text) {
            combinedText += part.text;
          } else if ('functionCall' in part && part.functionCall) {
            functionCalls.push(part);
          }
        }
      }
    }

    // 如果有文本则添加
    if (combinedText) {
      combinedParts.push({ text: combinedText });
    }

    // 添加函数调用
    combinedParts.push(...functionCalls);

    // 创建合并响应
    const combinedResponse = new GenerateContentResponse();
    combinedResponse.candidates = [
      {
        content: {
          parts: combinedParts,
          role: 'model' as const,
        },
        finishReason:
          responses[responses.length - 1]?.candidates?.[0]?.finishReason ||
          FinishReason.FINISH_REASON_UNSPECIFIED,
        index: 0,
        safetyRatings: [],
      },
    ];
    combinedResponse.modelVersion = this.model;
    combinedResponse.promptFeedback = { safetyRatings: [] };
    combinedResponse.usageMetadata = finalUsageMetadata;

    return combinedResponse;
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // OpenAI 没有直接的 token 计数端点
    // 我们将基于 tiktoken 库或粗略计算进行估算
    // 目前，返回粗略估算
    const content = JSON.stringify(request.contents);
    const estimatedTokens = this.roughCount(content)

    return {
      totalTokens: estimatedTokens,
    };
  }
  /**
 * 粗略估算 token 数量（非精确，仅用于预估）
 * 汉字按 0.75 token / 字，英文按 0.25 token / 字符计算
 * @param text 输入文本
 * @returns 估算的 token 数量（向上取整）
 */
roughCount(text: string): number {
  let total = 0;

  for (const ch of [...text]) {
    const code = ch.codePointAt(0) ?? 0;

    // 中文汉字范围（CJK Unified Ideographs）
    if (code >= 0x4e00 && code <= 0x9fff) {
      total += 0.75;
    } else {
      total += 0.25;
    }
  }

  return Math.ceil(total);
}

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // 从内容中提取文本
    let text = '';
    if (Array.isArray(request.contents)) {
      text = request.contents
        .map((content) => {
          if (typeof content === 'string') return content;
          if ('parts' in content && content.parts) {
            return content.parts
              .map((part) =>
                typeof part === 'string'
                  ? part
                  : 'text' in part
                    ? (part as { text?: string }).text || ''
                    : '',
              )
              .join(' ');
          }
          return '';
        })
        .join(' ');
    } else if (request.contents) {
      if (typeof request.contents === 'string') {
        text = request.contents;
      } else if ('parts' in request.contents && request.contents.parts) {
        text = request.contents.parts
          .map((part: Part) =>
            typeof part === 'string' ? part : 'text' in part ? part.text : '',
          )
          .join(' ');
      }
    }

    try {
      const embedding = await this.client.embeddings.create({
        model: 'text-embedding-ada-002', // 默认嵌入模型
        input: text,
      });

      return {
        embeddings: [
          {
            values: embedding.data[0].embedding,
          },
        ],
      };
    } catch (error) {
      console.error('OpenAI API 嵌入错误:', error);
      throw new Error(
        `OpenAI API 错误: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private convertGeminiParametersToOpenAI(
    parameters: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!parameters || typeof parameters !== 'object') {
      return parameters;
    }

    const converted = JSON.parse(JSON.stringify(parameters));

    const convertTypes = (obj: unknown): unknown => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(convertTypes);
      }

      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'type' && typeof value === 'string') {
          // 将 Gemini 类型转换为 OpenAI JSON Schema 类型
          const lowerValue = value.toLowerCase();
          if (lowerValue === 'integer') {
            result[key] = 'integer';
          } else if (lowerValue === 'number') {
            result[key] = 'number';
          } else {
            result[key] = lowerValue;
          }
        } else if (
          key === 'minimum' ||
          key === 'maximum' ||
          key === 'multipleOf'
        ) {
          // 确保数值约束是实际数字，而不是字符串
          if (typeof value === 'string' && !isNaN(Number(value))) {
            result[key] = Number(value);
          } else {
            result[key] = value;
          }
        } else if (
          key === 'minLength' ||
          key === 'maxLength' ||
          key === 'minItems' ||
          key === 'maxItems'
        ) {
          // 确保长度约束是整数，而不是字符串
          if (typeof value === 'string' && !isNaN(Number(value))) {
            result[key] = parseInt(value, 10);
          } else {
            result[key] = value;
          }
        } else if (typeof value === 'object') {
          result[key] = convertTypes(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return convertTypes(converted) as Record<string, unknown> | undefined;
  }

  private async convertGeminiToolsToOpenAI(
    geminiTools: ToolListUnion,
  ): Promise<OpenAI.Chat.ChatCompletionTool[]> {
    const openAITools: OpenAI.Chat.ChatCompletionTool[] = [];

    for (const tool of geminiTools) {
      let actualTool: Tool;

      // 处理 CallableTool vs Tool
      if ('tool' in tool) {
        // 这是一个 CallableTool
        actualTool = await (tool as CallableTool).tool();
      } else {
        // 这已经是一个 Tool
        actualTool = tool as Tool;
      }

      if (actualTool.functionDeclarations) {
        for (const func of actualTool.functionDeclarations) {
          if (func.name && func.description) {
            openAITools.push({
              type: 'function',
              function: {
                name: func.name,
                description: func.description,
                parameters: this.convertGeminiParametersToOpenAI(
                  (func.parameters || {}) as Record<string, unknown>,
                ),
              },
            });
          }
        }
      }
    }

    // console.log(
    //   'OpenAI 工具参数:',
    //   JSON.stringify(openAITools, null, 2),
    // );
    return openAITools;
  }

  private convertToOpenAIFormat(
    request: GenerateContentParameters,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // 处理来自配置的系统指令
    if (request.config?.systemInstruction) {
      const systemInstruction = request.config.systemInstruction;
      let systemText = '';

      if (Array.isArray(systemInstruction)) {
        systemText = systemInstruction
          .map((content) => {
            if (typeof content === 'string') return content;
            if ('parts' in content) {
              const contentObj = content as Content;
              return (
                contentObj.parts
                  ?.map((p: Part) =>
                    typeof p === 'string' ? p : 'text' in p ? p.text : '',
                  )
                  .join('\n') || ''
              );
            }
            return '';
          })
          .join('\n');
      } else if (typeof systemInstruction === 'string') {
        systemText = systemInstruction;
      } else if (
        typeof systemInstruction === 'object' &&
        'parts' in systemInstruction
      ) {
        const systemContent = systemInstruction as Content;
        systemText =
          systemContent.parts
            ?.map((p: Part) =>
              typeof p === 'string' ? p : 'text' in p ? p.text : '',
            )
            .join('\n') || '';
      }

      if (systemText) {
        messages.push({
          role: 'system' as const,
          content: systemText,
        });
      }
    }

    // 处理内容
    if (Array.isArray(request.contents)) {
      for (const content of request.contents) {
        if (typeof content === 'string') {
          messages.push({ role: 'user' as const, content });
        } else if ('role' in content && 'parts' in content) {
          // 检查此内容是否有函数调用或响应
          const functionCalls: FunctionCall[] = [];
          const functionResponses: FunctionResponse[] = [];
          const textParts: string[] = [];

          for (const part of content.parts || []) {
            if (typeof part === 'string') {
              textParts.push(part);
            } else if ('text' in part && part.text) {
              textParts.push(part.text);
            } else if ('functionCall' in part && part.functionCall) {
              functionCalls.push(part.functionCall);
            } else if ('functionResponse' in part && part.functionResponse) {
              functionResponses.push(part.functionResponse);
            }
          }

          // 处理函数响应（工具结果）
          if (functionResponses.length > 0) {
            for (const funcResponse of functionResponses) {
              messages.push({
                role: 'tool' as const,
                tool_call_id: funcResponse.id || '',
                content:
                  typeof funcResponse.response === 'string'
                    ? funcResponse.response
                    : JSON.stringify(funcResponse.response),
              });
            }
          }
          // 处理带函数调用的模型消息
          else if (content.role === 'model' && functionCalls.length > 0) {
            const toolCalls = functionCalls.map((fc, index) => ({
              id: fc.id || `call_${index}`,
              type: 'function' as const,
              function: {
                name: fc.name || '',
                arguments: JSON.stringify(fc.args || {}),
              },
            }));

            messages.push({
              role: 'assistant' as const,
              content: textParts.join('\n') || null,
              tool_calls: toolCalls,
            });
          }
          // 处理常规文本消息
          else {
            const role =
              content.role === 'model'
                ? ('assistant' as const)
                : ('user' as const);
            const text = textParts.join('\n');
            if (text) {
              messages.push({ role, content: text });
            }
          }
        }
      }
    } else if (request.contents) {
      if (typeof request.contents === 'string') {
        messages.push({ role: 'user' as const, content: request.contents });
      } else if ('role' in request.contents && 'parts' in request.contents) {
        const content = request.contents;
        const role =
          content.role === 'model' ? ('assistant' as const) : ('user' as const);
        const text =
          content.parts
            ?.map((p: Part) =>
              typeof p === 'string' ? p : 'text' in p ? p.text : '',
            )
            .join('\n') || '';
        messages.push({ role, content: text });
      }
    }

    // 清理孤立的工具调用并合并连续的助手消息
    const cleanedMessages = this.cleanOrphanedToolCalls(messages);
    return this.mergeConsecutiveAssistantMessages(cleanedMessages);
  }

  /**
   * 清理消息历史中的孤立工具调用以防止 OpenAI API 错误
   */
  private cleanOrphanedToolCalls(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const cleaned: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const toolCallIds = new Set<string>();
    const toolResponseIds = new Set<string>();

    // 第一遍：收集所有工具调用 ID 和工具响应 ID
    for (const message of messages) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            toolCallIds.add(toolCall.id);
          }
        }
      } else if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        toolResponseIds.add(message.tool_call_id);
      }
    }

    // 第二遍：过滤孤立消息
    for (const message of messages) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        // 过滤出没有相应响应的工具调用
        const validToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && toolResponseIds.has(toolCall.id),
        );

        if (validToolCalls.length > 0) {
          // 保留消息但仅保留有效的工具调用
          const cleanedMessage = { ...message };
          (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls = validToolCalls;
          cleaned.push(cleanedMessage);
        } else if (
          typeof message.content === 'string' &&
          message.content.trim()
        ) {
          // 如果有文本内容则保留消息，但移除工具调用
          const cleanedMessage = { ...message };
          delete (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls;
          cleaned.push(cleanedMessage);
        }
        // 如果没有有效的工具调用且没有内容，则完全跳过该消息
      } else if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        // 只保留有相应工具调用的工具响应
        if (toolCallIds.has(message.tool_call_id)) {
          cleaned.push(message);
        }
      } else {
        // 原样保留所有其他消息
        cleaned.push(message);
      }
    }

    // 最终验证：确保每个带 tool_calls 的助手消息都有相应的工具响应
    const finalCleaned: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const finalToolCallIds = new Set<string>();

    // 收集所有剩余的工具调用 ID
    for (const message of cleaned) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            finalToolCallIds.add(toolCall.id);
          }
        }
      }
    }

    // 验证所有工具调用都有响应
    const finalToolResponseIds = new Set<string>();
    for (const message of cleaned) {
      if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        finalToolResponseIds.add(message.tool_call_id);
      }
    }

    // 移除任何剩余的孤立工具调用
    for (const message of cleaned) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        const finalValidToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && finalToolResponseIds.has(toolCall.id),
        );

        if (finalValidToolCalls.length > 0) {
          const cleanedMessage = { ...message };
          (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls = finalValidToolCalls;
          finalCleaned.push(cleanedMessage);
        } else if (
          typeof message.content === 'string' &&
          message.content.trim()
        ) {
          const cleanedMessage = { ...message };
          delete (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls;
          finalCleaned.push(cleanedMessage);
        }
      } else {
        finalCleaned.push(message);
      }
    }

    return finalCleaned;
  }

  /**
   * 合并连续的助手消息以组合分割的文本和工具调用
   */
  private mergeConsecutiveAssistantMessages(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const merged: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      if (message.role === 'assistant' && merged.length > 0) {
        const lastMessage = merged[merged.length - 1];

        // 如果最后一条消息也是助手消息，则合并它们
        if (lastMessage.role === 'assistant') {
          // 组合内容
          const combinedContent = [
            typeof lastMessage.content === 'string' ? lastMessage.content : '',
            typeof message.content === 'string' ? message.content : '',
          ]
            .filter(Boolean)
            .join('');

          // 组合工具调用
          const lastToolCalls =
            'tool_calls' in lastMessage ? lastMessage.tool_calls || [] : [];
          const currentToolCalls =
            'tool_calls' in message ? message.tool_calls || [] : [];
          const combinedToolCalls = [...lastToolCalls, ...currentToolCalls];

          // 用组合数据更新最后一条消息
          (
            lastMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              content: string | null;
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).content = combinedContent || null;
          if (combinedToolCalls.length > 0) {
            (
              lastMessage as OpenAI.Chat.ChatCompletionMessageParam & {
                content: string | null;
                tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
              }
            ).tool_calls = combinedToolCalls;
          }

          continue; // 跳过添加当前消息，因为它已被合并
        }
      }

      // 如果不需要合并则原样添加消息
      merged.push(message);
    }

    return merged;
  }

  private convertToGeminiFormat(
    openaiResponse: ChatCompletion,
  ): GenerateContentResponse {
    const choice = openaiResponse.choices[0];
    const response = new GenerateContentResponse();

    const parts: Part[] = [];

    // 处理文本内容
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    // 处理工具调用
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function) {
          let args: Record<string, unknown> = {};
          if (toolCall.function.arguments) {
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch (error) {
              console.error('解析函数参数失败:', error);
              args = {};
            }
          }

          parts.push({
            functionCall: {
              id: toolCall.id,
              name: toolCall.function.name,
              args,
            },
          });
        }
      }
    }

    response.candidates = [
      {
        content: {
          parts,
          role: 'model' as const,
        },
        finishReason: this.mapFinishReason(choice.finish_reason || 'stop'),
        index: 0,
        safetyRatings: [],
      },
    ];

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    // 如果可用则添加使用量元数据
    if (openaiResponse.usage) {
      const usage = openaiResponse.usage as {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };

      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || 0;

      // 如果只有总 token 但没有细分，则估算分配
      // 通常输入约占 70%，输出约占 30%
      let finalPromptTokens = promptTokens;
      let finalCompletionTokens = completionTokens;

      if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
        // 估算：假设 70% 输入，30% 输出
        finalPromptTokens = Math.round(totalTokens * 0.7);
        finalCompletionTokens = Math.round(totalTokens * 0.3);
      }

      response.usageMetadata = {
        promptTokenCount: finalPromptTokens,
        candidatesTokenCount: finalCompletionTokens,
        totalTokenCount: totalTokens,
      };
    }

    return response;
  }

  private convertStreamChunkToGeminiFormat(
    chunk: ChatCompletionChunk,
  ): GenerateContentResponse {
    const choice = chunk.choices?.[0];
    const response = new GenerateContentResponse();

    if (choice) {
      const parts: Part[] = [];

      // 处理文本内容
      if (choice.delta?.content) {
        parts.push({ text: choice.delta.content });
      }

      // 处理工具调用 - 仅在流式传输期间累积，完成时发出
      if (choice.delta?.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          const index = toolCall.index ?? 0;

          // 获取或为此索引创建工具调用累加器
          let accumulatedCall = this.streamingToolCalls.get(index);
          if (!accumulatedCall) {
            accumulatedCall = { arguments: '' };
            this.streamingToolCalls.set(index, accumulatedCall);
          }

          // 更新累积数据
          if (toolCall.id) {
            accumulatedCall.id = toolCall.id;
          }
          if (toolCall.function?.name) {
            accumulatedCall.name = toolCall.function.name;
          }
          if (toolCall.function?.arguments) {
            accumulatedCall.arguments += toolCall.function.arguments;
          }
        }
      }

      // 仅在流式传输完成时发出函数调用（finish_reason 存在时）
      if (choice.finish_reason) {
        for (const [, accumulatedCall] of this.streamingToolCalls) {
          // TODO: 一旦我们有从 VLLM 解析器生成 tool_call_id 的方法就加回 id。
          // if (accumulatedCall.id && accumulatedCall.name) {
          if (accumulatedCall.name) {
            let args: Record<string, unknown> = {};
            if (accumulatedCall.arguments) {
              try {
                args = JSON.parse(accumulatedCall.arguments);
              } catch (error) {
                console.error(
                  '解析最终工具调用参数失败:',
                  error,
                );
              }
            }

            parts.push({
              functionCall: {
                id: accumulatedCall.id,
                name: accumulatedCall.name,
                args,
              },
            });
          }
        }
        // 清除所有累积的工具调用
        this.streamingToolCalls.clear();
      }

      response.candidates = [
        {
          content: {
            parts,
            role: 'model' as const,
          },
          finishReason: choice.finish_reason
            ? this.mapFinishReason(choice.finish_reason)
            : FinishReason.FINISH_REASON_UNSPECIFIED,
          index: 0,
          safetyRatings: [],
        },
      ];
    } else {
      response.candidates = [];
    }

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    // 如果块中有使用量元数据则添加
    if (chunk.usage) {
      const usage = chunk.usage as {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };

      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || 0;

      // 如果只有总 token 但没有细分，则估算分配
      // 通常输入约占 70%，输出约占 30%
      let finalPromptTokens = promptTokens;
      let finalCompletionTokens = completionTokens;

      if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
        // 估算：假设 70% 输入，30% 输出
        finalPromptTokens = Math.round(totalTokens * 0.7);
        finalCompletionTokens = Math.round(totalTokens * 0.3);
      }

      response.usageMetadata = {
        promptTokenCount: finalPromptTokens,
        candidatesTokenCount: finalCompletionTokens,
        totalTokenCount: totalTokens,
      };
    }

    return response;
  }

  /**
   * 构建采样参数，明确优先级：
   * 1. 配置级别的采样参数（最高优先级）
   * 2. 请求级别的参数（中等优先级）
   * 3. 默认值（最低优先级）
   */
  private buildSamplingParameters(
    request: GenerateContentParameters,
  ): Record<string, unknown> {
    const configSamplingParams =
      this.config.getContentGeneratorConfig()?.samplingParams;

    const params = {
      // 温度：配置 > 请求 > 默认
      temperature:
        configSamplingParams?.temperature !== undefined
          ? configSamplingParams.temperature
          : request.config?.temperature !== undefined
            ? request.config.temperature
            : 0.0,

      // 最大 token：配置 > 请求 > 未定义
      ...(configSamplingParams?.max_tokens !== undefined
        ? { max_tokens: configSamplingParams.max_tokens }
        : request.config?.maxOutputTokens !== undefined
          ? { max_tokens: request.config.maxOutputTokens }
          : {}),

      // Top-p：配置 > 请求 > 默认
      top_p:
        configSamplingParams?.top_p !== undefined
          ? configSamplingParams.top_p
          : request.config?.topP !== undefined
            ? request.config.topP
            : 1.0,

      // Top-k：仅配置（请求中不可用）
      ...(configSamplingParams?.top_k !== undefined
        ? { top_k: configSamplingParams.top_k }
        : {}),

      // 重复惩罚：仅配置
      ...(configSamplingParams?.repetition_penalty !== undefined
        ? { repetition_penalty: configSamplingParams.repetition_penalty }
        : {}),

      // 存在惩罚：仅配置
      ...(configSamplingParams?.presence_penalty !== undefined
        ? { presence_penalty: configSamplingParams.presence_penalty }
        : {}),

      // 频率惩罚：仅配置
      ...(configSamplingParams?.frequency_penalty !== undefined
        ? { frequency_penalty: configSamplingParams.frequency_penalty }
        : {}),
    };

    return params;
  }

  private mapFinishReason(openaiReason: string | null): FinishReason {
    if (!openaiReason) return FinishReason.FINISH_REASON_UNSPECIFIED;
    const mapping: Record<string, FinishReason> = {
      stop: FinishReason.STOP,
      length: FinishReason.MAX_TOKENS,
      content_filter: FinishReason.SAFETY,
      function_call: FinishReason.STOP,
      tool_calls: FinishReason.STOP,
    };
    return mapping[openaiReason] || FinishReason.FINISH_REASON_UNSPECIFIED;
  }

  /**
   * 将 Gemini 请求格式转换为 OpenAI 聊天完成格式用于记录
   */
  private async convertGeminiRequestToOpenAI(
    request: GenerateContentParameters,
  ): Promise<OpenAIRequestFormat> {
    const messages: OpenAIMessage[] = [];

    // 处理系统指令
    if (request.config?.systemInstruction) {
      const systemInstruction = request.config.systemInstruction;
      let systemText = '';

      if (Array.isArray(systemInstruction)) {
        systemText = systemInstruction
          .map((content) => {
            if (typeof content === 'string') return content;
            if ('parts' in content) {
              const contentObj = content as Content;
              return (
                contentObj.parts
                  ?.map((p: Part) =>
                    typeof p === 'string' ? p : 'text' in p ? p.text : '',
                  )
                  .join('\n') || ''
              );
            }
            return '';
          })
          .join('\n');
      } else if (typeof systemInstruction === 'string') {
        systemText = systemInstruction;
      } else if (
        typeof systemInstruction === 'object' &&
        'parts' in systemInstruction
      ) {
        const systemContent = systemInstruction as Content;
        systemText =
          systemContent.parts
            ?.map((p: Part) =>
              typeof p === 'string' ? p : 'text' in p ? p.text : '',
            )
            .join('\n') || '';
      }

      if (systemText) {
        messages.push({
          role: 'system',
          content: systemText,
        });
      }
    }

    // 处理内容
    if (Array.isArray(request.contents)) {
      for (const content of request.contents) {
        if (typeof content === 'string') {
          messages.push({ role: 'user', content });
        } else if ('role' in content && 'parts' in content) {
          const functionCalls: FunctionCall[] = [];
          const functionResponses: FunctionResponse[] = [];
          const textParts: string[] = [];

          for (const part of content.parts || []) {
            if (typeof part === 'string') {
              textParts.push(part);
            } else if ('text' in part && part.text) {
              textParts.push(part.text);
            } else if ('functionCall' in part && part.functionCall) {
              functionCalls.push(part.functionCall);
            } else if ('functionResponse' in part && part.functionResponse) {
              functionResponses.push(part.functionResponse);
            }
          }

          // 处理函数响应（工具结果）
          if (functionResponses.length > 0) {
            for (const funcResponse of functionResponses) {
              messages.push({
                role: 'tool',
                tool_call_id: funcResponse.id || '',
                content:
                  typeof funcResponse.response === 'string'
                    ? funcResponse.response
                    : JSON.stringify(funcResponse.response),
              });
            }
          }
          // 处理带函数调用的模型消息
          else if (content.role === 'model' && functionCalls.length > 0) {
            const toolCalls = functionCalls.map((fc, index) => ({
              id: fc.id || `call_${index}`,
              type: 'function' as const,
              function: {
                name: fc.name || '',
                arguments: JSON.stringify(fc.args || {}),
              },
            }));

            messages.push({
              role: 'assistant',
              content: textParts.join('\n') || null,
              tool_calls: toolCalls,
            });
          }
          // 处理常规文本消息
          else {
            const role = content.role === 'model' ? 'assistant' : 'user';
            const text = textParts.join('\n');
            if (text) {
              messages.push({ role, content: text });
            }
          }
        }
      }
    } else if (request.contents) {
      if (typeof request.contents === 'string') {
        messages.push({ role: 'user', content: request.contents });
      } else if ('role' in request.contents && 'parts' in request.contents) {
        const content = request.contents;
        const role = content.role === 'model' ? 'assistant' : 'user';
        const text =
          content.parts
            ?.map((p: Part) =>
              typeof p === 'string' ? p : 'text' in p ? p.text : '',
            )
            .join('\n') || '';
        messages.push({ role, content: text });
      }
    }

    // 清理孤立的工具调用并合并连续的助手消息
    const cleanedMessages = this.cleanOrphanedToolCallsForLogging(messages);
    const mergedMessages =
      this.mergeConsecutiveAssistantMessagesForLogging(cleanedMessages);

    const openaiRequest: OpenAIRequestFormat = {
      model: this.model,
      messages: mergedMessages,
    };

    // 使用与实际 API 调用相同的逻辑添加采样参数
    const samplingParams = this.buildSamplingParameters(request);
    Object.assign(openaiRequest, samplingParams);

    // 如果存在则转换工具
    if (request.config?.tools) {
      openaiRequest.tools = await this.convertGeminiToolsToOpenAI(
        request.config.tools,
      );
    }

    return openaiRequest;
  }

  /**
   * 清理用于记录目的的孤立工具调用
   */
  private cleanOrphanedToolCallsForLogging(
    messages: OpenAIMessage[],
  ): OpenAIMessage[] {
    const cleaned: OpenAIMessage[] = [];
    const toolCallIds = new Set<string>();
    const toolResponseIds = new Set<string>();

    // 第一遍：收集所有工具调用 ID 和工具响应 ID
    for (const message of messages) {
      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            toolCallIds.add(toolCall.id);
          }
        }
      } else if (message.role === 'tool' && message.tool_call_id) {
        toolResponseIds.add(message.tool_call_id);
      }
    }

    // 第二遍：过滤孤立消息
    for (const message of messages) {
      if (message.role === 'assistant' && message.tool_calls) {
        // 过滤出没有相应响应的工具调用
        const validToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && toolResponseIds.has(toolCall.id),
        );

        if (validToolCalls.length > 0) {
          // 保留消息但仅保留有效的工具调用
          const cleanedMessage = { ...message };
          cleanedMessage.tool_calls = validToolCalls;
          cleaned.push(cleanedMessage);
        } else if (
          typeof message.content === 'string' &&
          message.content.trim()
        ) {
          // 如果有文本内容则保留消息，但移除工具调用
          const cleanedMessage = { ...message };
          delete cleanedMessage.tool_calls;
          cleaned.push(cleanedMessage);
        }
        // 如果没有有效的工具调用且没有内容，则完全跳过该消息
      } else if (message.role === 'tool' && message.tool_call_id) {
        // 只保留有相应工具调用的工具响应
        if (toolCallIds.has(message.tool_call_id)) {
          cleaned.push(message);
        }
      } else {
        // 原样保留所有其他消息
        cleaned.push(message);
      }
    }

    // 最终验证：确保每个带 tool_calls 的助手消息都有相应的工具响应
    const finalCleaned: OpenAIMessage[] = [];
    const finalToolCallIds = new Set<string>();

    // 收集所有剩余的工具调用 ID
    for (const message of cleaned) {
      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            finalToolCallIds.add(toolCall.id);
          }
        }
      }
    }

    // 验证所有工具调用都有响应
    const finalToolResponseIds = new Set<string>();
    for (const message of cleaned) {
      if (message.role === 'tool' && message.tool_call_id) {
        finalToolResponseIds.add(message.tool_call_id);
      }
    }

    // 移除任何剩余的孤立工具调用
    for (const message of cleaned) {
      if (message.role === 'assistant' && message.tool_calls) {
        const finalValidToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && finalToolResponseIds.has(toolCall.id),
        );

        if (finalValidToolCalls.length > 0) {
          const cleanedMessage = { ...message };
          cleanedMessage.tool_calls = finalValidToolCalls;
          finalCleaned.push(cleanedMessage);
        } else if (
          typeof message.content === 'string' &&
          message.content.trim()
        ) {
          const cleanedMessage = { ...message };
          delete cleanedMessage.tool_calls;
          finalCleaned.push(cleanedMessage);
        }
      } else {
        finalCleaned.push(message);
      }
    }

    return finalCleaned;
  }

  /**
   * 合并连续的助手消息以组合分割的文本和工具调用用于记录
   */
  private mergeConsecutiveAssistantMessagesForLogging(
    messages: OpenAIMessage[],
  ): OpenAIMessage[] {
    const merged: OpenAIMessage[] = [];

    for (const message of messages) {
      if (message.role === 'assistant' && merged.length > 0) {
        const lastMessage = merged[merged.length - 1];

        // 如果最后一条消息也是助手消息，则合并它们
        if (lastMessage.role === 'assistant') {
          // 组合内容
          const combinedContent = [
            lastMessage.content || '',
            message.content || '',
          ]
            .filter(Boolean)
            .join('');

          // 组合工具调用
          const combinedToolCalls = [
            ...(lastMessage.tool_calls || []),
            ...(message.tool_calls || []),
          ];

          // 用组合数据更新最后一条消息
          lastMessage.content = combinedContent || null;
          if (combinedToolCalls.length > 0) {
            lastMessage.tool_calls = combinedToolCalls;
          }

          continue; // 跳过添加当前消息，因为它已被合并
        }
      }

      // 如果不需要合并则原样添加消息
      merged.push(message);
    }

    return merged;
  }

  /**
   * 将 Gemini 响应格式转换为 OpenAI 聊天完成格式用于记录
   */
  private convertGeminiResponseToOpenAI(
    response: GenerateContentResponse,
  ): OpenAIResponseFormat {
    const candidate = response.candidates?.[0];
    const content = candidate?.content;

    let messageContent: string | null = null;
    const toolCalls: OpenAIToolCall[] = [];

    if (content?.parts) {
      const textParts: string[] = [];

      for (const part of content.parts) {
        if ('text' in part && part.text) {
          textParts.push(part.text);
        } else if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id || `call_${toolCalls.length}`,
            type: 'function' as const,
            function: {
              name: part.functionCall.name || '',
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }
      }

      messageContent = textParts.join('');
    }

    const choice: OpenAIChoice = {
      index: 0,
      message: {
        role: 'assistant',
        content: messageContent,
      },
      finish_reason: this.mapGeminiFinishReasonToOpenAI(
        candidate?.finishReason,
      ),
    };

    if (toolCalls.length > 0) {
      choice.message.tool_calls = toolCalls;
    }

    const openaiResponse: OpenAIResponseFormat = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [choice],
    };

    // 如果可用则添加使用量元数据
    if (response.usageMetadata) {
      openaiResponse.usage = {
        prompt_tokens: response.usageMetadata.promptTokenCount || 0,
        completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata.totalTokenCount || 0,
      };
    }

    return openaiResponse;
  }

  /**
   * 将 Gemini 完成原因映射到 OpenAI 完成原因
   */
  private mapGeminiFinishReasonToOpenAI(geminiReason?: unknown): string {
    if (!geminiReason) return 'stop';

    switch (geminiReason) {
      case 'STOP':
      case 1: // FinishReason.STOP
        return 'stop';
      case 'MAX_TOKENS':
      case 2: // FinishReason.MAX_TOKENS
        return 'length';
      case 'SAFETY':
      case 3: // FinishReason.SAFETY
        return 'content_filter';
      case 'RECITATION':
      case 4: // FinishReason.RECITATION
        return 'content_filter';
      case 'OTHER':
      case 5: // FinishReason.OTHER
        return 'stop';
      default:
        return 'stop';
    }
  }
}