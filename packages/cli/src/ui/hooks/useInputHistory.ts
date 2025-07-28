/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

interface UseInputHistoryProps {
  userMessages: readonly string[];
  onSubmit: (value: string) => void;
  isActive: boolean;
  currentQuery: string; // 从 query 重命名为 currentQuery 以避免混淆
  onChange: (value: string) => void;
}

interface UseInputHistoryReturn {
  handleSubmit: (value: string) => void;
  navigateUp: () => boolean;
  navigateDown: () => boolean;
}

export function useInputHistory({
  userMessages,
  onSubmit,
  isActive,
  currentQuery,
  onChange,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [originalQueryBeforeNav, setOriginalQueryBeforeNav] =
    useState<string>('');

  const resetHistoryNav = useCallback(() => {
    setHistoryIndex(-1);
    setOriginalQueryBeforeNav('');
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        onSubmit(trimmedValue); // 父组件负责清除查询
      }
      resetHistoryNav();
    },
    [onSubmit, resetHistoryNav],
  );

  const navigateUp = useCallback(() => {
    if (!isActive) return false;
    if (userMessages.length === 0) return false;

    let nextIndex = historyIndex;
    if (historyIndex === -1) {
      // 在导航前存储来自父组件的当前查询
      setOriginalQueryBeforeNav(currentQuery);
      nextIndex = 0;
    } else if (historyIndex < userMessages.length - 1) {
      nextIndex = historyIndex + 1;
    } else {
      return false; // 已经在最旧的消息处
    }

    if (nextIndex !== historyIndex) {
      setHistoryIndex(nextIndex);
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
      return true;
    }
    return false;
  }, [
    historyIndex,
    setHistoryIndex,
    onChange,
    userMessages,
    isActive,
    currentQuery, // 使用来自 props 的 currentQuery
    setOriginalQueryBeforeNav,
  ]);

  const navigateDown = useCallback(() => {
    if (!isActive) return false;
    if (historyIndex === -1) return false; // 当前未在浏览历史记录

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);

    if (nextIndex === -1) {
      // 到达历史导航的末尾，恢复原始查询
      onChange(originalQueryBeforeNav);
    } else {
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
    }
    return true;
  }, [
    historyIndex,
    setHistoryIndex,
    originalQueryBeforeNav,
    onChange,
    userMessages,
    isActive,
  ]);

  return {
    handleSubmit,
    navigateUp,
    navigateDown,
  };
}