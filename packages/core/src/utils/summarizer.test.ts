/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import {
  summarizeToolOutput,
  llmSummarizer,
  defaultSummarizer,
} from './summarizer.js';
import { ToolResult } from '../tools/tools.js';

// 模拟 GeminiClient 和 Config 构造函数
vi.mock('../core/client.js');
vi.mock('../config/config.js');

describe('summarizers', () => {
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
    (mockGeminiClient.generateContent as Mock) = vi.fn();

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    (console.error as Mock).mockRestore();
  });

  describe('summarizeToolOutput', () => {
    it('如果文本长度小于 maxLength，应返回原始文本', async () => {
      const shortText = 'This is a short text.';
      const result = await summarizeToolOutput(
        shortText,
        mockGeminiClient,
        abortSignal,
        2000,
      );
      expect(result).toBe(shortText);
      expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
    });

    it('如果文本为空，应返回原始文本', async () => {
      const emptyText = '';
      const result = await summarizeToolOutput(
        emptyText,
        mockGeminiClient,
        abortSignal,
        2000,
      );
      expect(result).toBe(emptyText);
      expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
    });

    it('如果文本长度超过 maxLength，应调用 generateContent', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const summary = 'This is a summary.';
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      const result = await summarizeToolOutput(
        longText,
        mockGeminiClient,
        abortSignal,
        2000,
      );

      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);
      expect(result).toBe(summary);
    });

    it('如果 generateContent 抛出错误，应返回原始文本', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const error = new Error('API Error');
      (mockGeminiClient.generateContent as Mock).mockRejectedValue(error);

      const result = await summarizeToolOutput(
        longText,
        mockGeminiClient,
        abortSignal,
        2000,
      );

      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);
      expect(result).toBe(longText);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to summarize tool output.',
        error,
      );
    });

    it('应构造正确的摘要提示', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const summary = 'This is a summary.';
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      await summarizeToolOutput(longText, mockGeminiClient, abortSignal, 1000);

      const expectedPrompt = `Summarize the following tool output to be a maximum of 1000 characters. The summary should be concise and capture the main points of the tool output.

The summarization should be done based on the content that is provided. Here are the basic rules to follow:
1. If the text is a directory listing or any output that is structural, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return that as a response.
2. If the text is text content and there is nothing structural that we need, summarize the text.
3. If the text is the output of a shell command, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return a summarization along with the stack trace of any error within the <error></error> tags. The stack trace should be complete and not truncated. If there are warnings, you should include them in the summary within <warning></warning> tags.


Text to summarize:
"${longText}"

Return the summary string which should first contain an overall summarization of text followed by the full stack trace of errors and warnings in the tool output.
`;
      const calledWith = (mockGeminiClient.generateContent as Mock).mock
        .calls[0];
      const contents = calledWith[0];
      expect(contents[0].parts[0].text).toBe(expectedPrompt);
    });
  });

  describe('llmSummarizer', () => {
    it('应使用 summarizeToolOutput 摘要工具输出', async () => {
      const toolResult: ToolResult = {
        llmContent: 'This is a very long text.'.repeat(200),
        returnDisplay: '',
      };
      const summary = 'This is a summary.';
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      const result = await llmSummarizer(
        toolResult,
        mockGeminiClient,
        abortSignal,
      );

      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);
      expect(result).toBe(summary);
    });

    it('应处理不同的 llmContent 类型', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const toolResult: ToolResult = {
        llmContent: [{ text: longText }],
        returnDisplay: '',
      };
      const summary = 'This is a summary.';
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      const result = await llmSummarizer(
        toolResult,
        mockGeminiClient,
        abortSignal,
      );

      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);
      const calledWith = (mockGeminiClient.generateContent as Mock).mock
        .calls[0];
      const contents = calledWith[0];
      expect(contents[0].parts[0].text).toContain(`"${longText}"`);
      expect(result).toBe(summary);
    });
  });

  describe('defaultSummarizer', () => {
    it('应将 llmContent 字符串化', async () => {
      const toolResult: ToolResult = {
        llmContent: { text: 'some data' },
        returnDisplay: '',
      };

      const result = await defaultSummarizer(
        toolResult,
        mockGeminiClient,
        abortSignal,
      );

      expect(result).toBe(JSON.stringify({ text: 'some data' }));
      expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
    });
  });
});