/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 孤立工具调用清理的测试用例
 */

export const createTestMessages = () => [
  // 系统消息
  {
    role: 'system' as const,
    content: 'You are a helpful assistant.',
  },
  // 用户消息
  {
    role: 'user' as const,
    content: 'Please use a tool to help me.',
  },
  // 包含工具调用的助手消息（部分将被孤立）
  {
    role: 'assistant' as const,
    content: 'I will help you with that.',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function' as const,
        function: {
          name: 'search_web',
          arguments: '{"query": "test"}',
        },
      },
      {
        id: 'call_2',
        type: 'function' as const,
        function: {
          name: 'calculate',
          arguments: '{"expression": "2+2"}',
        },
      },
      {
        id: 'call_3', // 这将被孤立
        type: 'function' as const,
        function: {
          name: 'send_email',
          arguments: '{"to": "test@example.com"}',
        },
      },
    ],
  },
  // call_1 的工具响应
  {
    role: 'tool' as const,
    tool_call_id: 'call_1',
    content: 'Search results: Found relevant information.',
  },
  // call_2 的工具响应
  {
    role: 'tool' as const,
    tool_call_id: 'call_2',
    content: 'Calculation result: 4',
  },
  // 注意：没有 call_3 的工具响应（这造成了孤立工具调用问题）

  // 用户继续对话
  {
    role: 'user' as const,
    content: 'Thank you, that was helpful.',
  },
];

export const expectedCleanedMessages = () => [
  // 系统消息（未更改）
  {
    role: 'system' as const,
    content: 'You are a helpful assistant.',
  },
  // 用户消息（未更改）
  {
    role: 'user' as const,
    content: 'Please use a tool to help me.',
  },
  // 仅包含有效工具调用的助手消息
  {
    role: 'assistant' as const,
    content: 'I will help you with that.',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function' as const,
        function: {
          name: 'search_web',
          arguments: '{"query": "test"}',
        },
      },
      {
        id: 'call_2',
        type: 'function' as const,
        function: {
          name: 'calculate',
          arguments: '{"expression": "2+2"}',
        },
      },
      // call_3 已移除，因为它没有响应
    ],
  },
  // 工具响应（未更改，因为它们有对应的调用）
  {
    role: 'tool' as const,
    tool_call_id: 'call_1',
    content: 'Search results: Found relevant information.',
  },
  {
    role: 'tool' as const,
    tool_call_id: 'call_2',
    content: 'Calculation result: 4',
  },
  // 用户消息（未更改）
  {
    role: 'user' as const,
    content: 'Thank you, that was helpful.',
  },
];