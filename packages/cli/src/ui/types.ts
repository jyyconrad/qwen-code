/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolCallConfirmationDetails,
  ToolResultDisplay,
} from '@iflytek/iflycode-core';

// 仅定义UI所需的状态枚举
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
}

// 从 server/src/core/turn.ts 复制用于CLI使用
export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  // 如果UI钩子需要处理其他事件类型，请添加
}

export enum ToolCallStatus {
  Pending = 'Pending',
  Canceled = 'Canceled',
  Confirming = 'Confirming',
  Executing = 'Executing',
  Success = 'Success',
  Error = 'Error',
}

export interface ToolCallEvent {
  type: 'tool_call';
  status: ToolCallStatus;
  callId: string;
  name: string;
  args: Record<string, never>;
  resultDisplay: ToolResultDisplay | undefined;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
}

export interface IndividualToolCallDisplay {
  callId: string;
  name: string;
  description: string;
  resultDisplay: ToolResultDisplay | undefined;
  status: ToolCallStatus;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
  renderOutputAsMarkdown?: boolean;
}

export interface CompressionProps {
  isPending: boolean;
  originalTokenCount: number | null;
  newTokenCount: number | null;
}

export interface HistoryItemBase {
  text?: string; // 用户/gemini/信息/错误消息的文本内容
}

export type HistoryItemUser = HistoryItemBase & {
  type: 'user';
  text: string;
};

export type HistoryItemGemini = HistoryItemBase & {
  type: 'gemini';
  text: string;
};

export type HistoryItemGeminiContent = HistoryItemBase & {
  type: 'gemini_content';
  text: string;
};

export type HistoryItemInfo = HistoryItemBase & {
  type: 'info';
  text: string;
};

export type HistoryItemError = HistoryItemBase & {
  type: 'error';
  text: string;
};

export type HistoryItemAbout = HistoryItemBase & {
  type: 'about';
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion: string;
  selectedAuthType: string;
  gcpProject: string;
};

export type HistoryItemStats = HistoryItemBase & {
  type: 'stats';
  duration: string;
};

export type HistoryItemModelStats = HistoryItemBase & {
  type: 'model_stats';
};

export type HistoryItemToolStats = HistoryItemBase & {
  type: 'tool_stats';
};

export type HistoryItemQuit = HistoryItemBase & {
  type: 'quit';
  duration: string;
};

export type HistoryItemToolGroup = HistoryItemBase & {
  type: 'tool_group';
  tools: IndividualToolCallDisplay[];
};

export type HistoryItemUserShell = HistoryItemBase & {
  type: 'user_shell';
  text: string;
};

export type HistoryItemCompression = HistoryItemBase & {
  type: 'compression';
  compression: CompressionProps;
};

// 使用 Omit<HistoryItem, 'id'> 似乎在TypeScript的类型推断中有一些问题，
// 例如 historyItem.type === 'tool_group' 并不会自动推断出 historyItem 中的 'tools'。
// 单独导出扩展自 HistoryItemBase 的类型
export type HistoryItemWithoutId =
  | HistoryItemUser
  | HistoryItemUserShell
  | HistoryItemGemini
  | HistoryItemGeminiContent
  | HistoryItemInfo
  | HistoryItemError
  | HistoryItemAbout
  | HistoryItemToolGroup
  | HistoryItemStats
  | HistoryItemModelStats
  | HistoryItemToolStats
  | HistoryItemQuit
  | HistoryItemCompression;

export type HistoryItem = HistoryItemWithoutId & { id: number };

// 内部命令反馈使用的消息类型（HistoryItem 类型的子集）
export enum MessageType {
  INFO = 'info',
  ERROR = 'error',
  USER = 'user',
  ABOUT = 'about',
  STATS = 'stats',
  MODEL_STATS = 'model_stats',
  TOOL_STATS = 'tool_stats',
  QUIT = 'quit',
  GEMINI = 'gemini',
  COMPRESSION = 'compression',
}

// 用于内部反馈的简化消息结构
export type Message =
  | {
      type: MessageType.INFO | MessageType.ERROR | MessageType.USER;
      content: string; // 为在此上下文中更清晰而从 text 重命名
      timestamp: Date;
    }
  | {
      type: MessageType.ABOUT;
      timestamp: Date;
      cliVersion: string;
      osVersion: string;
      sandboxEnv: string;
      modelVersion: string;
      selectedAuthType: string;
      gcpProject: string;
      content?: string; // 可选内容，ABOUT 中实际上未使用
    }
  | {
      type: MessageType.STATS;
      timestamp: Date;
      duration: string;
      content?: string;
    }
  | {
      type: MessageType.MODEL_STATS;
      timestamp: Date;
      content?: string;
    }
  | {
      type: MessageType.TOOL_STATS;
      timestamp: Date;
      content?: string;
    }
  | {
      type: MessageType.QUIT;
      timestamp: Date;
      duration: string;
      content?: string;
    }
  | {
      type: MessageType.COMPRESSION;
      compression: CompressionProps;
      timestamp: Date;
    };

export interface ConsoleMessageItem {
  type: 'log' | 'warn' | 'error' | 'debug';
  content: string;
  count: number;
}

/**
 * 定义斜杠命令处理器为其使用者（useGeminiStream）返回的结果。
 */
export type SlashCommandProcessorResult =
  | {
      type: 'schedule_tool';
      toolName: string;
      toolArgs: Record<string, unknown>;
    }
  | {
      type: 'handled'; // 表示命令已被处理，无需进一步操作。
    };