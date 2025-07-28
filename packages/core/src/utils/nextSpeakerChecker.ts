/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, SchemaUnion, Type } from '@google/genai';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { GeminiClient } from '../core/client.js';
import { GeminiChat } from '../core/geminiChat.js';
import { isFunctionResponse } from './messageInspectors.js';

const CHECK_PROMPT = `分析*仅*你紧接在前的响应的内容和结构（你在对话历史中的上一个回合）。基于*严格*该响应，确定逻辑上应该由谁接下来发言：'user'（用户）还是'model'（你）。
**决策规则（按顺序应用）：**
1.  **模型继续：** 如果你的上一个响应明确说明了*你*打算立即采取的下一个行动（例如："接下来，我将..."，"现在我将处理..."，"继续分析..."，表示一个未执行的预期工具调用），或者响应明显不完整（在没有自然结论的情况下中途被截断），则应由**'model'**发言。
2.  **向用户提问：** 如果你的上一个响应以一个直接针对*用户*的具体问题结束，则应由**'user'**发言。
3.  **等待用户：** 如果你的上一个响应完成了一个想法、陈述或任务*并且*不满足规则1（模型继续）或规则2（向用户提问）的条件，则意味着暂停以期待用户输入或反应。在这种情况下，应由**'user'**发言。
**输出格式：**
*仅*按照以下模式以JSON格式响应。不要在JSON结构之外包含任何文本。
\`\`\`json
{
  "type": "object",
  "properties": {
    "reasoning": {
        "type": "string",
        "description": "基于适用规则和前一个回合的内容/结构，简要说明选择'next_speaker'的理由。"
    },
    "next_speaker": {
      "type": "string",
      "enum": ["user", "model"],
      "description": "基于前一个回合和决策规则，确定应该由谁发言。"
    }
  },
  "required": ["next_speaker", "reasoning"]
}
\`\`\`
`;

const RESPONSE_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description:
        "基于适用规则和前一个回合的内容/结构，简要说明选择'next_speaker'的理由。",
    },
    next_speaker: {
      type: Type.STRING,
      enum: ['user', 'model'],
      description:
        '基于前一个回合和决策规则，确定应该由谁发言',
    },
  },
  required: ['reasoning', 'next_speaker'],
};

export interface NextSpeakerResponse {
  reasoning: string;
  next_speaker: 'user' | 'model';
}

export async function checkNextSpeaker(
  chat: GeminiChat,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
): Promise<NextSpeakerResponse | null> {
  // 我们需要捕获经过筛选的历史记录，因为有很多时候模型会返回无效的回合
  // 如果将这些回合传回端点，将会破坏后续调用。例如，当模型决定
  // 以空部分集合响应时，如果你将该消息发送回服务器，它会响应
  // 400错误，表明模型部分集合必须包含内容。
  const curatedHistory = chat.getHistory(/* curated */ true);

  // 确保有待分析的模型响应
  if (curatedHistory.length === 0) {
    // 如果历史记录为空，则无法确定下一个发言者。
    return null;
  }

  const comprehensiveHistory = chat.getHistory();
  // 如果完整历史记录为空，则没有最后一条消息可检查。
  // 这种情况理想情况下应由前面的curatedHistory.length检查捕获，
  // 但作为安全措施：
  if (comprehensiveHistory.length === 0) {
    return null;
  }
  const lastComprehensiveMessage =
    comprehensiveHistory[comprehensiveHistory.length - 1];

  // 如果最后一条消息是仅包含function_responses的用户消息，
  // 则模型应该接下来发言。
  if (
    lastComprehensiveMessage &&
    isFunctionResponse(lastComprehensiveMessage)
  ) {
    return {
      reasoning:
        '最后一条消息是函数响应，因此模型应该接下来发言。',
      next_speaker: 'model',
    };
  }

  if (
    lastComprehensiveMessage &&
    lastComprehensiveMessage.role === 'model' &&
    lastComprehensiveMessage.parts &&
    lastComprehensiveMessage.parts.length === 0
  ) {
    lastComprehensiveMessage.parts.push({ text: '' });
    return {
      reasoning:
        '最后一条消息是一个没有内容的填充模型消息（用户无法对此采取行动），模型应该接下来发言。',
      next_speaker: 'model',
    };
  }

  // 检查通过。让我们继续可能进行LLM请求。

  const lastMessage = curatedHistory[curatedHistory.length - 1];
  if (!lastMessage || lastMessage.role !== 'model') {
    // 如果最后一个回合不是来自模型
    // 或者历史记录为空，则无法确定下一个发言者。
    return null;
  }

  const contents: Content[] = [
    ...curatedHistory,
    { role: 'user', parts: [{ text: CHECK_PROMPT }] },
  ];

  try {
    const parsedResponse = (await geminiClient.generateJson(
      contents,
      RESPONSE_SCHEMA,
      abortSignal,
      DEFAULT_GEMINI_FLASH_MODEL,
    )) as unknown as NextSpeakerResponse;

    if (
      parsedResponse &&
      parsedResponse.next_speaker &&
      ['user', 'model'].includes(parsedResponse.next_speaker)
    ) {
      return parsedResponse;
    }
    return null;
  } catch (error) {
    console.warn(
      '在检查对话是否应继续时，与Gemini端点通信失败。',
      error,
    );
    return null;
  }
}