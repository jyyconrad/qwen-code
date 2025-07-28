/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { GeminiRespondingSpinner } from '../GeminiRespondingSpinner.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 5; // 用于工具名称、状态、填充等。
const STATUS_INDICATOR_WIDTH = 3;
const MIN_LINES_SHOWN = 2; // 至少显示这么多行

// 较大的阈值以确保我们不会因为非常大的输出而导致性能问题，
// 这些输出无论如何都会在 MaxSizedBox 中被截断。
const MAXIMUM_RESULT_DISPLAY_CHARACTERS = 1000000;
export type TextEmphasis = 'high' | 'medium' | 'low';

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight?: number;
  terminalWidth: number;
  emphasis?: TextEmphasis;
  renderOutputAsMarkdown?: boolean;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  availableTerminalHeight,
  terminalWidth,
  emphasis = 'medium',
  renderOutputAsMarkdown = true,
}) => {
  const availableHeight = availableTerminalHeight
    ? Math.max(
        availableTerminalHeight - STATIC_HEIGHT - RESERVED_LINE_COUNT,
        MIN_LINES_SHOWN + 1, // 强制显示最小行数
      )
    : undefined;

  // 长工具调用响应在 MarkdownDisplay 中无法正确遵守 availableTerminalHeight，
  // 当响应过长时，我们强制不以 markdown 渲染，它将回退到纯文本渲染，
  // 并通过 MaxSizedBox 限制在终端内显示。
  if (availableHeight) {
    renderOutputAsMarkdown = false;
  }

  const childWidth = terminalWidth - 3; // 考虑填充。
  if (typeof resultDisplay === 'string') {
    if (resultDisplay.length > MAXIMUM_RESULT_DISPLAY_CHARACTERS) {
      // 截断结果显示以适应可用宽度。
      resultDisplay =
        '...' + resultDisplay.slice(-MAXIMUM_RESULT_DISPLAY_CHARACTERS);
    }
  }
  return (
    <Box paddingX={1} paddingY={0} flexDirection="column">
      <Box minHeight={1}>
        <ToolStatusIndicator status={status} />
        <ToolInfo
          name={name}
          status={status}
          description={description}
          emphasis={emphasis}
        />
        {emphasis === 'high' && <TrailingIndicator />}
      </Box>
      {resultDisplay && (
        <Box paddingLeft={STATUS_INDICATOR_WIDTH} width="100%" marginTop={1}>
          <Box flexDirection="column">
            {typeof resultDisplay === 'string' && renderOutputAsMarkdown && (
              <Box flexDirection="column">
                <MarkdownDisplay
                  text={resultDisplay}
                  isPending={false}
                  availableTerminalHeight={availableHeight}
                  terminalWidth={childWidth}
                />
              </Box>
            )}
            {typeof resultDisplay === 'string' && !renderOutputAsMarkdown && (
              <MaxSizedBox maxHeight={availableHeight} maxWidth={childWidth}>
                <Box>
                  <Text wrap="wrap">{resultDisplay}</Text>
                </Box>
              </MaxSizedBox>
            )}
            {typeof resultDisplay !== 'string' && (
              <DiffRenderer
                diffContent={resultDisplay.fileDiff}
                filename={resultDisplay.fileName}
                availableTerminalHeight={availableHeight}
                terminalWidth={childWidth}
              />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

type ToolStatusIndicatorProps = {
  status: ToolCallStatus;
};

const ToolStatusIndicator: React.FC<ToolStatusIndicatorProps> = ({
  status,
}) => (
  <Box minWidth={STATUS_INDICATOR_WIDTH}>
    {status === ToolCallStatus.Pending && (
      <Text color={Colors.AccentGreen}>o</Text>
    )}
    {status === ToolCallStatus.Executing && (
      <GeminiRespondingSpinner
        spinnerType="toggle"
        nonRespondingDisplay={'⊷'}
      />
    )}
    {status === ToolCallStatus.Success && (
      <Text color={Colors.AccentGreen}>✔</Text>
    )}
    {status === ToolCallStatus.Confirming && (
      <Text color={Colors.AccentYellow}>?</Text>
    )}
    {status === ToolCallStatus.Canceled && (
      <Text color={Colors.AccentYellow} bold>
        -
      </Text>
    )}
    {status === ToolCallStatus.Error && (
      <Text color={Colors.AccentRed} bold>
        x
      </Text>
    )}
  </Box>
);

type ToolInfo = {
  name: string;
  description: string;
  status: ToolCallStatus;
  emphasis: TextEmphasis;
};
const ToolInfo: React.FC<ToolInfo> = ({
  name,
  description,
  status,
  emphasis,
}) => {
  const nameColor = React.useMemo<string>(() => {
    switch (emphasis) {
      case 'high':
        return Colors.Foreground;
      case 'medium':
        return Colors.Foreground;
      case 'low':
        return Colors.Gray;
      default: {
        const exhaustiveCheck: never = emphasis;
        return exhaustiveCheck;
      }
    }
  }, [emphasis]);
  return (
    <Box>
      <Text
        wrap="truncate-end"
        strikethrough={status === ToolCallStatus.Canceled}
      >
        <Text color={nameColor} bold>
          {name}
        </Text>{' '}
        <Text color={Colors.Gray}>{description}</Text>
      </Text>
    </Box>
  );
};

const TrailingIndicator: React.FC = () => (
  <Text color={Colors.Foreground} wrap="truncate">
    {' '}
    ←
  </Text>
);