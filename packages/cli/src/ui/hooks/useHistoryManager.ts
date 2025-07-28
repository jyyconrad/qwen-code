/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback } from 'react';
import { HistoryItem } from '../types.js';

// 用于传递给 updateHistoryItem 的更新器函数类型
type HistoryItemUpdater = (
  prevItem: HistoryItem,
) => Partial<Omit<HistoryItem, 'id'>>;

export interface UseHistoryManagerReturn {
  history: HistoryItem[];
  addItem: (itemData: Omit<HistoryItem, 'id'>, baseTimestamp: number) => number; // 返回生成的 ID
  updateItem: (
    id: number,
    updates: Partial<Omit<HistoryItem, 'id'>> | HistoryItemUpdater,
  ) => void;
  clearItems: () => void;
  loadHistory: (newHistory: HistoryItem[]) => void;
}

/**
 * 用于管理聊天历史状态的自定义 Hook。
 *
 * 封装了历史数组、消息 ID 生成、添加项目、
 * 更新项目和清除历史的功能。
 */
export function useHistory(): UseHistoryManagerReturn {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const messageIdCounterRef = useRef(0);

  // 根据时间戳和计数器生成唯一的 message ID。
  const getNextMessageId = useCallback((baseTimestamp: number): number => {
    messageIdCounterRef.current += 1;
    return baseTimestamp + messageIdCounterRef.current;
  }, []);

  const loadHistory = useCallback((newHistory: HistoryItem[]) => {
    setHistory(newHistory);
  }, []);

  // 添加一个具有唯一 ID 的新项目到历史状态中。
  const addItem = useCallback(
    (itemData: Omit<HistoryItem, 'id'>, baseTimestamp: number): number => {
      const id = getNextMessageId(baseTimestamp);
      const newItem: HistoryItem = { ...itemData, id } as HistoryItem;

      setHistory((prevHistory) => {
        if (prevHistory.length > 0) {
          const lastItem = prevHistory[prevHistory.length - 1];
          // 防止添加重复的连续用户消息
          if (
            lastItem.type === 'user' &&
            newItem.type === 'user' &&
            lastItem.text === newItem.text
          ) {
            return prevHistory; // 不添加重复项
          }
        }
        return [...prevHistory, newItem];
      });
      return id; // 返回生成的 ID（即使未添加，也保持签名一致性）
    },
    [getNextMessageId],
  );

  /**
   * 根据其 ID 更新现有的历史项目。
   * @deprecated 建议不要直接更新历史项目，因为我们目前
   * 为了性能原因在 <Static /> 中渲染所有历史项目。仅在
   * 绝对必要时使用
   */
  //
  const updateItem = useCallback(
    (
      id: number,
      updates: Partial<Omit<HistoryItem, 'id'>> | HistoryItemUpdater,
    ) => {
      setHistory((prevHistory) =>
        prevHistory.map((item) => {
          if (item.id === id) {
            // 根据是对象还是函数来应用更新
            const newUpdates =
              typeof updates === 'function' ? updates(item) : updates;
            return { ...item, ...newUpdates } as HistoryItem;
          }
          return item;
        }),
      );
    },
    [],
  );

  // 清除整个历史状态并重置 ID 计数器。
  const clearItems = useCallback(() => {
    setHistory([]);
    messageIdCounterRef.current = 0;
  }, []);

  return {
    history,
    addItem,
    updateItem,
    clearItems,
    loadHistory,
  };
}