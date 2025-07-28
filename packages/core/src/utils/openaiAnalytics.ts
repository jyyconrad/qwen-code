/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { openaiLogger } from './openaiLogger.js';

/**
 * OpenAI API 使用情况分析
 *
 * 此工具分析 OpenAI API 日志以提供 API 使用模式、成本和性能的洞察。
 */
export class OpenAIAnalytics {
  /**
   * 计算 OpenAI API 使用情况的统计数据
   * @param days 要分析的天数（默认：7）
   */
  static async calculateStats(days: number = 7): Promise<{
    totalRequests: number;
    successRate: number;
    avgResponseTime: number;
    requestsByModel: Record<string, number>;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    estimatedCost: number;
    errorRates: Record<string, number>;
    timeDistribution: Record<string, number>;
  }> {
    const logs = await openaiLogger.getLogFiles();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    let totalRequests = 0;
    let successfulRequests = 0;
    const totalResponseTime = 0;
    const requestsByModel: Record<string, number> = {};
    const tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const errorTypes: Record<string, number> = {};
    const hourDistribution: Record<string, number> = {};

    // 初始化小时分布（0-23）
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, '0');
      hourDistribution[hour] = 0;
    }

    // 模型定价估算（每1000个token）
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-32k': { input: 0.06, output: 0.12 },
      'gpt-4-1106-preview': { input: 0.01, output: 0.03 },
      'gpt-4-0125-preview': { input: 0.01, output: 0.03 },
      'gpt-4-0613': { input: 0.03, output: 0.06 },
      'gpt-4-32k-0613': { input: 0.06, output: 0.12 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
      'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
      'gpt-3.5-turbo-0613': { input: 0.0015, output: 0.002 },
      'gpt-3.5-turbo-16k-0613': { input: 0.003, output: 0.004 },
    };

    // 未知模型的默认定价
    const defaultPricing = { input: 0.01, output: 0.03 };

    let estimatedCost = 0;

    for (const logFile of logs) {
      try {
        const logData = await openaiLogger.readLogFile(logFile);

        // 类型守卫检查 logData 是否具有预期结构
        if (!isObjectWith<{ timestamp: string }>(logData, ['timestamp'])) {
          continue; // 跳过格式错误的日志
        }

        const logDate = new Date(logData.timestamp);

        // 如果日志早于截止日期则跳过
        if (logDate < cutoffDate) {
          continue;
        }

        totalRequests++;
        const hour = logDate.getUTCHours().toString().padStart(2, '0');
        hourDistribution[hour]++;

        // 检查请求是否成功
        if (
          isObjectWith<{ response?: unknown; error?: unknown }>(logData, [
            'response',
            'error',
          ]) &&
          logData.response &&
          !logData.error
        ) {
          successfulRequests++;

          // 提取模型（如果可用）
          const model = getModelFromLog(logData);
          if (model) {
            requestsByModel[model] = (requestsByModel[model] || 0) + 1;
          }

          // 提取 token 使用情况（如果可用）
          const usage = getTokenUsageFromLog(logData);
          if (usage) {
            tokenUsage.promptTokens += usage.prompt_tokens || 0;
            tokenUsage.completionTokens += usage.completion_tokens || 0;
            tokenUsage.totalTokens += usage.total_tokens || 0;

            // 如果模型已知则计算成本
            const modelName = model || 'unknown';
            const modelPricing = pricing[modelName] || defaultPricing;

            const inputCost =
              ((usage.prompt_tokens || 0) / 1000) * modelPricing.input;
            const outputCost =
              ((usage.completion_tokens || 0) / 1000) * modelPricing.output;
            estimatedCost += inputCost + outputCost;
          }
        } else if (
          isObjectWith<{ error?: unknown }>(logData, ['error']) &&
          logData.error
        ) {
          // 分类错误
          const errorType = getErrorTypeFromLog(logData);
          errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
        }
      } catch (error) {
        console.error(`处理日志文件 ${logFile} 时出错:`, error);
      }
    }

    // 计算成功率和平均响应时间
    const successRate =
      totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    const avgResponseTime =
      totalRequests > 0 ? totalResponseTime / totalRequests : 0;

    // 将错误率计算为百分比
    const errorRates: Record<string, number> = {};
    for (const [errorType, count] of Object.entries(errorTypes)) {
      errorRates[errorType] =
        totalRequests > 0 ? (count / totalRequests) * 100 : 0;
    }

    return {
      totalRequests,
      successRate,
      avgResponseTime,
      requestsByModel,
      tokenUsage,
      estimatedCost,
      errorRates,
      timeDistribution: hourDistribution,
    };
  }

  /**
   * 生成 OpenAI API 使用情况的人类可读报告
   * @param days 报告中包含的天数
   */
  static async generateReport(days: number = 7): Promise<string> {
    const stats = await this.calculateStats(days);

    let report = `# OpenAI API 使用情况报告\n`;
    report += `## 最近 ${days} 天 (${new Date().toISOString().split('T')[0]})\n\n`;

    report += `### 概览\n`;
    report += `- 总请求数: ${stats.totalRequests}\n`;
    report += `- 成功率: ${stats.successRate.toFixed(2)}%\n`;
    report += `- 预估成本: $${stats.estimatedCost.toFixed(2)}\n\n`;

    report += `### Token 使用情况\n`;
    report += `- 提示 Token: ${stats.tokenUsage.promptTokens.toLocaleString()}\n`;
    report += `- 完成 Token: ${stats.tokenUsage.completionTokens.toLocaleString()}\n`;
    report += `- 总 Token: ${stats.tokenUsage.totalTokens.toLocaleString()}\n\n`;

    report += `### 使用的模型\n`;
    const sortedModels = Object.entries(stats.requestsByModel) as Array<
      [string, number]
    >;
    sortedModels.sort((a, b) => b[1] - a[1]);

    for (const [model, count] of sortedModels) {
      const percentage = ((count / stats.totalRequests) * 100).toFixed(1);
      report += `- ${model}: ${count} 个请求 (${percentage}%)\n`;
    }

    if (Object.keys(stats.errorRates).length > 0) {
      report += `\n### 错误类型\n`;
      const sortedErrors = Object.entries(stats.errorRates) as Array<
        [string, number]
      >;
      sortedErrors.sort((a, b) => b[1] - a[1]);

      for (const [errorType, rate] of sortedErrors) {
        report += `- ${errorType}: ${rate.toFixed(1)}%\n`;
      }
    }

    report += `\n### 按小时使用情况 (UTC)\n`;
    report += `\`\`\`\n`;
    const maxRequests = Math.max(...Object.values(stats.timeDistribution));
    const scale = 40; // 最大条形长度

    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, '0');
      const requests = stats.timeDistribution[hour] || 0;
      const barLength =
        maxRequests > 0 ? Math.round((requests / maxRequests) * scale) : 0;
      const bar = '█'.repeat(barLength);
      report += `${hour}:00 ${bar.padEnd(scale)} ${requests}\n`;
    }
    report += `\`\`\`\n`;

    return report;
  }

  /**
   * 将分析报告保存到文件
   * @param days 包含的天数
   * @param outputPath 报告的文件路径（默认为 logs/openai/analytics.md）
   */
  static async saveReport(
    days: number = 7,
    outputPath?: string,
  ): Promise<string> {
    const report = await this.generateReport(days);
    const reportPath =
      outputPath || path.join(process.cwd(), 'logs', 'openai', 'analytics.md');

    await fs.writeFile(reportPath, report, 'utf-8');
    return reportPath;
  }
}

function isObjectWith<T extends object>(
  obj: unknown,
  keys: Array<keyof T>,
): obj is T {
  return (
    typeof obj === 'object' && obj !== null && keys.every((key) => key in obj)
  );
}

/**
 * 从日志条目中提取模型名称
 */
function getModelFromLog(logData: unknown): string | undefined {
  if (
    isObjectWith<{
      request?: { model?: string };
      response?: { model?: string; modelVersion?: string };
    }>(logData, ['request', 'response'])
  ) {
    const data = logData as {
      request?: { model?: string };
      response?: { model?: string; modelVersion?: string };
    };
    if (data.request && data.request.model) return data.request.model;
    if (data.response && data.response.model) return data.response.model;
    if (data.response && data.response.modelVersion)
      return data.response.modelVersion;
  }
  return undefined;
}

/**
 * 从日志条目中提取 token 使用信息
 */
function getTokenUsageFromLog(logData: unknown):
  | {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    }
  | undefined {
  if (
    isObjectWith<{
      response?: {
        usage?: object;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };
    }>(logData, ['response'])
  ) {
    const data = logData as {
      response?: {
        usage?: object;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };
    };
    if (data.response && data.response.usage) return data.response.usage;
    if (data.response && data.response.usageMetadata) {
      const metadata = data.response.usageMetadata;
      return {
        prompt_tokens: metadata.promptTokenCount,
        completion_tokens: metadata.candidatesTokenCount,
        total_tokens: metadata.totalTokenCount,
      };
    }
  }
  return undefined;
}

/**
 * 从日志条目中提取并分类错误类型
 */
function getErrorTypeFromLog(logData: unknown): string {
  if (isObjectWith<{ error?: { message?: string } }>(logData, ['error'])) {
    const data = logData as { error?: { message?: string } };
    if (data.error) {
      const errorMsg = data.error.message || '';
      if (errorMsg.includes('rate limit')) return 'rate_limit';
      if (errorMsg.includes('timeout')) return 'timeout';
      if (errorMsg.includes('authentication')) return 'authentication';
      if (errorMsg.includes('quota')) return 'quota_exceeded';
      if (errorMsg.includes('invalid')) return 'invalid_request';
      if (errorMsg.includes('not available')) return 'model_unavailable';
      if (errorMsg.includes('content filter')) return 'content_filtered';
      return 'other';
    }
  }
  return 'unknown';
}

// 当脚本直接运行时的 CLI 接口
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const args = process.argv.slice(2);
    const days = args[0] ? parseInt(args[0], 10) : 7;

    try {
      const reportPath = await OpenAIAnalytics.saveReport(days);
      console.log(`分析报告已保存到: ${reportPath}`);

      // 同时打印到控制台
      const report = await OpenAIAnalytics.generateReport(days);
      console.log(report);
    } catch (error) {
      console.error('生成分析报告时出错:', error);
    }
  }

  main().catch(console.error);
}

export default OpenAIAnalytics;