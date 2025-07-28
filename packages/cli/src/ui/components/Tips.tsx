/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config } from '@iflytek/iflycode-core';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const geminiMdFileCount = config.getGeminiMdFileCount();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={Colors.Foreground}>入门提示：</Text>
      <Text color={Colors.Foreground}>
        1. 提出问题、编辑文件或运行命令。
      </Text>
      <Text color={Colors.Foreground}>
        2. 为了获得最佳结果，请尽量具体。
      </Text>
      {geminiMdFileCount === 0 && (
        <Text color={Colors.Foreground}>
          3. 创建{' '}
          <Text bold color={Colors.AccentPurple}>
            IFLYCODE.md
          </Text>{' '}
          文件以自定义您与 iFlyCode 的交互。
        </Text>
      )}
      <Text color={Colors.Foreground}>
        {geminiMdFileCount === 0 ? '4.' : '3.'}{' '}
        <Text bold color={Colors.AccentPurple}>
          /help
        </Text>{' '}
        获取更多信息。
      </Text>
    </Box>
  );
};