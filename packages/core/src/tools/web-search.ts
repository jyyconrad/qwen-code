/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroundingMetadata } from '@google/genai';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';

import { getErrorMessage } from '../utils/errors.js';
import { Config } from '../config/config.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
  // 其他属性可能在未来需要时存在
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string; // 根据示例，text 是可选的
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
  confidenceScores?: number[]; // 根据示例是可选的
}

/**
 * WebSearchTool 的参数。
 */
export interface WebSearchToolParams {
  /**
   * 搜索查询。
   */

  query: string;
}

/**
 * 扩展 ToolResult 以包含网络搜索的来源。
 */
export interface WebSearchToolResult extends ToolResult {
  sources?: GroundingMetadata extends { groundingChunks: GroundingChunkItem[] }
    ? GroundingMetadata['groundingChunks']
    : GroundingChunkItem[];
}

/**
 * 一个通过 Gemini API 使用 Google 搜索执行网络搜索的工具。
 */
export class WebSearchTool extends BaseTool<
  WebSearchToolParams,
  WebSearchToolResult
> {
  static readonly Name: string = 'google_web_search';

  constructor(private readonly config: Config) {
    super(
      WebSearchTool.Name,
      'GoogleSearch',
      '使用 Google 搜索（通过 Gemini API）执行网络搜索并返回结果。此工具适用于基于查询在互联网上查找信息。',
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: '用于在网页上查找信息的搜索查询。',
          },
        },
        required: ['query'],
      },
    );
  }

  /**
   * 验证 WebSearchTool 的参数。
   * @param params 要验证的参数
   * @returns 如果验证失败则返回错误消息字符串，如果有效则返回 null
   */
  validateParams(params: WebSearchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!params.query || params.query.trim() === '') {
      return "'query' 参数不能为空。";
    }
    return null;
  }

  getDescription(params: WebSearchToolParams): string {
    return `正在网络上搜索："${params.query}"`;
  }

  async execute(
    params: WebSearchToolParams,
    signal: AbortSignal,
  ): Promise<WebSearchToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `错误：提供了无效的参数。原因：${validationError}`,
        returnDisplay: validationError,
      };
    }
    const geminiClient = this.config.getGeminiClient();

    try {
      const response = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: params.query }] }],
        { tools: [{ googleSearch: {} }] },
        signal,
      );

      const responseText = getResponseText(response);
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks as
        | GroundingChunkItem[]
        | undefined;
      const groundingSupports = groundingMetadata?.groundingSupports as
        | GroundingSupportItem[]
        | undefined;

      if (!responseText || !responseText.trim()) {
        return {
          llmContent: `未找到查询 "${params.query}" 的搜索结果或信息`,
          returnDisplay: '未找到信息。',
        };
      }

      let modifiedResponseText = responseText;
      const sourceListFormatted: string[] = [];

      if (sources && sources.length > 0) {
        sources.forEach((source: GroundingChunkItem, index: number) => {
          const title = source.web?.title || '无标题';
          const uri = source.web?.uri || '无 URI';
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

          // 按索引降序排序插入，以避免后续索引偏移
          insertions.sort((a, b) => b.index - a.index);

          const responseChars = modifiedResponseText.split(''); // 使用新变量
          insertions.forEach((insertion) => {
            // 修复箭头函数语法
            responseChars.splice(insertion.index, 0, insertion.marker);
          });
          modifiedResponseText = responseChars.join(''); // 重新赋值给 modifiedResponseText
        }

        if (sourceListFormatted.length > 0) {
          modifiedResponseText +=
            '\n\n来源：\n' + sourceListFormatted.join('\n'); // 修复字符串连接
        }
      }

      return {
        llmContent: `"${params.query}" 的网络搜索结果：\n\n${modifiedResponseText}`,
        returnDisplay: `"${params.query}" 的搜索结果已返回。`,
        sources,
      };
    } catch (error: unknown) {
      const errorMessage = `查询 "${params.query}" 的网络搜索期间出错：${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `错误：${errorMessage}`,
        returnDisplay: `执行网络搜索时出错。`,
      };
    }
  }
}