/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import stripAnsi from 'strip-ansi';

export interface ShellToolParams {
  command: string;
  description?: string;
  directory?: string;
}
import { spawn } from 'child_process';
import { summarizeToolOutput } from '../utils/summarizer.js';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  static Name: string = 'run_shell_command';
  private whitelist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      ShellTool.Name,
      'Shell',
      `该工具将给定的 shell 命令作为 \`bash -c <command>\` 执行。命令可以使用 \`&\` 启动后台进程。命令作为子进程执行，该子进程拥有自己的进程组。可以使用 \`kill -- -PGID\` 终止命令进程组，或使用 \`kill -s SIGNAL -- -PGID\` 向其发送信号。

返回以下信息：

Command: 执行的命令。
Directory: 执行命令的目录（相对于项目根目录），或 \`(root)\`。
Stdout: stdout 流的输出。在错误情况下或对于任何未等待的后台进程，可能为 \`(empty)\` 或部分输出。
Stderr: stderr 流的输出。在错误情况下或对于任何未等待的后台进程，可能为 \`(empty)\` 或部分输出。
Error: 错误信息，或如果子进程未报告错误则为 \`(none)\`。
Exit Code: 退出代码，或如果由信号终止则为 \`(none)\`。
Signal: 信号编号，或如果未收到信号则为 \`(none)\`。
Background PIDs: 启动的后台进程列表，或 \`(none)\`。
Process Group PGID: 启动的进程组，或 \`(none)\``,
      {
        type: Type.OBJECT,
        properties: {
          command: {
            type: Type.STRING,
            description: '要作为 `bash -c <command>` 执行的确切 bash 命令',
          },
          description: {
            type: Type.STRING,
            description:
              '对用户的命令简要描述。要具体且简洁。理想情况下为单个句子。为了清晰起见，最多可为 3 个句子。无换行符。',
          },
          directory: {
            type: Type.STRING,
            description:
              '（可选）运行命令的目录，如果不是项目根目录。必须相对于项目根目录且必须已存在。',
          },
        },
        required: ['command'],
      },
      false, // 输出不是 markdown
      true, // 输出可以更新
    );
  }

  getDescription(params: ShellToolParams): string {
    let description = `${params.command}`;
    // 追加可选的 [in directory]
    // 注意即使由于绝对路径导致验证失败，也需要描述
    if (params.directory) {
      description += ` [in ${params.directory}]`;
    }
    // 追加可选的 (description)，将任何换行符替换为空格
    if (params.description) {
      description += ` (${params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  /**
   * 从给定的 shell 命令字符串中提取根命令。
   * 这用于识别权限检查的基本命令。
   *
   * @param command 要解析的 shell 命令字符串
   * @returns 根命令名称，如果无法确定则返回 undefined
   * @example getCommandRoot("ls -la /tmp") 返回 "ls"
   * @example getCommandRoot("git status && npm test") 返回 "git"
   */
  getCommandRoot(command: string): string | undefined {
    return command
      .trim() // 移除前导和尾随空白
      .replace(/[{}()]/g, '') // 移除所有分组操作符
      .split(/[\s;&|]+/)[0] // 按任何空白或分隔符或链接操作符分割并取第一部分
      ?.split(/[/\\]/) // 按任何路径分隔符分割（或如果前一行未定义则返回 undefined）
      .pop(); // 取最后一部分并返回命令根（或如果前一行为空则返回 undefined）
  }

  /**
   * 根据工具的配置（包括允许列表和阻止列表）确定给定的 shell 命令是否被允许执行。
   *
   * @param command 要验证的 shell 命令字符串
   * @returns 包含 'allowed' 布尔值和可选的 'reason' 字符串（如果不允许）的对象
   */
  isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    // 0. 不允许命令替换
    if (command.includes('$(')) {
      return {
        allowed: false,
        reason:
          '出于安全原因，不允许使用 $() 进行命令替换',
      };
    }

    const SHELL_TOOL_NAMES = [ShellTool.name, ShellTool.Name];

    const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');

    /**
     * 检查命令字符串是否以给定前缀开头，确保是完整单词匹配（即后跟空格或完全匹配）。
     * 例如，`isPrefixedBy('npm install', 'npm')` -> true
     * 例如，`isPrefixedBy('npm', 'npm')` -> true
     * 例如，`isPrefixedBy('npminstall', 'npm')` -> false
     */
    const isPrefixedBy = (cmd: string, prefix: string): boolean => {
      if (!cmd.startsWith(prefix)) {
        return false;
      }
      return cmd.length === prefix.length || cmd[prefix.length] === ' ';
    };

    /**
     * 从工具字符串列表中提取和规范化 shell 命令。
     * 例如，'ShellTool("ls -l")' 变为 'ls -l'
     */
    const extractCommands = (tools: string[]): string[] =>
      tools.flatMap((tool) => {
        for (const toolName of SHELL_TOOL_NAMES) {
          if (tool.startsWith(`${toolName}(`) && tool.endsWith(')')) {
            return [normalize(tool.slice(toolName.length + 1, -1))];
          }
        }
        return [];
      });

    const coreTools = this.config.getCoreTools() || [];
    const excludeTools = this.config.getExcludeTools() || [];

    // 1. 检查 shell 工具是否被全局禁用。
    if (SHELL_TOOL_NAMES.some((name) => excludeTools.includes(name))) {
      return {
        allowed: false,
        reason: 'Shell 工具在配置中被全局禁用',
      };
    }

    const blockedCommands = new Set(extractCommands(excludeTools));
    const allowedCommands = new Set(extractCommands(coreTools));

    const hasSpecificAllowedCommands = allowedCommands.size > 0;
    const isWildcardAllowed = SHELL_TOOL_NAMES.some((name) =>
      coreTools.includes(name),
    );

    const commandsToValidate = command.split(/&&|\|\||\||;/).map(normalize);

    const blockedCommandsArr = [...blockedCommands];

    for (const cmd of commandsToValidate) {
      // 2. 检查命令是否在阻止列表中。
      const isBlocked = blockedCommandsArr.some((blocked) =>
        isPrefixedBy(cmd, blocked),
      );
      if (isBlocked) {
        return {
          allowed: false,
          reason: `命令 '${cmd}' 被配置阻止`,
        };
      }

      // 3. 如果在严格允许列表模式下，检查命令是否被允许。
      const isStrictAllowlist =
        hasSpecificAllowedCommands && !isWildcardAllowed;
      const allowedCommandsArr = [...allowedCommands];
      if (isStrictAllowlist) {
        const isAllowed = allowedCommandsArr.some((allowed) =>
          isPrefixedBy(cmd, allowed),
        );
        if (!isAllowed) {
          return {
            allowed: false,
            reason: `命令 '${cmd}' 不在允许的命令列表中`,
          };
        }
      }
    }

    // 4. 如果所有检查都通过，则命令被允许。
    return { allowed: true };
  }

  validateToolParams(params: ShellToolParams): string | null {
    const commandCheck = this.isCommandAllowed(params.command);
    if (!commandCheck.allowed) {
      if (!commandCheck.reason) {
        console.error(
          '意外：isCommandAllowed 返回 false 但没有原因',
        );
        return `命令不被允许：${params.command}`;
      }
      return commandCheck.reason;
    }
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    if (!params.command.trim()) {
      return '命令不能为空。';
    }
    if (!this.getCommandRoot(params.command)) {
      return '无法识别命令根以从用户获取权限。';
    }
    if (params.directory) {
      if (path.isAbsolute(params.directory)) {
        return '目录不能是绝对路径。必须相对于项目根目录。';
      }
      const directory = path.resolve(
        this.config.getTargetDir(),
        params.directory,
      );
      if (!fs.existsSync(directory)) {
        return '目录必须存在。';
      }
    }
    return null;
  }

  async shouldConfirmExecute(
    params: ShellToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // 跳过确认，执行调用将立即失败
    }
    const rootCommand = this.getCommandRoot(params.command)!; // 验证后必须为非空字符串
    if (this.whitelist.has(rootCommand)) {
      return false; // 已批准并列入白名单
    }
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: '确认 Shell 命令',
      command: params.command,
      rootCommand,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add(rootCommand);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: ShellToolParams,
    abortSignal: AbortSignal,
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: [
          `命令被拒绝：${params.command}`,
          `原因：${validationError}`,
        ].join('\n'),
        returnDisplay: `错误：${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: '命令在开始前被用户取消。',
        returnDisplay: '命令被用户取消。',
      };
    }

    const isWindows = os.platform() === 'win32';
    const tempFileName = `shell_pgrep_${crypto
      .randomBytes(6)
      .toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    // Windows 上没有 pgrep，因此无法获取后台 PID
    const command = isWindows
      ? params.command
      : (() => {
          // 包装命令以将子进程 PID（通过 pgrep）追加到临时文件
          let command = params.command.trim();
          if (!command.endsWith('&')) command += ';';
          return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
        })();

    // 在指定目录中启动命令（或在未指定时使用项目根目录）
    const shell = isWindows
      ? spawn('cmd.exe', ['/c', command], {
          stdio: ['ignore', 'pipe', 'pipe'],
          // detached: true, // 确保子进程启动自己的进程组（特别是在 Linux 中）
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
        })
      : spawn('bash', ['-c', command], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true, // 确保子进程启动自己的进程组（特别是在 Linux 中）
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
        });

    let exited = false;
    let stdout = '';
    let output = '';
    let lastUpdateTime = Date.now();

    const appendOutput = (str: string) => {
      output += str;
      if (
        updateOutput &&
        Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS
      ) {
        updateOutput(output);
        lastUpdateTime = Date.now();
      }
    };

    shell.stdout.on('data', (data: Buffer) => {
      // 继续消费退出后的数据以处理后台进程
      // 移除监听器可能导致操作系统缓冲区溢出并阻塞子进程
      // 销毁（例如 shell.stdout.destroy()）可能通过 SIGPIPE 终止子进程
      if (!exited) {
        const str = stripAnsi(data.toString());
        stdout += str;
        appendOutput(str);
      }
    });

    let stderr = '';
    shell.stderr.on('data', (data: Buffer) => {
      if (!exited) {
        const str = stripAnsi(data.toString());
        stderr += str;
        appendOutput(str);
      }
    });

    let error: Error | null = null;
    shell.on('error', (err: Error) => {
      error = err;
      // 从用户的错误消息中移除包装器命令
      error.message = error.message.replace(command, params.command);
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    const exitHandler = (
      _code: number | null,
      _signal: NodeJS.Signals | null,
    ) => {
      exited = true;
      code = _code;
      processSignal = _signal;
    };
    shell.on('exit', exitHandler);

    const abortHandler = async () => {
      if (shell.pid && !exited) {
        if (os.platform() === 'win32') {
          // 对于 Windows，使用 taskkill 杀死进程树
          spawn('taskkill', ['/pid', shell.pid.toString(), '/f', '/t']);
        } else {
          try {
            // 尝试向进程组发送 SIGTERM（负 PID）
            // 200ms 后回退到 SIGKILL（到组）
            process.kill(-shell.pid, 'SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (shell.pid && !exited) {
              process.kill(-shell.pid, 'SIGKILL');
            }
          } catch (_e) {
            // 如果组杀死失败，回退到只杀死主进程
            try {
              if (shell.pid) {
                shell.kill('SIGKILL');
              }
            } catch (_e) {
              console.error(`无法杀死 shell 进程 ${shell.pid}：${_e}`);
            }
          }
        }
      }
    };
    abortSignal.addEventListener('abort', abortHandler);

    // 等待 shell 退出
    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      abortSignal.removeEventListener('abort', abortHandler);
    }

    // 从临时文件解析 PID（pgrep 输出）并删除它
    const backgroundPIDs: number[] = [];
    if (os.platform() !== 'win32') {
      if (fs.existsSync(tempFilePath)) {
        const pgrepLines = fs
          .readFileSync(tempFilePath, 'utf8')
          .split('\n')
          .filter(Boolean);
        for (const line of pgrepLines) {
          if (!/^\d+$/.test(line)) {
            console.error(`pgrep: ${line}`);
          }
          const pid = Number(line);
          // 排除 shell 子进程 PID
          if (pid !== shell.pid) {
            backgroundPIDs.push(pid);
          }
        }
        fs.unlinkSync(tempFilePath);
      } else {
        if (!abortSignal.aborted) {
          console.error('缺少 pgrep 输出');
        }
      }
    }

    let llmContent = '';
    if (abortSignal.aborted) {
      llmContent = '命令在完成前被用户取消。';
      if (output.trim()) {
        llmContent += ` 以下是取消前的输出（stdout 和 stderr）：\n${output}`;
      } else {
        llmContent += ' 取消前没有输出。';
      }
    } else {
      llmContent = [
        `Command: ${params.command}`,
        `Directory: ${params.directory || '(root)'}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${processSignal ?? '(none)'}`,
        `Background PIDs: ${backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'}`,
        `Process Group PGID: ${shell.pid ?? '(none)'}`,
      ].join('\n');
    }

    let returnDisplayMessage = '';
    if (this.config.getDebugMode()) {
      returnDisplayMessage = llmContent;
    } else {
      if (output.trim()) {
        returnDisplayMessage = output;
      } else {
        // 输出为空，如果命令失败或被取消则提供原因
        if (abortSignal.aborted) {
          returnDisplayMessage = '命令被用户取消。';
        } else if (processSignal) {
          returnDisplayMessage = `命令被信号终止：${processSignal}`;
        } else if (error) {
          // 如果错误不为 null，则为 Error 对象（或其他真值）
          returnDisplayMessage = `命令失败：${getErrorMessage(error)}`;
        } else if (code !== null && code !== 0) {
          returnDisplayMessage = `命令退出代码：${code}`;
        }
        // 如果输出为空且命令成功（代码 0，无错误/信号/中止），
        // returnDisplayMessage 将保持为空，这是可以的。
      }
    }

    const summary = await summarizeToolOutput(
      llmContent,
      this.config.getGeminiClient(),
      abortSignal,
    );

    return {
      llmContent: summary,
      returnDisplay: returnDisplayMessage,
    };
  }
}