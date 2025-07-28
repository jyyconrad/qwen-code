/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { useInputHistory } from './useInputHistory.js';

describe('useInputHistory', () => {
  const mockOnSubmit = vi.fn();
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const userMessages = ['message 1', 'message 2', 'message 3'];

  it('应初始化 historyIndex 为 -1 且 originalQueryBeforeNav 为空', () => {
    const { result } = renderHook(() =>
      useInputHistory({
        userMessages: [],
        onSubmit: mockOnSubmit,
        isActive: true,
        currentQuery: '',
        onChange: mockOnChange,
      }),
    );

    // 内部状态无法直接测试，但可以通过行为推断。
    // 如果 historyIndex 为 -1，向下导航应无操作。
    act(() => {
      result.current.navigateDown();
    });
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  describe('handleSubmit', () => {
    it('应使用修剪后的值调用 onSubmit 并重置历史记录', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: '  test query  ',
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.handleSubmit('  submit value  ');
      });

      expect(mockOnSubmit).toHaveBeenCalledWith('submit value');
      // 检查历史记录是否已重置（例如通过尝试向下导航）
      act(() => {
        result.current.navigateDown();
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('如果值在修剪后为空，则不应调用 onSubmit', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: '',
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.handleSubmit('   ');
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('navigateUp', () => {
    it('如果 isActive 为 false 则不应导航', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: false,
          currentQuery: 'current',
          onChange: mockOnChange,
        }),
      );
      act(() => {
        const navigated = result.current.navigateUp();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('如果 userMessages 为空则不应导航', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages: [],
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: 'current',
          onChange: mockOnChange,
        }),
      );
      act(() => {
        const navigated = result.current.navigateUp();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('在初始状态下向上导航时应使用最后一条消息调用 onChange', () => {
      const currentQuery = 'current query';
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]); // 最后一条消息
    });

    it('在首次 navigateUp 时应将 currentQuery 存储为 originalQueryBeforeNav', () => {
      const currentQuery = 'original user input';
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // historyIndex 变为 0
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]);

      // 向下导航以恢复原始查询
      act(() => {
        result.current.navigateDown(); // historyIndex 变为 -1
      });
      expect(mockOnChange).toHaveBeenCalledWith(currentQuery);
    });

    it('在后续的 navigateUp 调用中应遍历历史消息', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: '',
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // 导航到 'message 3'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]);

      act(() => {
        result.current.navigateUp(); // 导航到 'message 2'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[1]);

      act(() => {
        result.current.navigateUp(); // 导航到 'message 1'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[0]);
    });
  });

  describe('navigateDown', () => {
    it('如果 isActive 为 false 则不应导航', () => {
      const initialProps = {
        userMessages,
        onSubmit: mockOnSubmit,
        isActive: true, // 开始时为激活状态以允许设置导航
        currentQuery: 'current',
        onChange: mockOnChange,
      };
      const { result, rerender } = renderHook(
        (props) => useInputHistory(props),
        {
          initialProps,
        },
      );

      // 首先向上导航以在历史记录中有内容
      act(() => {
        result.current.navigateUp();
      });
      mockOnChange.mockClear(); // 清除设置时的调用

      // 将 isActive 设置为 false 进行实际测试
      rerender({ ...initialProps, isActive: false });

      act(() => {
        const navigated = result.current.navigateDown();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('如果 historyIndex 为 -1（未处于历史导航中）则不应导航', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: 'current',
          onChange: mockOnChange,
        }),
      );
      act(() => {
        const navigated = result.current.navigateDown();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('在向下导航到初始状态时应恢复 originalQueryBeforeNav', () => {
      const originalQuery = 'my original input';
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: originalQuery,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // 导航到 'message 3'，存储 'originalQuery'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]);
      mockOnChange.mockClear();

      act(() => {
        result.current.navigateDown(); // 导航回原始查询
      });
      expect(mockOnChange).toHaveBeenCalledWith(originalQuery);
    });
  });
});