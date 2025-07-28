/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  executeToolCall,
  ToolRegistry,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  ToolResultDisplay,
} from '@iflytek/iflycode-core';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
} from '@google/genai';

import { parseAndFormatApiError } from './ui/utils/errorParsing.js';

function getResponseText(response: GenerateContentResponse): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      // 我们在无头模式下运行，因此无需将思考内容返回到 STDOUT。
      const thoughtPart = candidate.content.parts[0];
      if (thoughtPart?.thought) {
        return null;
      }
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

// 辅助函数，用于格式化工具调用参数以供显示
function formatToolArgs(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) {
    return '(无参数)';
  }

  const formattedArgs = Object.entries(args)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}: "${value}"`;
      } else if (typeof value === 'object' && value !== null) {
        return `${key}: ${JSON.stringify(value)}`;
      } else {
        return `${key}: ${value}`;
      }
    })
    .join(', ');

  return `(${formattedArgs})`;
}
// 辅助函数，用于显示工具调用信息
function displayToolCallInfo(
  toolName: string,
  args: Record<string, unknown>,
  status: 'start' | 'success' | 'error',
  resultDisplay?: ToolResultDisplay,
  errorMessage?: string,
): void {
  const timestamp = new Date().toLocaleTimeString();
  const argsStr = formatToolArgs(args);

  switch (status) {
    case 'start':
      process.stdout.write(
        `\n[${timestamp}] 🔧 正在执行工具: ${toolName} ${argsStr}\n`,
      );
      break;
    case 'success':
      if (resultDisplay) {
        if (typeof resultDisplay === 'string' && resultDisplay.trim()) {
          process.stdout.write(
            `[${timestamp}] ✅ 工具 ${toolName} 成功完成\n`,
          );
          process.stdout.write(`📋 结果:\n${resultDisplay}\n`);
        } else if (
          typeof resultDisplay === 'object' &&
          'fileDiff' in resultDisplay
        ) {
          process.stdout.write(
            `[${timestamp}] ✅ 工具 ${toolName} 成功完成\n`,
          );
          process.stdout.write(`📋 文件: ${resultDisplay.fileName}\n`);
          process.stdout.write(`📋 差异:\n${resultDisplay.fileDiff}\n`);
        } else {
          process.stdout.write(
            `[${timestamp}] ✅ 工具 ${toolName} 成功完成 (无输出)\n`,
          );
        }
      } else {
        process.stdout.write(
          `[${timestamp}] ✅ 工具 ${toolName} 成功完成 (无输出)\n`,
        );
      }
      break;
    case 'error':
      process.stdout.write(
        `[${timestamp}] ❌ 工具 ${toolName} 失败: ${errorMessage}\n`,
      );
      break;
    default:
      process.stdout.write(
        `[${timestamp}] ⚠️ 工具 ${toolName} 报告未知状态: ${status}\n`,
      );
      break;
  }
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  await config.initialize();
  // 处理当输出被管道传输到提前关闭的命令时的 EPIPE 错误。
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      // 如果管道已关闭，则正常退出。
      process.exit(0);
    }
  });

  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();

  const chat = await geminiClient.getChat();
  const abortController = new AbortController();
  let currentMessages: Content[] = [{ role: 'user', parts: [{ text: input }] }];
  let turnCount = 0;
  try {
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() > 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        console.error(
          '\n 已达到此会话的最大轮次。通过在 settings.json 中指定 maxSessionTurns 来增加轮次数量。',
        );
        return;
      }
      const functionCalls: FunctionCall[] = [];

      const responseStream = await chat.sendMessageStream(
        {
          message: currentMessages[0]?.parts || [], // 确保始终提供 parts
          config: {
            abortSignal: abortController.signal,
            tools: [
              { functionDeclarations: toolRegistry.getFunctionDeclarations() },
            ],
          },
        },
        prompt_id,
      );

      for await (const resp of responseStream) {
        if (abortController.signal.aborted) {
          console.error('操作已取消。');
          return;
        }
        const textPart = getResponseText(resp);
        if (textPart) {
          process.stdout.write(textPart);
        }
        if (resp.functionCalls) {
          functionCalls.push(...resp.functionCalls);
        }
      }

      if (functionCalls.length > 0) {
        const toolResponseParts: Part[] = [];

        for (const fc of functionCalls) {
          const callId = fc.id ?? `${fc.name}-${Date.now()}`;
          const requestInfo: ToolCallRequestInfo = {
            callId,
            name: fc.name as string,
            args: (fc.args ?? {}) as Record<string, unknown>,
            isClientInitiated: false,
            prompt_id,
          };

          // 显示工具调用开始信息
          displayToolCallInfo(fc.name as string, fc.args ?? {}, 'start');

          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            toolRegistry,
            abortController.signal,
          );

          if (toolResponse.error) {
            // 显示工具调用错误信息
            const errorMessage =
              typeof toolResponse.resultDisplay === 'string'
                ? toolResponse.resultDisplay
                : toolResponse.error?.message;

            displayToolCallInfo(
              fc.name as string,
              fc.args ?? {},
              'error',
              undefined,
              errorMessage,
            );

            const isToolNotFound = toolResponse.error.message.includes(
              'not found in registry',
            );
            console.error(
              `执行工具 ${fc.name} 时出错: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
            if (!isToolNotFound) {
              process.exit(1);
            }
          } else {
            // 显示工具调用成功信息
            displayToolCallInfo(
              fc.name as string,
              fc.args ?? {},
              'success',
              toolResponse.resultDisplay,
            );
          }

          if (toolResponse.responseParts) {
            const parts = Array.isArray(toolResponse.responseParts)
              ? toolResponse.responseParts
              : [toolResponse.responseParts];
            for (const part of parts) {
              if (typeof part === 'string') {
                toolResponseParts.push({ text: part });
              } else if (part) {
                toolResponseParts.push(part);
              }
            }
          }
        }
        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        process.stdout.write('\n'); // 确保最后有一个换行符
        return;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    process.exit(1);
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}