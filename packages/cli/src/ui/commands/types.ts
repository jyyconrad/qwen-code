/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, GitService, Logger } from '@iflytek/iflycode-core';
import { LoadedSettings } from '../../config/settings.js';
import { UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { SessionStatsState } from '../contexts/SessionContext.js';

// 为清晰和便于模拟而分组的依赖项
export interface CommandContext {
  // 核心服务和配置
  services: {
    // TODO(abhipatel12): 确保 config 永远不为 null。
    config: Config | null;
    settings: LoadedSettings;
    git: GitService | undefined;
    logger: Logger;
  };
  // UI 状态和历史管理
  ui: {
    // TODO - 随着更多命令的添加，可能需要使用这个新上下文进行一些添加或重构。
    // 例如：
    // history: HistoryItem[];
    // pendingHistoryItems: HistoryItemWithoutId[];

    /** 向历史显示中添加新项目。 */
    addItem: UseHistoryManagerReturn['addItem'];
    /** 清除所有历史项目和控制台屏幕。 */
    clear: () => void;
    /**
     * 在调试模式下设置应用页脚中显示的临时调试消息。
     */
    setDebugMessage: (message: string) => void;
  };
  // 会话特定数据
  session: {
    stats: SessionStatsState;
  };
}

/**
 * 命令操作结果为调度工具调用的返回类型。
 */
export interface ToolActionReturn {
  type: 'tool';
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/**
 * 命令操作结果为向用户显示简单消息的返回类型。
 */
export interface MessageActionReturn {
  type: 'message';
  messageType: 'info' | 'error';
  content: string;
}

/**
 * 命令操作结果为需要打开对话框的返回类型。
 */
export interface OpenDialogActionReturn {
  type: 'dialog';
  // TODO: 随着迁移的进行，添加 'theme' | 'auth' | 'editor' | 'privacy'。
  dialog: 'help' | 'auth' | 'theme' | 'privacy';
}

export type SlashCommandActionReturn =
  | ToolActionReturn
  | MessageActionReturn
  | OpenDialogActionReturn;
// 系统中任何命令的标准化契约。
export interface SlashCommand {
  name: string;
  altName?: string;
  description?: string;

  // 要运行的操作。对于仅用于分组子命令的父命令是可选的。
  action?: (
    context: CommandContext,
    args: string,
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>;

  // 提供参数补全（例如，为 `/chat resume <tag>` 补全标签）。
  completion?: (
    context: CommandContext,
    partialArg: string,
  ) => Promise<string[]>;

  subCommands?: SlashCommand[];
}