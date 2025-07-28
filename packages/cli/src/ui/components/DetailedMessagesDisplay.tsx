/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { ConsoleMessageItem } from '../types.js';
import { MaxSizedBox } from './shared/MaxSizedBox.js';

interface DetailedMessagesDisplayProps {
  messages: ConsoleMessageItem[];
  maxHeight: number | undefined;
  width: number;
  // 如果 App.tsx 在传递消息前已经过滤了调试消息，则此处不需要 debugMode。
  // 如果 DetailedMessagesDisplay 应该处理过滤，请添加 debugMode 属性。
}

export const DetailedMessagesDisplay: React.FC<
  DetailedMessagesDisplayProps
> = ({ messages, maxHeight, width }) => {
  if (messages.length === 0) {
    return null; // 如果没有消息则不渲染任何内容
  }

  const borderAndPadding = 4;
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.Gray}
      paddingX={1}
      width={width}
    >
      <Box marginBottom={1}>
        <Text bold color={Colors.Foreground}>
          调试控制台 <Text color={Colors.Gray}>(按 ctrl+o 关闭)</Text>
        </Text>
      </Box>
      <MaxSizedBox maxHeight={maxHeight} maxWidth={width - borderAndPadding}>
        {messages.map((msg, index) => {
          let textColor = Colors.Foreground;
          let icon = '\u2139'; // 信息来源 (ℹ)

          switch (msg.type) {
            case 'warn':
              textColor = Colors.AccentYellow;
              icon = '\u26A0'; // 警告标志 (⚠)
              break;
            case 'error':
              textColor = Colors.AccentRed;
              icon = '\u2716'; // 粗乘号 (✖)
              break;
            case 'debug':
              textColor = Colors.Gray; // 或 Colors.Gray
              icon = '\u1F50D'; // 向左指向的放大镜 (????)
              break;
            case 'log':
            default:
              // 默认的 textColor 和 icon 已经设置好了
              break;
          }

          return (
            <Box key={index} flexDirection="row">
              <Text color={textColor}>{icon} </Text>
              <Text color={textColor} wrap="wrap">
                {msg.content}
                {msg.count && msg.count > 1 && (
                  <Text color={Colors.Gray}> (x{msg.count})</Text>
                )}
              </Text>
            </Box>
          );
        })}
      </MaxSizedBox>
    </Box>
  );
};