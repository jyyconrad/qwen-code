/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { memoryCommand } from './memoryCommand.js';
import { type CommandContext, SlashCommand } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { getErrorMessage } from '@iflytek/iflycode-core';

vi.mock('@iflytek/iflycode-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@iflytek/iflycode-core')>();
  return {
    ...original,
    getErrorMessage: vi.fn((error: unknown) => {
      if (error instanceof Error) return error.message;
      return String(error);
    }),
  };
});

describe('memoryCommand', () => {
  let mockContext: CommandContext;

  const getSubCommand = (name: 'show' | 'add' | 'refresh'): SlashCommand => {
    const subCommand = memoryCommand.subCommands?.find(
      (cmd) => cmd.name === name,
    );
    if (!subCommand) {
      throw new Error(`/memory ${name} 命令未找到。`);
    }
    return subCommand;
  };

  describe('/memory show', () => {
    let showCommand: SlashCommand;
    let mockGetUserMemory: Mock;
    let mockGetGeminiMdFileCount: Mock;

    beforeEach(() => {
      showCommand = getSubCommand('show');

      mockGetUserMemory = vi.fn();
      mockGetGeminiMdFileCount = vi.fn();

      mockContext = createMockCommandContext({
        services: {
          config: {
            getUserMemory: mockGetUserMemory,
            getGeminiMdFileCount: mockGetGeminiMdFileCount,
          },
        },
      });
    });

    it('如果记忆为空，应显示一条消息', async () => {
      if (!showCommand.action) throw new Error('命令没有操作');

      mockGetUserMemory.mockReturnValue('');
      mockGetGeminiMdFileCount.mockReturnValue(0);

      await showCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: '记忆当前为空。',
        },
        expect.any(Number),
      );
    });

    it('如果存在记忆内容和文件数量，应显示它们', async () => {
      if (!showCommand.action) throw new Error('命令没有操作');

      const memoryContent = '这是一个测试记忆。';

      mockGetUserMemory.mockReturnValue(memoryContent);
      mockGetGeminiMdFileCount.mockReturnValue(1);

      await showCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `来自 1 个文件的当前记忆内容：\n\n---\n${memoryContent}\n---`,
        },
        expect.any(Number),
      );
    });
  });

  describe('/memory add', () => {
    let addCommand: SlashCommand;

    beforeEach(() => {
      addCommand = getSubCommand('add');
      mockContext = createMockCommandContext();
    });

    it('如果没有提供参数，应返回一条错误消息', () => {
      if (!addCommand.action) throw new Error('命令没有操作');

      const result = addCommand.action(mockContext, '  ');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: '用法：/memory add <要记住的文本>',
      });

      expect(mockContext.ui.addItem).not.toHaveBeenCalled();
    });

    it('当提供参数时，应返回一个工具操作并添加一条信息消息', () => {
      if (!addCommand.action) throw new Error('命令没有操作');

      const fact = '记住这个';
      const result = addCommand.action(mockContext, `  ${fact}  `);

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `正在尝试保存到记忆："${fact}"`,
        },
        expect.any(Number),
      );

      expect(result).toEqual({
        type: 'tool',
        toolName: 'save_memory',
        toolArgs: { fact },
      });
    });
  });

  describe('/memory refresh', () => {
    let refreshCommand: SlashCommand;
    let mockRefreshMemory: Mock;

    beforeEach(() => {
      refreshCommand = getSubCommand('refresh');
      mockRefreshMemory = vi.fn();
      mockContext = createMockCommandContext({
        services: {
          config: {
            refreshMemory: mockRefreshMemory,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        },
      });
    });

    it('当记忆刷新并包含内容时，应显示成功消息', async () => {
      if (!refreshCommand.action) throw new Error('命令没有操作');

      const refreshResult = {
        memoryContent: '新的记忆内容',
        fileCount: 2,
      };
      mockRefreshMemory.mockResolvedValue(refreshResult);

      await refreshCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: '正在从源文件刷新记忆...',
        },
        expect.any(Number),
      );

      expect(mockRefreshMemory).toHaveBeenCalledOnce();

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: '记忆刷新成功。从 2 个文件加载了 18 个字符。',
        },
        expect.any(Number),
      );
    });

    it('当记忆刷新但没有内容时，应显示成功消息', async () => {
      if (!refreshCommand.action) throw new Error('命令没有操作');

      const refreshResult = { memoryContent: '', fileCount: 0 };
      mockRefreshMemory.mockResolvedValue(refreshResult);

      await refreshCommand.action(mockContext, '');

      expect(mockRefreshMemory).toHaveBeenCalledOnce();

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: '记忆刷新成功。未找到记忆内容。',
        },
        expect.any(Number),
      );
    });

    it('如果刷新失败，应显示一条错误消息', async () => {
      if (!refreshCommand.action) throw new Error('命令没有操作');

      const error = new Error('读取记忆文件失败。');
      mockRefreshMemory.mockRejectedValue(error);

      await refreshCommand.action(mockContext, '');

      expect(mockRefreshMemory).toHaveBeenCalledOnce();

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: `刷新记忆时出错：${error.message}`,
        },
        expect.any(Number),
      );

      expect(getErrorMessage).toHaveBeenCalledWith(error);
    });

    it('如果配置服务不可用，不应抛出异常', async () => {
      if (!refreshCommand.action) throw new Error('命令没有操作');

      const nullConfigContext = createMockCommandContext({
        services: { config: null },
      });

      await expect(
        refreshCommand.action(nullConfigContext, ''),
      ).resolves.toBeUndefined();

      expect(nullConfigContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: '正在从源文件刷新记忆...',
        },
        expect.any(Number),
      );

      expect(mockRefreshMemory).not.toHaveBeenCalled();
    });
  });
});