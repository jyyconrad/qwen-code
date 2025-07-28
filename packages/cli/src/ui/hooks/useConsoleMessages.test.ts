/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { useConsoleMessages } from './useConsoleMessages.js';
import { ConsoleMessageItem } from '../types.js';

// 模拟 setTimeout 和 clearTimeout
vi.useFakeTimers();

describe('useConsoleMessages', () => {
  it('应初始化为空的控制台消息数组', () => {
    const { result } = renderHook(() => useConsoleMessages());
    expect(result.current.consoleMessages).toEqual([]);
  });

  it('应添加新消息', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
    });

    act(() => {
      vi.runAllTimers(); // 处理队列
    });

    expect(result.current.consoleMessages).toEqual([{ ...message, count: 1 }]);
  });

  it('应合并相同的连续消息', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
      result.current.handleNewMessage(message);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([{ ...message, count: 2 }]);
  });

  it('不应合并不同的消息', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message1: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message 1',
      count: 1,
    };
    const message2: ConsoleMessageItem = {
      type: 'error',
      content: 'Test message 2',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message1);
      result.current.handleNewMessage(message2);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([
      { ...message1, count: 1 },
      { ...message2, count: 1 },
    ]);
  });

  it('如果类型不同，不应合并消息', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message1: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };
    const message2: ConsoleMessageItem = {
      type: 'error',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message1);
      result.current.handleNewMessage(message2);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([
      { ...message1, count: 1 },
      { ...message2, count: 1 },
    ]);
  });

  it('应清除控制台消息', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toHaveLength(1);

    act(() => {
      result.current.clearConsoleMessages();
    });

    expect(result.current.consoleMessages).toEqual([]);
  });

  it('应在 clearConsoleMessages 时清除待处理的超时', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message); // 这会安排一个超时
    });

    act(() => {
      result.current.clearConsoleMessages();
    });

    // 确保队列为空且没有更多消息被处理
    act(() => {
      vi.runAllTimers(); // 如果超时未被清除，这会处理队列
    });

    expect(result.current.consoleMessages).toEqual([]);
  });

  it('应在 clearConsoleMessages 时清除消息队列', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      // 添加消息但不处理队列
      result.current.handleNewMessage(message);
    });

    act(() => {
      result.current.clearConsoleMessages();
    });

    // 处理任何待处理的超时（应该没有与消息队列相关的）
    act(() => {
      vi.runAllTimers();
    });

    // 控制台消息应为空，因为队列在处理前被清除了
    expect(result.current.consoleMessages).toEqual([]);
  });

  it('应在卸载时清理超时', () => {
    const { result, unmount } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
    });

    unmount();

    // 这有点间接。我们检查 clearTimeout 是否被调用。
    // 如果 clearTimeout 未被调用，且我们运行计时器，可能会发生错误
    // 或状态可能改变，这在卸载后不应该发生。
    // 如果可用且易于设置，Vitest 的 vi.clearAllTimers() 或对 clearTimeout 调用的特定检查
    // 会更直接。
    // 现在，我们依赖 useEffect 清理模式。
    expect(vi.getTimerCount()).toBe(0); // 检查是否所有计时器都被清除
  });
});