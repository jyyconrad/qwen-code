/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
  ToolMcpConfirmationDetails,
  Config,
} from '@iflytek/iflycode-core';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';

export interface ToolConfirmationMessageProps {
  confirmationDetails: ToolCallConfirmationDetails;
  config?: Config;
  isFocused?: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export const ToolConfirmationMessage: React.FC<
  ToolConfirmationMessageProps
> = ({
  confirmationDetails,
  isFocused = true,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const { onConfirm } = confirmationDetails;
  const childWidth = terminalWidth - 2; // 2 用于内边距

  useInput((_, key) => {
    if (!isFocused) return;
    if (key.escape) {
      onConfirm(ToolConfirmationOutcome.Cancel);
    }
  });

  const handleSelect = (item: ToolConfirmationOutcome) => onConfirm(item);

  let bodyContent: React.ReactNode | null = null; // 在此处移除了 contextDisplay
  let question: string;

  const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = new Array<
    RadioSelectItem<ToolConfirmationOutcome>
  >();

  // 主体内容现在是 DiffRenderer，将文件名传递给它
  // 边框框从此处移除，并在 DiffRenderer 内部处理

  function availableBodyContentHeight() {
    if (options.length === 0) {
      // 实际上这不应该发生，因为选项总是在调用此函数之前添加。
      throw new Error('未提供确认消息的选项');
    }

    if (availableTerminalHeight === undefined) {
      return undefined;
    }

    // 计算主体内容周围 UI 元素所占用的垂直空间（以行为单位）。
    const PADDING_OUTER_Y = 2; // 主容器有 `padding={1}`（顶部和底部）。
    const MARGIN_BODY_BOTTOM = 1; // 主体容器的边距。
    const HEIGHT_QUESTION = 1; // 问题文本为一行。
    const MARGIN_QUESTION_BOTTOM = 1; // 问题容器的边距。
    const HEIGHT_OPTIONS = options.length; // 单选列表中的每个选项占一行。

    const surroundingElementsHeight =
      PADDING_OUTER_Y +
      MARGIN_BODY_BOTTOM +
      HEIGHT_QUESTION +
      MARGIN_QUESTION_BOTTOM +
      HEIGHT_OPTIONS;
    return Math.max(availableTerminalHeight - surroundingElementsHeight, 1);
  }
  if (confirmationDetails.type === 'edit') {
    if (confirmationDetails.isModifying) {
      return (
        <Box
          minWidth="90%"
          borderStyle="round"
          borderColor={Colors.Gray}
          justifyContent="space-around"
          padding={1}
          overflow="hidden"
        >
          <Text>正在修改中: </Text>
          <Text color={Colors.AccentGreen}>
            保存并关闭外部编辑器以继续
          </Text>
        </Box>
      );
    }

    question = `应用此更改？`;
    options.push(
      {
        label: '是，允许一次',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: '是，总是允许',
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      {
        label: '使用外部编辑器修改',
        value: ToolConfirmationOutcome.ModifyWithEditor,
      },
      { label: '否 (esc)', value: ToolConfirmationOutcome.Cancel },
    );
    bodyContent = (
      <DiffRenderer
        diffContent={confirmationDetails.fileDiff}
        filename={confirmationDetails.fileName}
        availableTerminalHeight={availableBodyContentHeight()}
        terminalWidth={childWidth}
      />
    );
  } else if (confirmationDetails.type === 'exec') {
    const executionProps =
      confirmationDetails as ToolExecuteConfirmationDetails;

    question = `允许执行？`;
    options.push(
      {
        label: '是，允许一次',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: `是，总是允许 "${executionProps.rootCommand} ..."`,
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      { label: '否 (esc)', value: ToolConfirmationOutcome.Cancel },
    );

    let bodyContentHeight = availableBodyContentHeight();
    if (bodyContentHeight !== undefined) {
      bodyContentHeight -= 2; // 考虑内边距；
    }
    bodyContent = (
      <Box flexDirection="column">
        <Box paddingX={1} marginLeft={1}>
          <MaxSizedBox
            maxHeight={bodyContentHeight}
            maxWidth={Math.max(childWidth - 4, 1)}
          >
            <Box>
              <Text color={Colors.AccentCyan}>{executionProps.command}</Text>
            </Box>
          </MaxSizedBox>
        </Box>
      </Box>
    );
  } else if (confirmationDetails.type === 'info') {
    const infoProps = confirmationDetails;
    const displayUrls =
      infoProps.urls &&
      !(infoProps.urls.length === 1 && infoProps.urls[0] === infoProps.prompt);

    question = `是否要继续？`;
    options.push(
      {
        label: '是，允许一次',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: '是，总是允许',
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      { label: '否 (esc)', value: ToolConfirmationOutcome.Cancel },
    );

    bodyContent = (
      <Box flexDirection="column" paddingX={1} marginLeft={1}>
        <Text color={Colors.AccentCyan}>{infoProps.prompt}</Text>
        {displayUrls && infoProps.urls && infoProps.urls.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>要获取的 URL:</Text>
            {infoProps.urls.map((url) => (
              <Text key={url}> - {url}</Text>
            ))}
          </Box>
        )}
      </Box>
    );
  } else {
    // mcp 工具确认
    const mcpProps = confirmationDetails as ToolMcpConfirmationDetails;

    bodyContent = (
      <Box flexDirection="column" paddingX={1} marginLeft={1}>
        <Text color={Colors.AccentCyan}>MCP 服务器: {mcpProps.serverName}</Text>
        <Text color={Colors.AccentCyan}>工具: {mcpProps.toolName}</Text>
      </Box>
    );

    question = `允许从服务器 "${mcpProps.serverName}" 执行 MCP 工具 "${mcpProps.toolName}" 吗？`;
    options.push(
      {
        label: '是，允许一次',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: `是，总是允许来自服务器 "${mcpProps.serverName}" 的工具 "${mcpProps.toolName}"`,
        value: ToolConfirmationOutcome.ProceedAlwaysTool, // 类型更新前的类型转换
      },
      {
        label: `是，总是允许来自服务器 "${mcpProps.serverName}" 的所有工具`,
        value: ToolConfirmationOutcome.ProceedAlwaysServer,
      },
      { label: '否 (esc)', value: ToolConfirmationOutcome.Cancel },
    );
  }

  return (
    <Box flexDirection="column" padding={1} width={childWidth}>
      {/* 主体内容（差异渲染器或命令信息） */}
      {/* 对于编辑操作，此处不再单独显示上下文 */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginBottom={1}>
        {bodyContent}
      </Box>

      {/* 确认问题 */}
      <Box marginBottom={1} flexShrink={0}>
        <Text wrap="truncate">{question}</Text>
      </Box>

      {/* 选项的选择输入 */}
      <Box flexShrink={0}>
        <RadioButtonSelect
          items={options}
          onSelect={handleSelect}
          isFocused={isFocused}
        />
      </Box>
    </Box>
  );
};