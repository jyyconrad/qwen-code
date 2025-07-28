/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { AuthType } from '@iflytek/iflycode-core';
import {
  validateAuthMethod,
  setOpenAIApiKey,
  setOpenAIBaseUrl,
  setOpenAIModel,
} from '../../config/auth.js';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

function parseDefaultAuthType(
  defaultAuthType: string | undefined,
): AuthType | null {
  if (
    defaultAuthType &&
    Object.values(AuthType).includes(defaultAuthType as AuthType)
  ) {
    return defaultAuthType as AuthType;
  }
  return null;
}

export function AuthDialog({
  onSelect,
  settings,
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  const [showOpenAIKeyPrompt, setShowOpenAIKeyPrompt] = useState(false);
  const items = [{ label: 'OpenAI', value: AuthType.USE_OPENAI }];

  const initialAuthIndex = Math.max(
    0,
    items.findIndex((item) => {
      if (settings.merged.selectedAuthType) {
        return item.value === settings.merged.selectedAuthType;
      }

      const defaultAuthType = parseDefaultAuthType(
        process.env.GEMINI_DEFAULT_AUTH_TYPE,
      );
      if (defaultAuthType) {
        return item.value === defaultAuthType;
      }

      if (process.env.GEMINI_API_KEY) {
        return item.value === AuthType.USE_GEMINI;
      }

      return item.value === AuthType.LOGIN_WITH_GOOGLE;
    }),
  );

  const handleAuthSelect = (authMethod: AuthType) => {
    const error = validateAuthMethod(authMethod);
    if (error) {
      if (authMethod === AuthType.USE_OPENAI && !process.env.OPENAI_API_KEY) {
        setShowOpenAIKeyPrompt(true);
        setErrorMessage(null);
      } else {
        setErrorMessage(error);
      }
    } else {
      setErrorMessage(null);
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleOpenAIKeySubmit = (
    apiKey: string,
    baseUrl: string,
    model: string,
  ) => {
    setOpenAIApiKey(apiKey);
    setOpenAIBaseUrl(baseUrl);
    setOpenAIModel(model);
    setShowOpenAIKeyPrompt(false);
    onSelect(AuthType.USE_OPENAI, SettingScope.User);
  };

  const handleOpenAIKeyCancel = () => {
    setShowOpenAIKeyPrompt(false);
    setErrorMessage('使用 OpenAI 认证需要 OpenAI API 密钥。');
  };

  useInput((_input, key) => {
    // 当显示 OpenAIKeyPrompt 时，不处理输入事件
    if (showOpenAIKeyPrompt) {
      return;
    }

    if (key.escape) {
      // 如果有错误信息则阻止退出。
      // 这表示用户尚未完成认证。
      if (errorMessage) {
        return;
      }
      if (settings.merged.selectedAuthType === undefined) {
        // 如果未设置认证方式则阻止退出
        setErrorMessage(
          '您必须选择一种认证方式才能继续。按两次 Ctrl+C 退出。',
        );
        return;
      }
      onSelect(undefined, SettingScope.User);
    }
  });

  if (showOpenAIKeyPrompt) {
    return (
      <OpenAIKeyPrompt
        onSubmit={handleOpenAIKeySubmit}
        onCancel={handleOpenAIKeyCancel}
      />
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>开始使用</Text>
      <Box marginTop={1}>
        <Text>您希望如何为此项目进行认证？</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialAuthIndex}
          onSelect={handleAuthSelect}
          isFocused={true}
        />
      </Box>
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.AccentPurple}>(使用回车键设置认证)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>iFlyCode 的服务条款和隐私声明</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {'https://github.com/iFlyCodeLM/iFlyCode3-Coder/blob/main/README.md'}
        </Text>
      </Box>
    </Box>
  );
}