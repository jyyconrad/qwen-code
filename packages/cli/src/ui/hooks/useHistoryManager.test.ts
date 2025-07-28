/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './useHistoryManager.js';
import { HistoryItem } from '../types.js';

describe('useHistoryManager', () => {
  it('应初始化为空的历史记录', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.history).toEqual([]);
  });

  it('应将项目添加到历史记录中并生成唯一 ID', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Hello',
    };

    act(() => {
      result.current.addItem(itemData, timestamp);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toEqual(
      expect.objectContaining({
        ...itemData,
        id: expect.any(Number),
      }),
    );
    // 基本检查 ID 是否包含时间戳
    expect(result.current.history[0].id).toBeGreaterThanOrEqual(timestamp);
  });

  it('应为使用相同基础时间戳添加的项目生成唯一 ID', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'First',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Second',
    };

    let id1!: number;
    let id2!: number;

    act(() => {
      id1 = result.current.addItem(itemData1, timestamp);
      id2 = result.current.addItem(itemData2, timestamp);
    });

    expect(result.current.history).toHaveLength(2);
    expect(id1).not.toEqual(id2);
    expect(result.current.history[0].id).toEqual(id1);
    expect(result.current.history[1].id).toEqual(id2);
    // ID 应该基于计数器是连续的
    expect(id2).toBeGreaterThan(id1);
  });

  it('应更新现有的历史记录项目', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const initialItem: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Initial content',
    };
    let itemId!: number;

    act(() => {
      itemId = result.current.addItem(initialItem, timestamp);
    });

    const updatedText = 'Updated content';
    act(() => {
      result.current.updateItem(itemId, { text: updatedText });
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toEqual({
      ...initialItem,
      id: itemId,
      text: updatedText,
    });
  });

  it('如果使用不存在的 ID 调用 updateHistoryItem，则不应更改历史记录', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Hello',
    };

    act(() => {
      result.current.addItem(itemData, timestamp);
    });

    const originalHistory = [...result.current.history]; // 克隆更新尝试前的历史记录

    act(() => {
      result.current.updateItem(99999, { text: 'Should not apply' }); // 不存在的 ID
    });

    expect(result.current.history).toEqual(originalHistory);
  });

  it('应清除历史记录', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'First',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Second',
    };

    act(() => {
      result.current.addItem(itemData1, timestamp);
      result.current.addItem(itemData2, timestamp);
    });

    expect(result.current.history).toHaveLength(2);

    act(() => {
      result.current.clearItems();
    });

    expect(result.current.history).toEqual([]);
  });

  it('不应添加连续的重复用户消息', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Duplicate message',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Duplicate message',
    };
    const itemData3: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Gemini response',
    };
    const itemData4: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Another user message',
    };

    act(() => {
      result.current.addItem(itemData1, timestamp);
      result.current.addItem(itemData2, timestamp + 1); // 相同文本，不同时间戳
      result.current.addItem(itemData3, timestamp + 2);
      result.current.addItem(itemData4, timestamp + 3);
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0].text).toBe('Duplicate message');
    expect(result.current.history[1].text).toBe('Gemini response');
    expect(result.current.history[2].text).toBe('Another user message');
  });

  it('如果重复的用户消息不是连续的，则应添加它们', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Message 1',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Gemini response',
    };
    const itemData3: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Message 1', // 重复文本，但不是连续的
    };

    act(() => {
      result.current.addItem(itemData1, timestamp);
      result.current.addItem(itemData2, timestamp + 1);
      result.current.addItem(itemData3, timestamp + 2);
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0].text).toBe('Message 1');
    expect(result.current.history[1].text).toBe('Gemini response');
    expect(result.current.history[2].text).toBe('Message 1');
  });
});