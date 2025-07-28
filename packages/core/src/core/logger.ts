/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Content } from '@google/genai';
import { getProjectTempDir } from '../utils/paths.js';

const LOG_FILE_NAME = 'logs.json';

export enum MessageSenderType {
  USER = 'user',
}

export interface LogEntry {
  sessionId: string;
  messageId: number;
  timestamp: string;
  type: MessageSenderType;
  message: string;
}

export class Logger {
  private iflycodeDir: string | undefined;
  private logFilePath: string | undefined;
  private sessionId: string | undefined;
  private messageId = 0; // 实例特定的计数器，用于下一个 messageId
  private initialized = false;
  private logs: LogEntry[] = []; // 内存缓存，理想情况下反映文件的最后已知状态

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  private async _readLogFile(): Promise<LogEntry[]> {
    if (!this.logFilePath) {
      throw new Error('尝试读取时日志文件路径未设置。');
    }
    try {
      const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
      const parsedLogs = JSON.parse(fileContent);
      if (!Array.isArray(parsedLogs)) {
        console.debug(
          `路径 ${this.logFilePath} 处的日志文件不是有效的 JSON 数组。从空日志开始。`,
        );
        await this._backupCorruptedLogFile('malformed_array');
        return [];
      }
      return parsedLogs.filter(
        (entry) =>
          typeof entry.sessionId === 'string' &&
          typeof entry.messageId === 'number' &&
          typeof entry.timestamp === 'string' &&
          typeof entry.type === 'string' &&
          typeof entry.message === 'string',
      ) as LogEntry[];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }
      if (error instanceof SyntaxError) {
        console.debug(
          `日志文件 ${this.logFilePath} 中存在无效 JSON。备份并重新开始。`,
          error,
        );
        await this._backupCorruptedLogFile('invalid_json');
        return [];
      }
      console.debug(
        `读取或解析日志文件 ${this.logFilePath} 失败：`,
        error,
      );
      throw error;
    }
  }

  private async _backupCorruptedLogFile(reason: string): Promise<void> {
    if (!this.logFilePath) return;
    const backupPath = `${this.logFilePath}.${reason}.${Date.now()}.bak`;
    try {
      await fs.rename(this.logFilePath, backupPath);
      console.debug(`已将损坏的日志文件备份到 ${backupPath}`);
    } catch (_backupError) {
      // 如果重命名失败（例如文件不存在），此处无需记录错误，因为主要错误（例如无效 JSON）已经处理。
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.iflycodeDir = getProjectTempDir(process.cwd());
    this.logFilePath = path.join(this.iflycodeDir, LOG_FILE_NAME);

    try {
      await fs.mkdir(this.iflycodeDir, { recursive: true });
      let fileExisted = true;
      try {
        await fs.access(this.logFilePath);
      } catch (_e) {
        fileExisted = false;
      }
      this.logs = await this._readLogFile();
      if (!fileExisted && this.logs.length === 0) {
        await fs.writeFile(this.logFilePath, '[]', 'utf-8');
      }
      const sessionLogs = this.logs.filter(
        (entry) => entry.sessionId === this.sessionId,
      );
      this.messageId =
        sessionLogs.length > 0
          ? Math.max(...sessionLogs.map((entry) => entry.messageId)) + 1
          : 0;
      this.initialized = true;
    } catch (err) {
      console.error('初始化日志记录器失败：', err);
      this.initialized = false;
    }
  }

  private async _updateLogFile(
    entryToAppend: LogEntry,
  ): Promise<LogEntry | null> {
    if (!this.logFilePath) {
      console.debug('日志文件路径未设置。无法持久化日志条目。');
      throw new Error('尝试更新时日志文件路径未设置。');
    }

    let currentLogsOnDisk: LogEntry[];
    try {
      currentLogsOnDisk = await this._readLogFile();
    } catch (readError) {
      console.debug(
        '追加前读取日志文件时发生严重错误：',
        readError,
      );
      throw readError;
    }

    // 根据当前磁盘状态为其会话确定新条目的正确 messageId
    const sessionLogsOnDisk = currentLogsOnDisk.filter(
      (e) => e.sessionId === entryToAppend.sessionId,
    );
    const nextMessageIdForSession =
      sessionLogsOnDisk.length > 0
        ? Math.max(...sessionLogsOnDisk.map((e) => e.messageId)) + 1
        : 0;

    // 更新即将追加的条目的 messageId
    entryToAppend.messageId = nextMessageIdForSession;

    // 检查此条目（相同会话，相同 *重新计算的* messageId，相同内容）是否可能已存在
    // 如果多个实例尝试在完全相同的计算 messageId 插槽中记录完全相同的内容，
    // 这是一个更严格的真正重复项检查。
    const entryExists = currentLogsOnDisk.some(
      (e) =>
        e.sessionId === entryToAppend.sessionId &&
        e.messageId === entryToAppend.messageId &&
        e.timestamp === entryToAppend.timestamp && // 时间戳有助于区分
        e.message === entryToAppend.message,
    );

    if (entryExists) {
      console.debug(
        `检测到重复的日志条目并跳过：会话 ${entryToAppend.sessionId}，messageId ${entryToAppend.messageId}`,
      );
      this.logs = currentLogsOnDisk; // 确保内存与磁盘同步
      return null; // 表示实际上没有添加新条目
    }

    currentLogsOnDisk.push(entryToAppend);

    try {
      await fs.writeFile(
        this.logFilePath,
        JSON.stringify(currentLogsOnDisk, null, 2),
        'utf-8',
      );
      this.logs = currentLogsOnDisk;
      return entryToAppend; // 返回成功追加的条目
    } catch (error) {
      console.debug('写入日志文件时出错：', error);
      throw error;
    }
  }

  async getPreviousUserMessages(): Promise<string[]> {
    if (!this.initialized) return [];
    return this.logs
      .filter((entry) => entry.type === MessageSenderType.USER)
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA;
      })
      .map((entry) => entry.message);
  }

  async logMessage(type: MessageSenderType, message: string): Promise<void> {
    if (!this.initialized || this.sessionId === undefined) {
      console.debug(
        '日志记录器未初始化或缺少会话 ID。无法记录消息。',
      );
      return;
    }

    // 此处使用的 messageId 是实例对下一个 ID 的理解。
    // _updateLogFile 将根据文件的实际状态验证并可能重新计算。
    const newEntryObject: LogEntry = {
      sessionId: this.sessionId,
      messageId: this.messageId, // 这将在 _updateLogFile 中重新计算
      type,
      message,
      timestamp: new Date().toISOString(),
    };

    try {
      const writtenEntry = await this._updateLogFile(newEntryObject);
      if (writtenEntry) {
        // 如果实际写入了一个条目（不是重复跳过），
        // 那么此实例可以递增其对此会话的下一个 messageId 的理解。
        this.messageId = writtenEntry.messageId + 1;
      }
    } catch (_error) {
      // 错误已由 _updateLogFile 或 _readLogFile 记录
    }
  }

  _checkpointPath(tag: string): string {
    if (!tag.length) {
      throw new Error('未指定检查点标签。');
    }
    if (!this.iflycodeDir) {
      throw new Error('检查点文件路径未设置。');
    }
    return path.join(this.iflycodeDir, `checkpoint-${tag}.json`);
  }

  async saveCheckpoint(conversation: Content[], tag: string): Promise<void> {
    if (!this.initialized) {
      console.error(
        '日志记录器未初始化或检查点文件路径未设置。无法保存检查点。',
      );
      return;
    }
    const path = this._checkpointPath(tag);
    try {
      await fs.writeFile(path, JSON.stringify(conversation, null, 2), 'utf-8');
    } catch (error) {
      console.error('写入检查点文件时出错：', error);
    }
  }

  async loadCheckpoint(tag: string): Promise<Content[]> {
    if (!this.initialized) {
      console.error(
        '日志记录器未初始化或检查点文件路径未设置。无法加载检查点。',
      );
      return [];
    }

    const path = this._checkpointPath(tag);
    try {
      const fileContent = await fs.readFile(path, 'utf-8');
      const parsedContent = JSON.parse(fileContent);
      if (!Array.isArray(parsedContent)) {
        console.warn(
          `路径 ${path} 处的检查点文件不是有效的 JSON 数组。返回空检查点。`,
        );
        return [];
      }
      return parsedContent as Content[];
    } catch (error) {
      console.error(`读取或解析检查点文件 ${path} 失败：`, error);
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        // 文件不存在，这是正常的。返回空数组。
        return [];
      }
      return [];
    }
  }

  close(): void {
    this.initialized = false;
    this.logFilePath = undefined;
    this.logs = [];
    this.sessionId = undefined;
    this.messageId = 0;
  }
}