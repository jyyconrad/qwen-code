/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

interface GeminiMessageContentProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

/*
 * Gemini 消息内容是一个半 hack 的组件。其目的是表示 GeminiMessage 的一部分，
 * 仅在响应过长时使用。在这种情况下，消息会被拆分成多个 GeminiMessageContent，
 * 以便 App.tsx 中的根 <Static> 组件尽可能高效地运行。
 */
export const GeminiMessageContent: React.FC<GeminiMessageContentProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const originalPrefix = '✦ ';
  const prefixWidth = originalPrefix.length;

  return (
    <Box flexDirection="column" paddingLeft={prefixWidth}>
      <MarkdownDisplay
        text={text}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
      />
    </Box>
  );
};