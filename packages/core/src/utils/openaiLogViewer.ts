/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { openaiLogger } from './openaiLogger.js';

/**
 * 用于查看和管理 OpenAI 日志的 CLI 工具
 */
export class OpenAILogViewer {
  /**
   * 列出所有可用的 OpenAI 日志
   * @param limit 可选参数，限制显示的日志数量
   */
  static async listLogs(limit?: number): Promise<void> {
    try {
      const logs = await openaiLogger.getLogFiles(limit);

      if (logs.length === 0) {
        console.log('未找到 OpenAI 日志');
        return;
      }

      console.log(`找到 ${logs.length} 个 OpenAI 日志：`);
      for (let i = 0; i < logs.length; i++) {
        const filePath = logs[i];
        const filename = path.basename(filePath);
        const logData = await openaiLogger.readLogFile(filePath);

        // 类型守卫，确保 logData 是对象
        if (typeof logData !== 'object' || logData === null) {
          console.log(`${i + 1}. ${filename} - 日志数据无效`);
          continue;
        }
        const data = logData as Record<string, unknown>;

        // 格式化日志条目摘要
        const requestType = getRequestType(data.request);
        const status = data.error ? 'ERROR' : 'OK';

        console.log(
          `${i + 1}. ${filename} - ${requestType} - ${status} - ${data.timestamp}`,
        );
      }
    } catch (error) {
      console.error('列出日志时出错：', error);
    }
  }

  /**
   * 查看特定日志文件的详细信息
   * @param identifier 日志索引（从 1 开始）或文件名
   */
  static async viewLog(identifier: number | string): Promise<void> {
    try {
      let logFile: string | undefined;
      const logs = await openaiLogger.getLogFiles();

      if (logs.length === 0) {
        console.log('未找到 OpenAI 日志');
        return;
      }

      if (typeof identifier === 'number') {
        // 调整为从 1 开始的索引
        if (identifier < 1 || identifier > logs.length) {
          console.error(
            `无效的日志索引。请提供一个介于 1 和 ${logs.length} 之间的数字`,
          );
          return;
        }
        logFile = logs[identifier - 1];
      } else {
        // 按文件名查找
        logFile = logs.find((log) => path.basename(log) === identifier);
        if (!logFile) {
          console.error(`未找到日志文件 '${identifier}'`);
          return;
        }
      }

      const logData = await openaiLogger.readLogFile(logFile);
      console.log(JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error('查看日志时出错：', error);
    }
  }

  /**
   * 清理旧日志，仅保留最近的日志
   * @param keepCount 要保留的最近日志数量
   */
  static async cleanupLogs(keepCount: number = 50): Promise<void> {
    try {
      const allLogs = await openaiLogger.getLogFiles();

      if (allLogs.length === 0) {
        console.log('未找到 OpenAI 日志');
        return;
      }

      if (allLogs.length <= keepCount) {
        console.log(`仅有 ${allLogs.length} 个日志，无需清理`);
        return;
      }

      const logsToDelete = allLogs.slice(keepCount);
      const fs = await import('node:fs/promises');

      for (const log of logsToDelete) {
        await fs.unlink(log);
      }

      console.log(
        `已删除 ${logsToDelete.length} 个旧日志文件。保留了 ${keepCount} 个最近的日志。`,
      );
    } catch (error) {
      console.error('清理日志时出错：', error);
    }
  }
}

/**
 * 辅助函数，用于确定日志中的请求类型
 */
function getRequestType(request: unknown): string {
  if (!request) return 'unknown';

  if (typeof request !== 'object' || request === null) return 'unknown';
  const req = request as Record<string, unknown>;

  if (req.contents) {
    return 'generate_content';
  } else if (typeof req.model === 'string' && req.model.includes('embedding')) {
    return 'embedding';
  } else if (req.input) {
    return 'embedding';
  } else if ('countTokens' in req || 'contents' in req) {
    return 'count_tokens';
  }

  return 'api_call';
}

// 当脚本直接运行时的 CLI 接口
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase();

    switch (command) {
      case 'list': {
        const limit = args[1] ? parseInt(args[1], 10) : undefined;
        await OpenAILogViewer.listLogs(limit);
        break;
      }

      case 'view': {
        const identifier = args[1];
        if (!identifier) {
          console.error('请提供要查看的日志索引或文件名');
          process.exit(1);
        }
        await OpenAILogViewer.viewLog(
          isNaN(Number(identifier)) ? identifier : Number(identifier),
        );
        break;
      }

      case 'cleanup': {
        const keepCount = args[1] ? parseInt(args[1], 10) : 50;
        await OpenAILogViewer.cleanupLogs(keepCount);
        break;
      }

      default:
        console.log('OpenAI 日志查看器');
        console.log('----------------');
        console.log('命令：');
        console.log(
          '  list [limit]        - 列出所有日志，可选择限制显示数量',
        );
        console.log(
          '  view <index|file>   - 通过索引号或文件名查看特定日志',
        );
        console.log(
          '  cleanup [keepCount] - 删除旧日志，仅保留指定数量（默认：50）',
        );
        break;
    }
  }

  main().catch(console.error);
}

export default OpenAILogViewer;