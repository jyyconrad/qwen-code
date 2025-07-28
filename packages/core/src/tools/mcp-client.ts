/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  SSEClientTransport,
  SSEClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/sse.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parse } from 'shell-quote';
import { MCPServerConfig } from '../config/config.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { FunctionDeclaration, Type, mcpToTool } from '@google/genai';
import { sanitizeParameters, ToolRegistry } from './tool-registry.js';

export const MCP_DEFAULT_TIMEOUT_MSEC = 10 * 60 * 1000; // 默认为 10 分钟

/**
 * 枚举表示 MCP 服务器的连接状态
 */
export enum MCPServerStatus {
  /** 服务器已断开连接或出现错误 */
  DISCONNECTED = 'disconnected',
  /** 服务器正在连接中 */
  CONNECTING = 'connecting',
  /** 服务器已连接并准备就绪 */
  CONNECTED = 'connected',
}

/**
 * 枚举表示整体 MCP 发现状态
 */
export enum MCPDiscoveryState {
  /** 发现尚未开始 */
  NOT_STARTED = 'not_started',
  /** 发现正在进行中 */
  IN_PROGRESS = 'in_progress',
  /** 发现已完成（无论是否有错误） */
  COMPLETED = 'completed',
}

/**
 * 映射以跟踪核心包中每个 MCP 服务器的状态
 */
const mcpServerStatusesInternal: Map<string, MCPServerStatus> = new Map();

/**
 * 跟踪整体 MCP 发现状态
 */
let mcpDiscoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;

/**
 * MCP 服务器状态更改的事件监听器
 */
type StatusChangeListener = (
  serverName: string,
  status: MCPServerStatus,
) => void;
const statusChangeListeners: StatusChangeListener[] = [];

/**
 * 添加 MCP 服务器状态更改的监听器
 */
export function addMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  statusChangeListeners.push(listener);
}

/**
 * 移除 MCP 服务器状态更改的监听器
 */
export function removeMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  const index = statusChangeListeners.indexOf(listener);
  if (index !== -1) {
    statusChangeListeners.splice(index, 1);
  }
}

/**
 * 更新 MCP 服务器的状态
 */
function updateMCPServerStatus(
  serverName: string,
  status: MCPServerStatus,
): void {
  mcpServerStatusesInternal.set(serverName, status);
  // 通知所有监听器
  for (const listener of statusChangeListeners) {
    listener(serverName, status);
  }
}

/**
 * 获取 MCP 服务器的当前状态
 */
export function getMCPServerStatus(serverName: string): MCPServerStatus {
  return (
    mcpServerStatusesInternal.get(serverName) || MCPServerStatus.DISCONNECTED
  );
}

/**
 * 获取所有 MCP 服务器的状态
 */
export function getAllMCPServerStatuses(): Map<string, MCPServerStatus> {
  return new Map(mcpServerStatusesInternal);
}

/**
 * 获取当前 MCP 发现状态
 */
export function getMCPDiscoveryState(): MCPDiscoveryState {
  return mcpDiscoveryState;
}

/**
 * 从所有配置的 MCP 服务器发现工具并将其注册到工具注册表中。
 * 它协调配置中定义的每个服务器以及通过命令行参数指定的任何服务器的连接和发现过程。
 *
 * @param mcpServers 命名的 MCP 服务器配置记录。
 * @param mcpServerCommand 用于动态指定 MCP 服务器的可选命令字符串。
 * @param toolRegistry 将注册发现工具的中央注册表。
 * @returns 当所有服务器的发现过程都已完成时解析的 Promise。
 */
export async function discoverMcpTools(
  mcpServers: Record<string, MCPServerConfig>,
  mcpServerCommand: string | undefined,
  toolRegistry: ToolRegistry,
  debugMode: boolean,
): Promise<void> {
  mcpDiscoveryState = MCPDiscoveryState.IN_PROGRESS;
  try {
    mcpServers = populateMcpServerCommand(mcpServers, mcpServerCommand);

    const discoveryPromises = Object.entries(mcpServers).map(
      ([mcpServerName, mcpServerConfig]) =>
        connectAndDiscover(
          mcpServerName,
          mcpServerConfig,
          toolRegistry,
          debugMode,
        ),
    );
    await Promise.all(discoveryPromises);
  } finally {
    mcpDiscoveryState = MCPDiscoveryState.COMPLETED;
  }
}

/** 用于测试 */
export function populateMcpServerCommand(
  mcpServers: Record<string, MCPServerConfig>,
  mcpServerCommand: string | undefined,
): Record<string, MCPServerConfig> {
  if (mcpServerCommand) {
    const cmd = mcpServerCommand;
    const args = parse(cmd, process.env) as string[];
    if (args.some((arg) => typeof arg !== 'string')) {
      throw new Error('无法解析 mcpServerCommand: ' + cmd);
    }
    // 使用通用服务器名称 'mcp'
    mcpServers['mcp'] = {
      command: args[0],
      args: args.slice(1),
    };
  }
  return mcpServers;
}

/**
 * 连接到 MCP 服务器并发现可用工具，将其注册到工具注册表中。
 * 此函数处理连接到服务器、发现工具以及在未找到工具时清理资源的完整生命周期。
 *
 * @param mcpServerName 此 MCP 服务器的名称标识符
 * @param mcpServerConfig 包含连接详细信息的配置对象
 * @param toolRegistry 要将发现的工具注册到的注册表
 * @returns 当发现完成时解析的 Promise
 */
export async function connectAndDiscover(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  toolRegistry: ToolRegistry,
  debugMode: boolean,
): Promise<void> {
  updateMCPServerStatus(mcpServerName, MCPServerStatus.CONNECTING);

  try {
    const mcpClient = await connectToMcpServer(
      mcpServerName,
      mcpServerConfig,
      debugMode,
    );
    try {
      updateMCPServerStatus(mcpServerName, MCPServerStatus.CONNECTED);

      mcpClient.onerror = (error) => {
        console.error(`MCP 错误 (${mcpServerName}):`, error.toString());
        updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
      };

      const tools = await discoverTools(
        mcpServerName,
        mcpServerConfig,
        mcpClient,
      );
      for (const tool of tools) {
        toolRegistry.registerTool(tool);
      }
    } catch (error) {
      mcpClient.close();
      throw error;
    }
  } catch (error) {
    console.error(`连接到 MCP 服务器 '${mcpServerName}' 时出错:`, error);
    updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
  }
}

/**
 * 从已连接的 MCP 客户端发现和清理工具。
 * 它从客户端检索函数声明，过滤掉禁用的工具，
 * 为其生成有效名称，并将它们包装在 `DiscoveredMCPTool` 实例中。
 *
 * @param mcpServerName MCP 服务器的名称。
 * @param mcpServerConfig MCP 服务器的配置。
 * @param mcpClient 活动的 MCP 客户端实例。
 * @returns 解析为发现和启用的工具数组的 Promise。
 * @throws 如果未找到启用的工具或服务器提供无效的函数声明，则抛出错误。
 */
export async function discoverTools(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  mcpClient: Client,
): Promise<DiscoveredMCPTool[]> {
  try {
    const mcpCallableTool = mcpToTool(mcpClient);
    const tool = await mcpCallableTool.tool();

    if (!Array.isArray(tool.functionDeclarations)) {
      throw new Error(`服务器未返回有效的函数声明。`);
    }

    const discoveredTools: DiscoveredMCPTool[] = [];
    for (const funcDecl of tool.functionDeclarations) {
      if (!isEnabled(funcDecl, mcpServerName, mcpServerConfig)) {
        continue;
      }

      const toolNameForModel = generateValidName(funcDecl, mcpServerName);

      sanitizeParameters(funcDecl.parameters);

      discoveredTools.push(
        new DiscoveredMCPTool(
          mcpCallableTool,
          mcpServerName,
          toolNameForModel,
          funcDecl.description ?? '',
          funcDecl.parameters ?? { type: Type.OBJECT, properties: {} },
          funcDecl.name!,
          mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
          mcpServerConfig.trust,
        ),
      );
    }
    if (discoveredTools.length === 0) {
      throw Error('未找到启用的工具');
    }
    return discoveredTools;
  } catch (error) {
    throw new Error(`发现工具时出错: ${error}`);
  }
}

/**
 * 根据提供的配置创建并连接 MCP 客户端到服务器。
 * 它确定适当的传输方式（Stdio、SSE 或流式 HTTP）并建立连接。
 * 它还应用补丁来处理请求超时。
 *
 * @param mcpServerName MCP 服务器的名称，用于日志记录和标识。
 * @param mcpServerConfig 指定如何连接到服务器的配置。
 * @returns 解析为已连接的 MCP `Client` 实例的 Promise。
 * @throws 如果连接失败或配置无效，则抛出错误。
 */
export async function connectToMcpServer(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  debugMode: boolean,
): Promise<Client> {
  const mcpClient = new Client({
    name: 'gemini-cli-mcp-client',
    version: '0.0.1',
  });

  // 补丁 Client.callTool 以使用请求超时，因为 genai McpCallTool.callTool 不这样做
  // TODO: 一旦 GenAI SDK 支持带请求选项的 callTool，就移除此 hack
  if ('callTool' in mcpClient) {
    const origCallTool = mcpClient.callTool.bind(mcpClient);
    mcpClient.callTool = function (params, resultSchema, options) {
      return origCallTool(params, resultSchema, {
        ...options,
        timeout: mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
      });
    };
  }

  try {
    const transport = createTransport(
      mcpServerName,
      mcpServerConfig,
      debugMode,
    );
    try {
      await mcpClient.connect(transport, {
        timeout: mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
      });
      return mcpClient;
    } catch (error) {
      await transport.close();
      throw error;
    }
  } catch (error) {
    // 创建一个不包含敏感信息的安全配置对象
    const safeConfig = {
      command: mcpServerConfig.command,
      url: mcpServerConfig.url,
      httpUrl: mcpServerConfig.httpUrl,
      cwd: mcpServerConfig.cwd,
      timeout: mcpServerConfig.timeout,
      trust: mcpServerConfig.trust,
      // 排除可能包含敏感数据的 args、env 和 headers
    };

    let errorString =
      `无法启动或连接到 MCP 服务器 '${mcpServerName}' ` +
      `${JSON.stringify(safeConfig)}; \n${error}`;
    if (process.env.SANDBOX) {
      errorString += `\n请确保它在沙箱中可用`;
    }
    throw new Error(errorString);
  }
}

/** 用于测试 */
export function createTransport(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  debugMode: boolean,
): Transport {
  if (mcpServerConfig.httpUrl) {
    const transportOptions: StreamableHTTPClientTransportOptions = {};
    if (mcpServerConfig.headers) {
      transportOptions.requestInit = {
        headers: mcpServerConfig.headers,
      };
    }
    return new StreamableHTTPClientTransport(
      new URL(mcpServerConfig.httpUrl),
      transportOptions,
    );
  }

  if (mcpServerConfig.url) {
    const transportOptions: SSEClientTransportOptions = {};
    if (mcpServerConfig.headers) {
      transportOptions.requestInit = {
        headers: mcpServerConfig.headers,
      };
    }
    return new SSEClientTransport(
      new URL(mcpServerConfig.url),
      transportOptions,
    );
  }

  if (mcpServerConfig.command) {
    const transport = new StdioClientTransport({
      command: mcpServerConfig.command,
      args: mcpServerConfig.args || [],
      env: {
        ...process.env,
        ...(mcpServerConfig.env || {}),
      } as Record<string, string>,
      cwd: mcpServerConfig.cwd,
      stderr: 'pipe',
    });
    if (debugMode) {
      transport.stderr!.on('data', (data) => {
        const stderrStr = data.toString().trim();
        console.debug(`[DEBUG] [MCP STDERR (${mcpServerName})]: `, stderrStr);
      });
    }
    return transport;
  }

  throw new Error(
    `配置无效：缺少 httpUrl（用于流式 HTTP）、url（用于 SSE）和 command（用于 stdio）。`,
  );
}

/** 用于测试 */
export function generateValidName(
  funcDecl: FunctionDeclaration,
  mcpServerName: string,
) {
  // 将无效字符（基于 Gemini API 的 400 错误消息）替换为下划线
  let validToolname = funcDecl.name!.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // 在前面加上 MCP 服务器名称以避免与其他工具冲突
  validToolname = mcpServerName + '__' + validToolname;

  // 如果超过 63 个字符，用 '___' 替换中间部分
  // (Gemini API 说最大长度为 64，但实际限制似乎是 63)
  if (validToolname.length > 63) {
    validToolname =
      validToolname.slice(0, 28) + '___' + validToolname.slice(-32);
  }
  return validToolname;
}

/** 用于测试 */
export function isEnabled(
  funcDecl: FunctionDeclaration,
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
): boolean {
  if (!funcDecl.name) {
    console.warn(
      `从 MCP 服务器 '${mcpServerName}' 发现了一个没有名称的函数声明。跳过。`,
    );
    return false;
  }
  const { includeTools, excludeTools } = mcpServerConfig;

  // excludeTools 优先于 includeTools
  if (excludeTools && excludeTools.includes(funcDecl.name)) {
    return false;
  }

  return (
    !includeTools ||
    includeTools.some(
      (tool) => tool === funcDecl.name || tool.startsWith(`${funcDecl.name}(`),
    )
  );
}