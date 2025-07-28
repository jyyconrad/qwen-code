
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text, useInput } from 'ink';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { usePrivacySettings } from '../hooks/usePrivacySettings.js';
import { CloudPaidPrivacyNotice } from './CloudPaidPrivacyNotice.js';
import { Config } from '@iflytek/iflycode-core';
import { Colors } from '../colors.js';

interface CloudFreePrivacyNoticeProps {
  config: Config;
  onExit: () => void;
}

export const CloudFreePrivacyNotice = ({
  config,
  onExit,
}: CloudFreePrivacyNoticeProps) => {
  const { privacyState, updateDataCollectionOptIn } =
    usePrivacySettings(config);

  useInput((input, key) => {
    if (privacyState.error && key.escape) {
      onExit();
    }
  });

  if (privacyState.isLoading) {
    return <Text color={Colors.Gray}>加载中...</Text>;
  }

  if (privacyState.error) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color={Colors.AccentRed}>
          加载选择加入设置时出错: {privacyState.error}
        </Text>
        <Text color={Colors.Gray}>按 Esc 退出。</Text>
      </Box>
    );
  }

  if (privacyState.isFreeTier === false) {
    return <CloudPaidPrivacyNotice onExit={onExit} />;
  }

  const items = [
    { label: '是', value: true },
    { label: '否', value: false },
  ];

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={Colors.AccentPurple}>
        面向个人用户的 Gemini Code Assist 隐私声明
      </Text>
      <Newline />
      <Text>
        本声明和我们的隐私政策
        <Text color={Colors.AccentBlue}>[1]</Text> 描述了 Gemini Code
        Assist 如何处理您的数据。请仔细阅读。
      </Text>
      <Newline />
      <Text>
        当您将 Gemini CLI 与面向个人用户的 Gemini Code Assist 一起使用时，Google
        会收集您的提示、相关代码、生成的输出、代码编辑、
        相关功能使用信息以及您的反馈，以提供、
        改进和开发 Google 产品和服务以及机器学习技术。
      </Text>
      <Newline />
      <Text>
        为了帮助提升产品质量并改进我们的产品（例如生成式
        机器学习模型），人工审核员可能会阅读、标注和
        处理上述收集的数据。我们会采取措施在此过程中保护您的隐私。
        这包括在审核员看到或标注数据之前将其与您的
        Google 账户断开连接，并将这些断开连接的副本存储最多 18 个月。
        请不要提交机密信息或您不希望审核员看到或 Google 用于改进我们产品、
        服务和机器学习技术的任何数据。
      </Text>
      <Newline />
      <Box flexDirection="column">
        <Text>
          允许 Google 使用此数据来开发和改进我们的产品？
        </Text>
        <RadioButtonSelect
          items={items}
          initialIndex={privacyState.dataCollectionOptIn ? 0 : 1}
          onSelect={(value) => {
            updateDataCollectionOptIn(value);
            // 仅在没有错误时退出。
            if (!privacyState.error) {
              onExit();
            }
          }}
        />
      </Box>
      <Newline />
      <Text>
        <Text color={Colors.AccentBlue}>[1]</Text>{' '}
        https://policies.google.com/privacy
      </Text>
      <Newline />
      <Text color={Colors.Gray}>按 Enter 选择选项并退出。</Text>
    </Box>
  );
};