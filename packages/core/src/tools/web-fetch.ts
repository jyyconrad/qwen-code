/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SchemaValidator } from '../utils/schemaValidator.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { Type } from '@google/genai';
import { getErrorMessage } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { fetchWithTimeout, isPrivateIp } from '../utils/fetch.js';
import { convert } from 'html-to-text';

const URL_FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 50000;

// 从字符串中提取 URL 的辅助函数
function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

// 接地元数据接口（类似于 web-search.ts）
interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string;
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
}

/**
 * WebFetch 工具的参数
 */
export interface WebFetchToolParams {
  /**
   * 包含 URL（最多 20 个）和处理其内容指令的提示。
   */
  prompt: string;
}

/**
 * WebFetch 工具逻辑的实现
 */
export class WebFetchTool extends BaseTool<WebFetchToolParams, ToolResult> {
  static readonly Name: string = 'web_fetch';

  constructor(private readonly config: Config) {
    super(
      WebFetchTool.Name,
      'WebFetch',
      "处理提示中嵌入的 URL 内容，包括本地和私有网络地址（例如 localhost）。在 'prompt' 参数中直接包含最多 20 个 URL 和指令（例如总结、提取特定数据）。",
      {
        properties: {
          prompt: {
            description:
              '一个综合提示，包含要获取的 URL（最多 20 个）以及如何处理其内容的具体指令（例如，"总结 https://example.com/article 并从 https://another.com/data 提取要点"）。必须包含至少一个以 http:// 或 https:// 开头的 URL。',
            type: Type.STRING,
          },
        },
        required: ['prompt'],
        type: Type.OBJECT,
      },
    );
  }

  private async executeFallback(
    params: WebFetchToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const urls = extractUrls(params.prompt);
    if (urls.length === 0) {
      return {
        llmContent: '错误：在提示中未找到用于回退的 URL。',
        returnDisplay: '错误：在提示中未找到用于回退的 URL。',
      };
    }

    const results: string[] = [];
    const processedUrls: string[] = [];

    // 处理多个 URL（根据描述最多 20 个）
    const urlsToProcess = urls.slice(0, 20);

    for (const originalUrl of urlsToProcess) {
      let url = originalUrl;

      // 将 GitHub blob URL 转换为原始 URL
      if (url.includes('github.com') && url.includes('/blob/')) {
        url = url
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }

      try {
        const response = await fetchWithTimeout(url, URL_FETCH_TIMEOUT_MS);
        if (!response.ok) {
          throw new Error(
            `请求失败，状态码 ${response.status} ${response.statusText}`,
          );
        }
        const html = await response.text();
        const textContent = convert(html, {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' },
          ],
        }).substring(0, MAX_CONTENT_LENGTH);

        results.push(`来自 ${url} 的内容:\n${textContent}`);
        processedUrls.push(url);
      } catch (e) {
        const error = e as Error;
        results.push(`获取 ${url} 时出错: ${error.message}`);
        processedUrls.push(url);
      }
    }

    try {
      const geminiClient = this.config.getGeminiClient();
      const combinedContent = results.join('\n\n---\n\n');

      // 确保总提示长度不超过限制
      const maxPromptLength = 200000; // 为系统指令留出空间
      const promptPrefix = `用户请求如下: "${params.prompt}".

我已从以下 URL 获取了内容。请使用这些内容回答用户的请求。请勿再次尝试访问这些 URL。

`;

      let finalContent = combinedContent;
      if (promptPrefix.length + combinedContent.length > maxPromptLength) {
        const availableLength = maxPromptLength - promptPrefix.length - 100; // 留出一些缓冲
        finalContent =
          combinedContent.substring(0, availableLength) +
          '\n\n[内容因长度限制被截断]';
      }

      const fallbackPrompt = promptPrefix + finalContent;

      const result = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
        {},
        signal,
      );
      const resultText = getResponseText(result) || '';
      return {
        llmContent: resultText,
        returnDisplay: `已使用回退获取处理了 ${processedUrls.length} 个 URL 的内容。`,
      };
    } catch (e) {
      const error = e as Error;
      const errorMessage = `回退处理过程中出错: ${error.message}`;
      return {
        llmContent: `错误: ${errorMessage}`,
        returnDisplay: `错误: ${errorMessage}`,
      };
    }
  }

  validateParams(params: WebFetchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    if (!params.prompt || params.prompt.trim() === '') {
      return "'prompt' 参数不能为空，且必须包含 URL 和指令。";
    }
    if (
      !params.prompt.includes('http://') &&
      !params.prompt.includes('https://')
    ) {
      return "'prompt' 必须包含至少一个有效的 URL（以 http:// 或 https:// 开头）。";
    }
    return null;
  }

  getDescription(params: WebFetchToolParams): string {
    const displayPrompt =
      params.prompt.length > 100
        ? params.prompt.substring(0, 97) + '...'
        : params.prompt;
    return `正在处理提示中的 URL 和指令: "${displayPrompt}"`;
  }

  async shouldConfirmExecute(
    params: WebFetchToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateParams(params);
    if (validationError) {
      return false;
    }

    // 在此处执行 GitHub URL 转换，以区分用户提供的 URL 和实际要获取的 URL。
    const urls = extractUrls(params.prompt).map((url) => {
      if (url.includes('github.com') && url.includes('/blob/')) {
        return url
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }
      return url;
    });

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: `确认 Web 获取`,
      prompt: params.prompt,
      urls,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: WebFetchToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `错误: 提供的参数无效。原因: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const userPrompt = params.prompt;
    const urls = extractUrls(userPrompt);
    const url = urls[0];
    const isPrivate = isPrivateIp(url);

    if (isPrivate) {
      return this.executeFallback(params, signal);
    }

    const geminiClient = this.config.getGeminiClient();
    const contentGenerator = geminiClient.getContentGenerator();

    // 检查是否使用 OpenAI 内容生成器 - 如果是，则使用回退
    if (contentGenerator.constructor.name === 'OpenAIContentGenerator') {
      return this.executeFallback(params, signal);
    }

    try {
      const response = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: userPrompt }] }],
        { tools: [{ urlContext: {} }] },
        signal, // 传递信号
      );

      console.debug(
        `[WebFetchTool] 提示 "${userPrompt.substring(
          0,
          50,
        )}..." 的完整响应:`,
        JSON.stringify(response, null, 2),
      );

      let responseText = getResponseText(response) || '';
      const urlContextMeta = response.candidates?.[0]?.urlContextMetadata;
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks as
        | GroundingChunkItem[]
        | undefined;
      const groundingSupports = groundingMetadata?.groundingSupports as
        | GroundingSupportItem[]
        | undefined;

      // 错误处理
      let processingError = false;

      if (
        urlContextMeta?.urlMetadata &&
        urlContextMeta.urlMetadata.length > 0
      ) {
        const allStatuses = urlContextMeta.urlMetadata.map(
          (m) => m.urlRetrievalStatus,
        );
        if (allStatuses.every((s) => s !== 'URL_RETRIEVAL_STATUS_SUCCESS')) {
          processingError = true;
        }
      } else if (!responseText.trim() && !sources?.length) {
        // 没有 URL 元数据且没有内容/来源
        processingError = true;
      }

      if (
        !processingError &&
        !responseText.trim() &&
        (!sources || sources.length === 0)
      ) {
        // 成功获取了一些 URL（或 urlContextMeta 中没有特定错误），但没有可用的文本或接地数据。
        processingError = true;
      }

      if (processingError) {
        return this.executeFallback(params, signal);
      }

      const sourceListFormatted: string[] = [];
      if (sources && sources.length > 0) {
        sources.forEach((source: GroundingChunkItem, index: number) => {
          const title = source.web?.title || '无标题';
          const uri = source.web?.uri || '未知 URI'; // 如果 URI 缺失则回退
          sourceListFormatted.push(`[${index + 1}] ${title} (${uri})`);
        });

        if (groundingSupports && groundingSupports.length > 0) {
          const insertions: Array<{ index: number; marker: string }> = [];
          groundingSupports.forEach((support: GroundingSupportItem) => {
            if (support.segment && support.groundingChunkIndices) {
              const citationMarker = support.groundingChunkIndices
                .map((chunkIndex: number) => `[${chunkIndex + 1}]`)
                .join('');
              insertions.push({
                index: support.segment.endIndex,
                marker: citationMarker,
              });
            }
          });

          insertions.sort((a, b) => b.index - a.index);
          const responseChars = responseText.split('');
          insertions.forEach((insertion) => {
            responseChars.splice(insertion.index, 0, insertion.marker);
          });
          responseText = responseChars.join('');
        }

        if (sourceListFormatted.length > 0) {
          responseText += `

来源:
${sourceListFormatted.join('\n')}`;
        }
      }

      const llmContent = responseText;

      console.debug(
        `[WebFetchTool] 提示 "${userPrompt}:\n\n" 的格式化工具响应:`,
        llmContent,
      );

      return {
        llmContent,
        returnDisplay: `已处理提示中的内容。`,
      };
    } catch (error: unknown) {
      const errorMessage = `处理提示 "${userPrompt.substring(
        0,
        50,
      )}..." 的网页内容时出错: ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `错误: ${errorMessage}`,
        returnDisplay: `错误: ${errorMessage}`,
      };
    }
  }
}