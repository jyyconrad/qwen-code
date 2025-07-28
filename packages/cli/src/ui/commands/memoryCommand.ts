/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage } from '@iflytek/iflycode-core';
import { MessageType } from '../types.js';
import { SlashCommand, SlashCommandActionReturn } from './types.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: '用于与记忆交互的命令。',
  subCommands: [
    {
      name: 'show',
      description: '显示当前记忆内容。',
      action: async (context) => {
        const memoryContent = context.services.config?.getUserMemory() || '';
        const fileCount = context.services.config?.getGeminiMdFileCount() || 0;

        const messageContent =
          memoryContent.length > 0
            ? `来自 ${fileCount} 个文件的当前记忆内容：\n\n---\n${memoryContent}\n---`
            : '记忆当前为空。';

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: messageContent,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'add',
      description: '向记忆中添加内容。',
      action: (context, args): SlashCommandActionReturn | void => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: '用法：/memory add <要记住的文本>',
          };
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `正在尝试保存到记忆："${args.trim()}"`,
          },
          Date.now(),
        );

        return {
          type: 'tool',
          toolName: 'save_memory',
          toolArgs: { fact: args.trim() },
        };
      },
    },
    {
      name: 'refresh',
      description: '从源刷新记忆。',
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: '正在从源文件刷新记忆...',
          },
          Date.now(),
        );

        try {
          const result = await context.services.config?.refreshMemory();

          if (result) {
            const { memoryContent, fileCount } = result;
            const successMessage =
              memoryContent.length > 0
                ? `记忆刷新成功。从 ${fileCount} 个文件加载了 ${memoryContent.length} 个字符。`
                : '记忆刷新成功。未找到记忆内容。';

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: successMessage,
              },
              Date.now(),
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `刷新记忆时出错：${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};