
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand } from '../commands/types.js';

interface Help {
  commands: SlashCommand[];
}

export const Help: React.FC<Help> = ({ commands }) => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderColor={Colors.Gray}
    borderStyle="round"
    padding={1}
  >
    {/* 基础用法 */}
    <Text bold color={Colors.Foreground}>
      基础用法:
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        添加上下文
      </Text>
      : 使用{' '}
      <Text bold color={Colors.AccentPurple}>
        @
      </Text>{' '}
      指定文件作为上下文（例如，{' '}
      <Text bold color={Colors.AccentPurple}>
        @src/myFile.ts
      </Text>
      ）以针对特定文件或文件夹。
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Shell 模式
      </Text>
      : 通过{' '}
      <Text bold color={Colors.AccentPurple}>
        !
      </Text>{' '}
      执行 shell 命令（例如，{' '}
      <Text bold color={Colors.AccentPurple}>
        !npm run start
      </Text>
      ）或使用自然语言（例如{' '}
      <Text bold color={Colors.AccentPurple}>
        start server
      </Text>
      ）。
    </Text>

    <Box height={1} />

    {/* 命令 */}
    <Text bold color={Colors.Foreground}>
      命令:
    </Text>
    {commands
      .filter((command) => command.description)
      .map((command: SlashCommand) => (
        <Box key={command.name} flexDirection="column">
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              {' '}
              /{command.name}
            </Text>
            {command.description && ' - ' + command.description}
          </Text>
          {command.subCommands &&
            command.subCommands.map((subCommand) => (
              <Text key={subCommand.name} color={Colors.Foreground}>
                <Text bold color={Colors.AccentPurple}>
                  {'   '}
                  {subCommand.name}
                </Text>
                {subCommand.description && ' - ' + subCommand.description}
              </Text>
            ))}
        </Box>
      ))}
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        {' '}
        !{' '}
      </Text>
      - shell 命令
    </Text>

    <Box height={1} />

    {/* 快捷键 */}
    <Text bold color={Colors.Foreground}>
      键盘快捷键:
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Enter
      </Text>{' '}
      - 发送消息
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        {process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J'}
      </Text>{' '}
      {process.platform === 'linux'
        ? '- 换行（Alt+Enter 在某些 Linux 发行版上有效）'
        : '- 换行'}
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        上/下方向键
      </Text>{' '}
      - 在提示历史记录中循环
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Alt+左/右方向键
      </Text>{' '}
      - 在输入中跳转单词
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Shift+Tab
      </Text>{' '}
      - 切换自动接受编辑
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Ctrl+Y
      </Text>{' '}
      - 切换 YOLO 模式
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Esc
      </Text>{' '}
      - 取消操作
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Ctrl+C
      </Text>{' '}
      - 退出应用程序
    </Text>
  </Box>
);