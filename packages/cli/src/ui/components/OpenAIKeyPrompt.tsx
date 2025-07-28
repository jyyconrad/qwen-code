/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface OpenAIKeyPromptProps {
  onSubmit: (apiKey: string, baseUrl: string, model: string) => void;
  onCancel: () => void;
}

export function OpenAIKeyPrompt({
  onSubmit,
  onCancel,
}: OpenAIKeyPromptProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [currentField, setCurrentField] = useState<
    'apiKey' | 'baseUrl' | 'model'
  >('apiKey');

  useInput((input, key) => {
    // 过滤粘贴相关的控制序列
    let cleanInput = (input || '')
      // 过滤 ESC 开头的控制序列（如 \u001b[200~、\u001b[201~ 等）
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex
      // 过滤粘贴开始标记 [200~
      .replace(/\[200~/g, '')
      // 过滤粘贴结束标记 [201~
      .replace(/\[201~/g, '')
      // 过滤单独的 [ 和 ~ 字符（可能是粘贴标记的残留）
      .replace(/^\[|~$/g, '');

    // 再过滤所有不可见字符（ASCII < 32，除了回车换行）
    cleanInput = cleanInput
      .split('')
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join('');

    if (cleanInput.length > 0) {
      if (currentField === 'apiKey') {
        setApiKey((prev) => prev + cleanInput);
      } else if (currentField === 'baseUrl') {
        setBaseUrl((prev) => prev + cleanInput);
      } else if (currentField === 'model') {
        setModel((prev) => prev + cleanInput);
      }
      return;
    }

    // 检查是否是 Enter 键（通过检查输入是否包含换行符）
    if (input.includes('\n') || input.includes('\r')) {
      if (currentField === 'apiKey') {
        // 允许空 API key 跳转到下一个字段，让用户稍后可以返回修改
        setCurrentField('baseUrl');
        return;
      } else if (currentField === 'baseUrl') {
        setCurrentField('model');
        return;
      } else if (currentField === 'model') {
        // 只有在提交时才检查 API key 是否为空
        if (apiKey.trim()) {
          onSubmit(apiKey.trim(), baseUrl.trim(), model.trim());
        } else {
          // 如果 API key 为空，回到 API key 字段
          setCurrentField('apiKey');
        }
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    // 处理 Tab 键用于字段导航
    if (key.tab) {
      if (currentField === 'apiKey') {
        setCurrentField('baseUrl');
      } else if (currentField === 'baseUrl') {
        setCurrentField('model');
      } else if (currentField === 'model') {
        setCurrentField('apiKey');
      }
      return;
    }

    // 处理方向键用于字段导航
    if (key.upArrow) {
      if (currentField === 'baseUrl') {
        setCurrentField('apiKey');
      } else if (currentField === 'model') {
        setCurrentField('baseUrl');
      }
      return;
    }

    if (key.downArrow) {
      if (currentField === 'apiKey') {
        setCurrentField('baseUrl');
      } else if (currentField === 'baseUrl') {
        setCurrentField('model');
      }
      return;
    }

    // 处理退格键 - 同时检查 key.backspace 和 delete 键
    if (key.backspace || key.delete) {
      if (currentField === 'apiKey') {
        setApiKey((prev) => prev.slice(0, -1));
      } else if (currentField === 'baseUrl') {
        setBaseUrl((prev) => prev.slice(0, -1));
      } else if (currentField === 'model') {
        setModel((prev) => prev.slice(0, -1));
      }
      return;
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        需要 OpenAI 配置
      </Text>
      <Box marginTop={1}>
        <Text>
          请输入您的 OpenAI 配置。您可以从以下网址获取 API 密钥{' '}
          <Text color={Colors.AccentBlue}>
            https://platform.openai.com/api-keys
          </Text>
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text
            color={currentField === 'apiKey' ? Colors.AccentBlue : Colors.Gray}
          >
            API 密钥:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === 'apiKey' ? '> ' : '  '}
            {apiKey || ' '}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text
            color={currentField === 'baseUrl' ? Colors.AccentBlue : Colors.Gray}
          >
            基础 URL:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === 'baseUrl' ? '> ' : '  '}
            {baseUrl}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text
            color={currentField === 'model' ? Colors.AccentBlue : Colors.Gray}
          >
            模型:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === 'model' ? '> ' : '  '}
            {model}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          按 Enter 继续，Tab/↑↓ 导航，Esc 取消
        </Text>
      </Box>
    </Box>
  );
}