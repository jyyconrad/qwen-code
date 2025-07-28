/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface GeminiPrivacyNoticeProps {
  onExit: () => void;
}

export const GeminiPrivacyNotice = ({ onExit }: GeminiPrivacyNoticeProps) => {
  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        Gemini API 密钥声明
      </Text>
      <Newline />
      <Text>
        通过使用 Gemini API<Text color={Colors.AccentBlue}>[1]</Text>、
        Google AI Studio
        <Text color={Colors.AccentRed}>[2]</Text>，以及引用这些条款的其他 Google
        开发者服务（统称为“API”或“服务”），您同意遵守 Google
        APIs 服务条款（“API 条款”）
        <Text color={Colors.AccentGreen}>[3]</Text>，以及 Gemini API
        补充服务条款（“补充条款”）
        <Text color={Colors.AccentPurple}>[4]</Text>。
      </Text>
      <Newline />
      <Text>
        <Text color={Colors.AccentBlue}>[1]</Text>{' '}
        https://ai.google.dev/docs/gemini_api_overview
      </Text>
      <Text>
        <Text color={Colors.AccentRed}>[2]</Text> https://aistudio.google.com/
      </Text>
      <Text>
        <Text color={Colors.AccentGreen}>[3]</Text>{' '}
        https://developers.google.com/terms
      </Text>
      <Text>
        <Text color={Colors.AccentPurple}>[4]</Text>{' '}
        https://ai.google.dev/gemini-api/terms
      </Text>
      <Newline />
      <Text color={Colors.Gray}>按 Esc 键退出。</Text>
    </Box>
  );
};