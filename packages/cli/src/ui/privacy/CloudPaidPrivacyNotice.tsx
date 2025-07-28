/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface CloudPaidPrivacyNoticeProps {
  onExit: () => void;
}

export const CloudPaidPrivacyNotice = ({
  onExit,
}: CloudPaidPrivacyNoticeProps) => {
  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        Vertex AI 通知
      </Text>
      <Newline />
      <Text>
        服务特定条款<Text color={Colors.AccentBlue}>[1]</Text>已并入Google同意向客户提供Google Cloud Platform<Text color={Colors.AccentGreen}>[2]</Text>的协议（“协议”）中。如果协议授权在Google Cloud合作伙伴或经销商计划下转售或供应Google Cloud Platform，则除“合作伙伴特定条款”部分外，服务特定条款中对“客户”的所有引用均指合作伙伴或经销商（视情况而定），服务特定条款中对“客户数据”的所有引用均指合作伙伴数据。在服务特定条款中使用但未定义的大写术语具有协议中赋予它们的含义。
      </Text>
      <Newline />
      <Text>
        <Text color={Colors.AccentBlue}>[1]</Text>{' '}
        https://cloud.google.com/terms/service-terms
      </Text>
      <Text>
        <Text color={Colors.AccentGreen}>[2]</Text>{' '}
        https://cloud.google.com/terms/services
      </Text>
      <Newline />
      <Text color={Colors.Gray}>按 Esc 退出。</Text>
    </Box>
  );
};