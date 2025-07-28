/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
}
interface SuggestionsDisplayProps {
  suggestions: Suggestion[];
  activeIndex: number;
  isLoading: boolean;
  width: number;
  scrollOffset: number;
  userInput: string;
}

export const MAX_SUGGESTIONS_TO_SHOW = 8;

export function SuggestionsDisplay({
  suggestions,
  activeIndex,
  isLoading,
  width,
  scrollOffset,
  userInput,
}: SuggestionsDisplayProps) {
  if (isLoading) {
    return (
      <Box paddingX={1} width={width}>
        <Text color="gray">正在加载建议...</Text>
      </Box>
    );
  }

  if (suggestions.length === 0) {
    return null; // 如果没有建议则不渲染任何内容
  }

  // 根据 scrollOffset 计算可见切片
  const startIndex = scrollOffset;
  const endIndex = Math.min(
    scrollOffset + MAX_SUGGESTIONS_TO_SHOW,
    suggestions.length,
  );
  const visibleSuggestions = suggestions.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column" paddingX={1} width={width}>
      {scrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        const textColor = isActive ? Colors.AccentPurple : Colors.Gray;

        return (
          <Box key={`${suggestion}-${originalIndex}`} width={width}>
            <Box flexDirection="row">
              {userInput.startsWith('/') ? (
                // 仅在 (/) 命令模式下使用盒模型
                <Box width={20} flexShrink={0}>
                  <Text color={textColor}>{suggestion.label}</Text>
                </Box>
              ) : (
                // 在其他模式下 (@ 上下文) 使用常规文本
                <Text color={textColor}>{suggestion.label}</Text>
              )}
              {suggestion.description ? (
                <Box flexGrow={1}>
                  <Text color={textColor} wrap="wrap">
                    {suggestion.description}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Box>
        );
      })}
      {endIndex < suggestions.length && <Text color="gray">▼</Text>}
      {suggestions.length > MAX_SUGGESTIONS_TO_SHOW && (
        <Text color="gray">
          ({activeIndex + 1}/{suggestions.length})
        </Text>
      )}
    </Box>
  );
}