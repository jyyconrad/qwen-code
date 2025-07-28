/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';

interface UserShellMessageProps {
  text: string;
}

export const UserShellMessage: React.FC<UserShellMessageProps> = ({ text }) => {
  // 如果存在，移除开头的 '!'，因为 App.tsx 会为处理器添加它。
  const commandToDisplay = text.startsWith('!') ? text.substring(1) : text;

  return (
    <Box>
      <Text color={Colors.AccentCyan}>$ </Text>
      <Text>{commandToDisplay}</Text>
    </Box>
  );
};