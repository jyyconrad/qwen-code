/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolResult } from '../tools/tools.js';
import {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
} from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { PartListUnion } from '@google/genai';

/**
 * 用于总结工具执行结果的函数。
 *
 * @param result 工具执行的结果。
 * @returns 结果的摘要。
 */
export type Summarizer = (
  result: ToolResult,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
) => Promise<string>;

/**
 * 工具结果的默认摘要器。
 *
 * @param result 工具执行的结果。
 * @param geminiClient 用于摘要的 Gemini 客户端。
 * @param abortSignal 用于摘要的中止信号。
 * @returns 结果的摘要。
 */
export const defaultSummarizer: Summarizer = (
  result: ToolResult,
  _geminiClient: GeminiClient,
  _abortSignal: AbortSignal,
) => Promise.resolve(JSON.stringify(result.llmContent));

// TODO: 将这两个函数移到 utils 中
function partToString(part: PartListUnion): string {
  if (!part) {
    return '';
  }
  if (typeof part === 'string') {
    return part;
  }
  if (Array.isArray(part)) {
    return part.map(partToString).join('');
  }
  if ('text' in part) {
    return part.text ?? '';
  }
  return '';
}

function getResponseText(response: GenerateContentResponse): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

const toolOutputSummarizerModel = DEFAULT_GEMINI_FLASH_MODEL;
const toolOutputSummarizerConfig: GenerateContentConfig = {
  maxOutputTokens: 2000,
};

const SUMMARIZE_TOOL_OUTPUT_PROMPT = `将以下工具输出总结为最多 {maxLength} 个字符。摘要应简洁并捕捉工具输出的主要要点。

摘要应基于提供的内容进行。以下是需要遵循的基本规则：
1. 如果文本是目录列表或任何结构性输出，请使用对话历史来理解上下文。使用此上下文尝试理解我们需要从工具输出中获取什么信息，并将其作为响应返回。
2. 如果文本是文本内容且我们不需要任何结构性内容，请总结文本。
3. 如果文本是 shell 命令的输出，请使用对话历史来理解上下文。使用此上下文尝试理解我们需要从工具输出中获取什么信息，并返回一个摘要以及 <error></error> 标签内的任何错误的完整堆栈跟踪。堆栈跟踪应该是完整的，不能被截断。如果有警告，您应该在摘要中包含它们，并用 <warning></warning> 标签标记。


需要总结的文本：
"{textToSummarize}"

返回摘要字符串，该字符串应首先包含文本的整体摘要，然后是工具输出中错误和警告的完整堆栈跟踪。
`;

export const llmSummarizer: Summarizer = (result, geminiClient, abortSignal) =>
  summarizeToolOutput(
    partToString(result.llmContent),
    geminiClient,
    abortSignal,
  );

export async function summarizeToolOutput(
  textToSummarize: string,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
  maxLength: number = 2000,
): Promise<string> {
  if (!textToSummarize || textToSummarize.length < maxLength) {
    return textToSummarize;
  }
  const prompt = SUMMARIZE_TOOL_OUTPUT_PROMPT.replace(
    '{maxLength}',
    String(maxLength),
  ).replace('{textToSummarize}', textToSummarize);

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const parsedResponse = (await geminiClient.generateContent(
      contents,
      toolOutputSummarizerConfig,
      abortSignal,
      toolOutputSummarizerModel,
    )) as unknown as GenerateContentResponse;
    return getResponseText(parsedResponse) || textToSummarize;
  } catch (error) {
    console.error('无法总结工具输出。', error);
    return textToSummarize;
  }
}