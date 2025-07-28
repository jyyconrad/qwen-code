/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { Colors } from '../../colors.js';

/**
 * 表示 RadioButtonSelect 的单个选项。
 * 需要一个用于显示的标签和一个在选择时返回的值。
 */
export interface RadioSelectItem<T> {
  label: string;
  value: T;
  disabled?: boolean;
  themeNameDisplay?: string;
  themeTypeDisplay?: string;
}

/**
 * RadioButtonSelect 组件的属性。
 * @template T 与每个单选项目关联的值的类型。
 */
export interface RadioButtonSelectProps<T> {
  /** 要显示为单选选项的项目数组。 */
  items: Array<RadioSelectItem<T>>;
  /** 初始选中的索引 */
  initialIndex?: number;
  /** 选择项目时调用的函数。接收所选项目的 `value`。 */
  onSelect: (value: T) => void;
  /** 项目高亮时调用的函数。接收所选项目的 `value`。 */
  onHighlight?: (value: T) => void;
  /** 此选择输入是否当前聚焦并应响应输入。 */
  isFocused?: boolean;
  /** 是否显示滚动箭头。 */
  showScrollArrows?: boolean;
  /** 一次显示的最大项目数。 */
  maxItemsToShow?: number;
}

/**
 * 自定义组件，显示带有单选按钮的项目列表，
 * 支持滚动和键盘导航。
 *
 * @template T 与每个单选项目关联的值的类型。
 */
export function RadioButtonSelect<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused,
  showScrollArrows = false,
  maxItemsToShow = 10,
}: RadioButtonSelectProps<T>): React.JSX.Element {
  // 确保 initialIndex 在有效范围内
  const safeInitialIndex =
    items.length > 0
      ? Math.max(0, Math.min(initialIndex, items.length - 1))
      : 0;
  const [activeIndex, setActiveIndex] = useState(safeInitialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);

  // 当项目更改时确保 activeIndex 始终在有效范围内
  useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= items.length) {
      setActiveIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, activeIndex]);

  useEffect(() => {
    const newScrollOffset = Math.max(
      0,
      Math.min(activeIndex - maxItemsToShow + 1, items.length - maxItemsToShow),
    );
    if (activeIndex < scrollOffset) {
      setScrollOffset(activeIndex);
    } else if (activeIndex >= scrollOffset + maxItemsToShow) {
      setScrollOffset(newScrollOffset);
    }
  }, [activeIndex, items.length, scrollOffset, maxItemsToShow]);

  useInput(
    (input, key) => {
      if (input === 'k' || key.upArrow) {
        if (items.length > 0) {
          const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
          setActiveIndex(newIndex);
          if (items[newIndex]) {
            onHighlight?.(items[newIndex].value);
          }
        }
      }
      if (input === 'j' || key.downArrow) {
        if (items.length > 0) {
          const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
          setActiveIndex(newIndex);
          if (items[newIndex]) {
            onHighlight?.(items[newIndex].value);
          }
        }
      }
      if (key.return) {
        // 在访问 items[activeIndex] 前添加边界检查
        if (
          activeIndex >= 0 &&
          activeIndex < items.length &&
          items[activeIndex]
        ) {
          onSelect(items[activeIndex].value);
        }
      }

      // 允许通过数字键直接选择。
      if (/^[1-9]$/.test(input)) {
        const targetIndex = Number.parseInt(input, 10) - 1;
        if (targetIndex >= 0 && targetIndex < visibleItems.length) {
          const selectedItem = visibleItems[targetIndex];
          if (selectedItem) {
            onSelect?.(selectedItem.value);
          }
        }
      }
    },
    {
      isActive:
        isFocused &&
        items.length > 0 &&
        activeIndex >= 0 &&
        activeIndex < items.length,
    },
  );

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);

  return (
    <Box flexDirection="column">
      {showScrollArrows && (
        <Text color={scrollOffset > 0 ? Colors.Foreground : Colors.Gray}>
          ▲
        </Text>
      )}
      {visibleItems.map((item, index) => {
        const itemIndex = scrollOffset + index;
        const isSelected = activeIndex === itemIndex;

        let textColor = Colors.Foreground;
        if (isSelected) {
          textColor = Colors.AccentGreen;
        } else if (item.disabled) {
          textColor = Colors.Gray;
        }

        return (
          <Box key={item.label}>
            <Box minWidth={2} flexShrink={0}>
              <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
                {isSelected ? '●' : '○'}
              </Text>
            </Box>
            {item.themeNameDisplay && item.themeTypeDisplay ? (
              <Text color={textColor} wrap="truncate">
                {item.themeNameDisplay}{' '}
                <Text color={Colors.Gray}>{item.themeTypeDisplay}</Text>
              </Text>
            ) : (
              <Text color={textColor} wrap="truncate">
                {item.label}
              </Text>
            )}
          </Box>
        );
      })}
      {showScrollArrows && (
        <Text
          color={
            scrollOffset + maxItemsToShow < items.length
              ? Colors.Foreground
              : Colors.Gray
          }
        >
          ▼
        </Text>
      )}
    </Box>
  );
}