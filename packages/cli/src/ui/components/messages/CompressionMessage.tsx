/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { CompressionProps } from '../../types.js';
import Spinner from 'ink-spinner';
import { Colors } from '../../colors.js';

export interface CompressionDisplayProps {
  compression: CompressionProps;
}

/*
 * 压缩消息在运行 /compress 命令时显示，展示加载旋转动画
 * 在压缩进行中时显示，随后显示一些压缩统计信息。
 */
export const CompressionMessage: React.FC<CompressionDisplayProps> = ({
  compression,
}) => {
  const text = compression.isPending
    ? '正在压缩聊天历史记录'
    : `聊天历史记录已从 ${compression.originalTokenCount ?? 'unknown'}` +
      ` 个 token 压缩至 ${compression.newTokenCount ?? 'unknown'} 个 token。`;

  return (
    <Box flexDirection="row">
      <Box marginRight={1}>
        {compression.isPending ? (
          <Spinner type="dots" />
        ) : (
          <Text color={Colors.AccentPurple}>✦</Text>
        )}
      </Box>
      <Box>
        <Text
          color={
            compression.isPending ? Colors.AccentPurple : Colors.AccentGreen
          }
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
};