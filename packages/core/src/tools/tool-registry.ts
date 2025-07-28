/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, Schema, Type } from '@google/genai';
import { Tool, ToolResult, BaseTool } from './tools.js';
import { Config } from '../config/config.js';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { discoverMcpTools } from './mcp-client.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { parse } from 'shell-quote';

type ToolParams = Record<string, unknown>;

export class DiscoveredTool extends BaseTool<ToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
  ) {
    const discoveryCmd = config.getToolDiscoveryCommand()!;
    const callCommand = config.getToolCallCommand()!;
    description += `

该工具是通过在项目根目录执行命令 \`${discoveryCmd}\` 发现的。
调用时，该工具将在项目根目录执行命令 \`${callCommand} ${name}\`。
工具发现和调用命令可在项目或用户设置中配置。

调用时，工具调用命令将作为子进程执行。
成功时，工具输出将作为 JSON 字符串返回。
否则，将返回以下信息：

Stdout: stdout 流上的输出。可以是 \`(empty)\` 或部分输出。
Stderr: stderr 流上的输出。可以是 \`(empty)\` 或部分输出。
Error: 错误信息，如果子进程未报告错误则为 \`(none)\`。
Exit Code: 退出代码，如果由信号终止则为 \`(none)\`。
Signal: 信号编号，如果未收到信号则为 \`(none)\`。
`;
    super(
      name,
      name,
      description,
      parameterSchema,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const callCommand = this.config.getToolCallCommand()!;
    const child = spawn(callCommand, [this.name]);
    child.stdin.write(JSON.stringify(params));
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let error: Error | null = null;
    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;

    await new Promise<void>((resolve) => {
      const onStdout = (data: Buffer) => {
        stdout += data?.toString();
      };

      const onStderr = (data: Buffer) => {
        stderr += data?.toString();
      };

      const onError = (err: Error) => {
        error = err;
      };

      const onClose = (
        _code: number | null,
        _signal: NodeJS.Signals | null,
      ) => {
        code = _code;
        signal = _signal;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        child.stdout.removeListener('data', onStdout);
        child.stderr.removeListener('data', onStderr);
        child.removeListener('error', onError);
        child.removeListener('close', onClose);
        if (child.connected) {
          child.disconnect();
        }
      };

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.on('error', onError);
      child.on('close', onClose);
    });

    // 如果有任何错误、非零退出代码、信号或 stderr，则返回错误详情而不是 stdout
    if (error || code !== 0 || signal || stderr) {
      const llmContent = [
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${signal ?? '(none)'}`,
      ].join('\n');
      return {
        llmContent,
        returnDisplay: llmContent,
      };
    }

    return {
      llmContent: stdout,
      returnDisplay: stdout,
    };
  }
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * 注册工具定义。
   * @param tool - 包含模式和执行逻辑的工具对象。
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      // 决定行为：抛出错误、记录警告或允许覆盖
      console.warn(
        `名为 "${tool.name}" 的工具已注册。将被覆盖。`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 从项目中发现工具（如果可用且已配置）。
   * 可多次调用以更新发现的工具。
   */
  async discoverTools(): Promise<void> {
    // 移除之前发现的任何工具
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredTool || tool instanceof DiscoveredMCPTool) {
        this.tools.delete(tool.name);
      }
    }

    await this.discoverAndRegisterToolsFromCommand();

    // 如果已配置，使用 MCP 服务器发现工具
    await discoverMcpTools(
      this.config.getMcpServers() ?? {},
      this.config.getMcpServerCommand(),
      this,
      this.config.getDebugMode(),
    );
  }

  private async discoverAndRegisterToolsFromCommand(): Promise<void> {
    const discoveryCmd = this.config.getToolDiscoveryCommand();
    if (!discoveryCmd) {
      return;
    }

    try {
      const cmdParts = parse(discoveryCmd);
      if (cmdParts.length === 0) {
        throw new Error(
          '工具发现命令为空或仅包含空白字符。',
        );
      }
      const proc = spawn(cmdParts[0] as string, cmdParts.slice(1) as string[]);
      let stdout = '';
      const stdoutDecoder = new StringDecoder('utf8');
      let stderr = '';
      const stderrDecoder = new StringDecoder('utf8');
      let sizeLimitExceeded = false;
      const MAX_STDOUT_SIZE = 10 * 1024 * 1024; // 10MB 限制
      const MAX_STDERR_SIZE = 10 * 1024 * 1024; // 10MB 限制

      let stdoutByteLength = 0;
      let stderrByteLength = 0;

      proc.stdout.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stdoutByteLength + data.length > MAX_STDOUT_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stdoutByteLength += data.length;
        stdout += stdoutDecoder.write(data);
      });

      proc.stderr.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stderrByteLength + data.length > MAX_STDERR_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stderrByteLength += data.length;
        stderr += stderrDecoder.write(data);
      });

      await new Promise<void>((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', (code) => {
          stdout += stdoutDecoder.end();
          stderr += stderrDecoder.end();

          if (sizeLimitExceeded) {
            return reject(
              new Error(
                `工具发现命令输出超过 ${MAX_STDOUT_SIZE} 字节的大小限制。`,
              ),
            );
          }

          if (code !== 0) {
            console.error(`命令失败，退出代码 ${code}`);
            console.error(stderr);
            return reject(
              new Error(`工具发现命令失败，退出代码 ${code}`),
            );
          }
          resolve();
        });
      });

      // 执行发现命令并提取函数声明（带或不带 "tool" 包装器）
      const functions: FunctionDeclaration[] = [];
      const discoveredItems = JSON.parse(stdout.trim());

      if (!discoveredItems || !Array.isArray(discoveredItems)) {
        throw new Error(
          '工具发现命令未返回工具的 JSON 数组。',
        );
      }

      for (const tool of discoveredItems) {
        if (tool && typeof tool === 'object') {
          if (Array.isArray(tool['function_declarations'])) {
            functions.push(...tool['function_declarations']);
          } else if (Array.isArray(tool['functionDeclarations'])) {
            functions.push(...tool['functionDeclarations']);
          } else if (tool['name']) {
            functions.push(tool as FunctionDeclaration);
          }
        }
      }
      // 将每个函数注册为工具
      for (const func of functions) {
        if (!func.name) {
          console.warn('发现了一个没有名称的工具。跳过。');
          continue;
        }
        // 在注册工具之前清理参数。
        const parameters =
          func.parameters &&
          typeof func.parameters === 'object' &&
          !Array.isArray(func.parameters)
            ? (func.parameters as Schema)
            : {};
        sanitizeParameters(parameters);
        this.registerTool(
          new DiscoveredTool(
            this.config,
            func.name,
            func.description ?? '',
            parameters as Record<string, unknown>,
          ),
        );
      }
    } catch (e) {
      console.error(`工具发现命令 "${discoveryCmd}" 失败:`, e);
      throw e;
    }
  }

  /**
   * 获取工具模式列表（FunctionDeclaration 数组）。
   * 从 ToolListUnion 结构中提取声明。
   * 如果已配置，包括发现的（相对于注册的）工具。
   * @returns FunctionDeclarations 数组。
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    this.tools.forEach((tool) => {
      declarations.push(tool.schema);
    });
    return declarations;
  }

  /**
   * 返回所有已注册和发现的工具实例数组。
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 返回从特定 MCP 服务器注册的工具数组。
   */
  getToolsByServer(serverName: string): Tool[] {
    const serverTools: Tool[] = [];
    for (const tool of this.tools.values()) {
      if ((tool as DiscoveredMCPTool)?.serverName === serverName) {
        serverTools.push(tool);
      }
    }
    return serverTools;
  }

  /**
   * 获取特定工具的定义。
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}

/**
 * 就地清理模式对象以确保与 Gemini API 的兼容性。
 *
 * 注意：此函数会直接修改传入的模式对象。
 *
 * 它执行以下操作：
 * - 当存在 `anyOf` 时移除 `default` 属性。
 * - 从字符串属性中移除不支持的 `format` 值，仅保留 'enum' 和 'date-time'。
 * - 递归清理 `anyOf`、`items` 和 `properties` 中的嵌套模式。
 * - 处理模式内的循环引用以防止无限循环。
 *
 * @param schema 要清理的模式对象。将直接修改。
 */
export function sanitizeParameters(schema?: Schema) {
  _sanitizeParameters(schema, new Set<Schema>());
}

/**
 * sanitizeParameters 的内部递归实现。
 * @param schema 要清理的模式对象。
 * @param visited 用于在递归过程中跟踪已访问模式对象的集合。
 */
function _sanitizeParameters(schema: Schema | undefined, visited: Set<Schema>) {
  if (!schema || visited.has(schema)) {
    return;
  }
  visited.add(schema);

  if (schema.anyOf) {
    // Vertex AI 在同时设置 anyOf 和 default 时会混淆。
    schema.default = undefined;
    for (const item of schema.anyOf) {
      if (typeof item !== 'boolean') {
        _sanitizeParameters(item, visited);
      }
    }
  }
  if (schema.items && typeof schema.items !== 'boolean') {
    _sanitizeParameters(schema.items, visited);
  }
  if (schema.properties) {
    for (const item of Object.values(schema.properties)) {
      if (typeof item !== 'boolean') {
        _sanitizeParameters(item, visited);
      }
    }
  }
  // Vertex AI 仅支持 STRING 类型的 'enum' 和 'date-time' 格式。
  if (schema.type === Type.STRING) {
    if (
      schema.format &&
      schema.format !== 'enum' &&
      schema.format !== 'date-time'
    ) {
      schema.format = undefined;
    }
  }
}