/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';

/**
 * 专门用于记录 OpenAI API 请求和响应的日志记录器
 */
export class OpenAILogger {
  private logDir: string;
  private initialized: boolean = false;

  /**
   * 创建一个新的 OpenAI 日志记录器
   * @param customLogDir 可选的自定义日志目录路径
   */
  constructor(customLogDir?: string) {
    this.logDir = customLogDir || path.join(process.cwd(), 'logs', 'openai');
  }

  /**
   * 通过创建日志目录来初始化日志记录器（如果目录不存在）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      console.error('初始化 OpenAI 日志记录器失败:', error);
      throw new Error(`初始化 OpenAI 日志记录器失败: ${error}`);
    }
  }

  /**
   * 记录 OpenAI API 请求及其响应
   * @param request 发送到 OpenAI 的请求
   * @param response 从 OpenAI 接收到的响应
   * @param error 请求失败时的可选错误信息
   * @returns 写入日志的文件路径
   */
  async logInteraction(
    request: unknown,
    response?: unknown,
    error?: Error,
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const id = uuidv4().slice(0, 8);
    const filename = `openai-${timestamp}-${id}.json`;
    const filePath = path.join(this.logDir, filename);

    const logData = {
      timestamp: new Date().toISOString(),
      request,
      response: response || null,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
          }
        : null,
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        nodeVersion: process.version,
      },
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(logData, null, 2), 'utf-8');
      return filePath;
    } catch (writeError) {
      console.error('写入 OpenAI 日志文件失败:', writeError);
      throw new Error(`写入 OpenAI 日志文件失败: ${writeError}`);
    }
  }

  /**
   * 获取所有已记录的交互日志
   * @param limit 可选的返回日志文件数量限制（按最新排序）
   * @returns 日志文件路径数组
   */
  async getLogFiles(limit?: number): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter((file) => file.startsWith('openai-') && file.endsWith('.json'))
        .map((file) => path.join(this.logDir, file))
        .sort()
        .reverse();

      return limit ? logFiles.slice(0, limit) : logFiles;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      console.error('读取 OpenAI 日志目录失败:', error);
      return [];
    }
  }

  /**
   * 读取特定的日志文件
   * @param filePath 日志文件的路径
   * @returns 日志文件内容
   */
  async readLogFile(filePath: string): Promise<unknown> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`读取日志文件 ${filePath} 失败:`, error);
      throw new Error(`读取日志文件失败: ${error}`);
    }
  }
}

// 创建单例实例以便于导入
export const openaiLogger = new OpenAILogger();