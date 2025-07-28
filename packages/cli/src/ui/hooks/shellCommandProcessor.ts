/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import type { HistoryItemWithoutId } from '../types.js';
import { useCallback } from 'react';
import { Config, GeminiClient } from '@iflytek/iflycode-core';
import { type PartListUnion } from '@google/genai';
import { formatMemoryUsage } from '../utils/formatters.js';
import { isBinary } from '../utils/textUtils.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import stripAnsi from 'strip-ansi';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const MAX_OUTPUT_LENGTH = 10000;

/**
 * Shell 命令执行的结构化结果。
 */
interface ShellExecutionResult {
  rawOutput: Buffer;
  output: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
  aborted: boolean;
}

/**
 * 使用 `spawn` 执行 shell 命令，捕获所有输出和生命周期事件。
 * 这是 shell 执行的统一实现。
 *
 * @param commandToExecute 要运行的确切命令字符串。
 * @param cwd 执行命令的工作目录。
 * @param abortSignal 用于终止进程的 AbortSignal。
 * @param onOutputChunk 流式实时输出的回调。
 * @param onDebugMessage 记录调试信息的回调。
 * @returns 解析为完整执行结果的 Promise。
 */
function executeShellCommand(
  commandToExecute: string,
  cwd: string,
  abortSignal: AbortSignal,
  onOutputChunk: (chunk: string) => void,
  onDebugMessage: (message: string) => void,
): Promise<ShellExecutionResult> {
  return new Promise((resolve) => {
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : 'bash';
    const shellArgs = isWindows
      ? ['/c', commandToExecute]
      : ['-c', commandToExecute];

    const child = spawn(shell, shellArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows, // 在非 Windows 上使用进程组以实现可靠的终止
    });

    // 使用解码器安全处理多字节字符（用于流式输出）。
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    let stdout = '';
    let stderr = '';
    const outputChunks: Buffer[] = [];
    let error: Error | null = null;
    let exited = false;

    let streamToUi = true;
    const MAX_SNIFF_SIZE = 4096;
    let sniffedBytes = 0;

    const handleOutput = (data: Buffer, stream: 'stdout' | 'stderr') => {
      outputChunks.push(data);

      if (streamToUi && sniffedBytes < MAX_SNIFF_SIZE) {
        // 使用有限大小的缓冲区进行检查以避免性能问题。
        const sniffBuffer = Buffer.concat(outputChunks.slice(0, 20));
        sniffedBytes = sniffBuffer.length;

        if (isBinary(sniffBuffer)) {
          streamToUi = false;
          // 用清晰的消息覆盖可能已流式传输的乱码文本。
          onOutputChunk('[检测到二进制输出。停止流式传输...]');
        }
      }

      const decodedChunk =
        stream === 'stdout'
          ? stdoutDecoder.write(data)
          : stderrDecoder.write(data);
      if (stream === 'stdout') {
        stdout += stripAnsi(decodedChunk);
      } else {
        stderr += stripAnsi(decodedChunk);
      }

      if (!exited && streamToUi) {
        // 仅发送新块以避免重新渲染整个输出。
        const combinedOutput = stdout + (stderr ? `\n${stderr}` : '');
        onOutputChunk(combinedOutput);
      } else if (!exited && !streamToUi) {
        // 发送二进制流的进度更新
        const totalBytes = outputChunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        onOutputChunk(
          `[正在接收二进制输出... 已接收 ${formatMemoryUsage(totalBytes)}]`,
        );
      }
    };

    child.stdout.on('data', (data) => handleOutput(data, 'stdout'));
    child.stderr.on('data', (data) => handleOutput(data, 'stderr'));
    child.on('error', (err) => {
      error = err;
    });

    const abortHandler = async () => {
      if (child.pid && !exited) {
        onDebugMessage(`中止 shell 命令 (PID: ${child.pid})`);
        if (isWindows) {
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
        } else {
          try {
            // 终止整个进程组（负 PID）。
            // 先发送 SIGTERM，如果未终止再发送 SIGKILL。
            process.kill(-child.pid, 'SIGTERM');
            await new Promise((res) => setTimeout(res, 200));
            if (!exited) {
              process.kill(-child.pid, 'SIGKILL');
            }
          } catch (_e) {
            // 如果组终止失败，则回退到仅终止主进程。
            if (!exited) child.kill('SIGKILL');
          }
        }
      }
    };

    abortSignal.addEventListener('abort', abortHandler, { once: true });

    child.on('exit', (code, signal) => {
      exited = true;
      abortSignal.removeEventListener('abort', abortHandler);

      // 处理解码器中残留的最终字节
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();

      const finalBuffer = Buffer.concat(outputChunks);

      resolve({
        rawOutput: finalBuffer,
        output: stdout + (stderr ? `\n${stderr}` : ''),
        exitCode: code,
        signal,
        error,
        aborted: abortSignal.aborted,
      });
    });
  });
}

function addShellCommandToGeminiHistory(
  geminiClient: GeminiClient,
  rawQuery: string,
  resultText: string,
) {
  const modelContent =
    resultText.length > MAX_OUTPUT_LENGTH
      ? resultText.substring(0, MAX_OUTPUT_LENGTH) + '\n... (已截断)'
      : resultText;

  geminiClient.addHistory({
    role: 'user',
    parts: [
      {
        text: `我运行了以下 shell 命令:
\`\`\`sh
${rawQuery}
\`\`\`

产生了以下结果:
\`\`\`
${modelContent}
\`\`\``,
      },
    ],
  });
}

/**
 * 处理 shell 命令的 Hook。
 * 协调命令执行并更新历史记录和代理上下文。
 */
export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
  onExec: (command: Promise<void>) => void,
  onDebugMessage: (message: string) => void,
  config: Config,
  geminiClient: GeminiClient,
) => {
  const handleShellCommand = useCallback(
    (rawQuery: PartListUnion, abortSignal: AbortSignal): boolean => {
      if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
        return false;
      }

      const userMessageTimestamp = Date.now();
      addItemToHistory(
        { type: 'user_shell', text: rawQuery },
        userMessageTimestamp,
      );

      const isWindows = os.platform() === 'win32';
      const targetDir = config.getTargetDir();
      let commandToExecute = rawQuery;
      let pwdFilePath: string | undefined;

      // 在非 Windows 上，包装命令以捕获最终工作目录。
      if (!isWindows) {
        let command = rawQuery.trim();
        const pwdFileName = `shell_pwd_${crypto.randomBytes(6).toString('hex')}.tmp`;
        pwdFilePath = path.join(os.tmpdir(), pwdFileName);
        // 确保命令以分隔符结尾再添加我们自己的命令。
        if (!command.endsWith(';') && !command.endsWith('&')) {
          command += ';';
        }
        commandToExecute = `{ ${command} }; __code=$?; pwd > "${pwdFilePath}"; exit $__code`;
      }

      const execPromise = new Promise<void>((resolve) => {
        let lastUpdateTime = 0;

        onDebugMessage(`在 ${targetDir} 中执行: ${commandToExecute}`);
        executeShellCommand(
          commandToExecute,
          targetDir,
          abortSignal,
          (streamedOutput) => {
            // 限制待处理 UI 更新以避免过度重新渲染。
            if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
              setPendingHistoryItem({ type: 'info', text: streamedOutput });
              lastUpdateTime = Date.now();
            }
          },
          onDebugMessage,
        )
          .then((result) => {
            // TODO(abhipatel12) - 考虑更新待处理项目并使用超时以确保
            // 不会出现跳过中间输出的情况。
            setPendingHistoryItem(null);

            let historyItemType: HistoryItemWithoutId['type'] = 'info';
            let mainContent: string;

            // 发送给模型的上下文使用文本分词器，这意味着原始二进制数据
            // 无法被解析和理解，因此只会污染上下文窗口并浪费
            // 令牌。
            if (isBinary(result.rawOutput)) {
              mainContent =
                '[命令产生了二进制输出，未显示。]';
            } else {
              mainContent =
                result.output.trim() || '(命令未产生输出)';
            }

            let finalOutput = mainContent;

            if (result.error) {
              historyItemType = 'error';
              finalOutput = `${result.error.message}\n${finalOutput}`;
            } else if (result.aborted) {
              finalOutput = `命令已被取消。\n${finalOutput}`;
            } else if (result.signal) {
              historyItemType = 'error';
              finalOutput = `命令被信号终止: ${result.signal}。\n${finalOutput}`;
            } else if (result.exitCode !== 0) {
              historyItemType = 'error';
              finalOutput = `命令退出代码 ${result.exitCode}。\n${finalOutput}`;
            }

            if (pwdFilePath && fs.existsSync(pwdFilePath)) {
              const finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
              if (finalPwd && finalPwd !== targetDir) {
                const warning = `警告: shell 模式是无状态的; 目录更改到 '${finalPwd}' 将不会持久化。`;
                finalOutput = `${warning}\n\n${finalOutput}`;
              }
            }

            // 将完整、有上下文的结果添加到本地 UI 历史记录。
            addItemToHistory(
              { type: historyItemType, text: finalOutput },
              userMessageTimestamp,
            );

            // 将相同的完整、有上下文的结果添加到 LLM 的历史记录。
            addShellCommandToGeminiHistory(geminiClient, rawQuery, finalOutput);
          })
          .catch((err) => {
            setPendingHistoryItem(null);
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            addItemToHistory(
              {
                type: 'error',
                text: `发生意外错误: ${errorMessage}`,
              },
              userMessageTimestamp,
            );
          })
          .finally(() => {
            if (pwdFilePath && fs.existsSync(pwdFilePath)) {
              fs.unlinkSync(pwdFilePath);
            }
            resolve();
          });
      });

      onExec(execPromise);
      return true; // 命令已启动
    },
    [
      config,
      onDebugMessage,
      addItemToHistory,
      setPendingHistoryItem,
      onExec,
      geminiClient,
    ],
  );

  return { handleShellCommand };
};