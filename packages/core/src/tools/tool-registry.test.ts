/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  Mocked,
} from 'vitest';
import {
  ToolRegistry,
  DiscoveredTool,
  sanitizeParameters,
} from './tool-registry.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { Config, ConfigParameters, ApprovalMode } from '../config/config.js';
import { BaseTool, ToolResult } from './tools.js';
import {
  FunctionDeclaration,
  CallableTool,
  mcpToTool,
  Type,
  Schema,
} from '@google/genai';
import { spawn } from 'node:child_process';

// 使用 vi.hoisted 定义模拟函数，以便在 vi.mock 工厂中使用
const mockDiscoverMcpTools = vi.hoisted(() => vi.fn());

// 模拟 ./mcp-client.js 以控制其在 tool-registry 测试中的行为
vi.mock('./mcp-client.js', () => ({
  discoverMcpTools: mockDiscoverMcpTools,
}));

// 模拟 node:child_process
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
  };
});

// 模拟 MCP SDK Client 和 Transports
const mockMcpClientConnect = vi.fn();
const mockMcpClientOnError = vi.fn();
const mockStdioTransportClose = vi.fn();
const mockSseTransportClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const MockClient = vi.fn().mockImplementation(() => ({
    connect: mockMcpClientConnect,
    set onerror(handler: any) {
      mockMcpClientOnError(handler);
    },
  }));
  return { Client: MockClient };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  const MockStdioClientTransport = vi.fn().mockImplementation(() => ({
    stderr: {
      on: vi.fn(),
    },
    close: mockStdioTransportClose,
  }));
  return { StdioClientTransport: MockStdioClientTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  const MockSSEClientTransport = vi.fn().mockImplementation(() => ({
    close: mockSseTransportClose,
  }));
  return { SSEClientTransport: MockSSEClientTransport };
});

// 模拟 @google/genai mcpToTool
vi.mock('@google/genai', async () => {
  const actualGenai =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actualGenai,
    mcpToTool: vi.fn().mockImplementation(() => ({
      tool: vi.fn().mockResolvedValue({ functionDeclarations: [] }),
      callTool: vi.fn(),
    })),
  };
});

// 辅助函数，用于创建特定测试需求的模拟 CallableTool
const createMockCallableTool = (
  toolDeclarations: FunctionDeclaration[],
): Mocked<CallableTool> => ({
  tool: vi.fn().mockResolvedValue({ functionDeclarations: toolDeclarations }),
  callTool: vi.fn(),
});

class MockTool extends BaseTool<{ param: string }, ToolResult> {
  constructor(name = 'mock-tool', description = 'A mock tool') {
    super(name, name, description, {
      type: Type.OBJECT,
      properties: {
        param: { type: Type.STRING },
      },
      required: ['param'],
    });
  }
  async execute(params: { param: string }): Promise<ToolResult> {
    return {
      llmContent: `Executed with ${params.param}`,
      returnDisplay: `Executed with ${params.param}`,
    };
  }
}

const baseConfigParams: ConfigParameters = {
  cwd: '/tmp',
  model: 'test-model',
  embeddingModel: 'test-embedding-model',
  sandbox: undefined,
  targetDir: '/test/dir',
  debugMode: false,
  userMemory: '',
  geminiMdFileCount: 0,
  approvalMode: ApprovalMode.DEFAULT,
  sessionId: 'test-session-id',
};

describe('ToolRegistry', () => {
  let config: Config;
  let toolRegistry: ToolRegistry;
  let mockConfigGetToolDiscoveryCommand: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    config = new Config(baseConfigParams);
    toolRegistry = new ToolRegistry(config);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockMcpClientConnect.mockReset().mockResolvedValue(undefined);
    mockStdioTransportClose.mockReset();
    mockSseTransportClose.mockReset();
    vi.mocked(mcpToTool).mockClear();
    vi.mocked(mcpToTool).mockReturnValue(createMockCallableTool([]));

    mockConfigGetToolDiscoveryCommand = vi.spyOn(
      config,
      'getToolDiscoveryCommand',
    );
    vi.spyOn(config, 'getMcpServers');
    vi.spyOn(config, 'getMcpServerCommand');
    mockDiscoverMcpTools.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerTool', () => {
    it('应该注册一个新工具', () => {
      const tool = new MockTool();
      toolRegistry.registerTool(tool);
      expect(toolRegistry.getTool('mock-tool')).toBe(tool);
    });
  });

  describe('getToolsByServer', () => {
    it('如果没有工具匹配服务器名称，应返回空数组', () => {
      toolRegistry.registerTool(new MockTool());
      expect(toolRegistry.getToolsByServer('any-mcp-server')).toEqual([]);
    });

    it('应仅返回匹配服务器名称的工具', async () => {
      const server1Name = 'mcp-server-uno';
      const server2Name = 'mcp-server-dos';
      const mockCallable = {} as CallableTool;
      const mcpTool1 = new DiscoveredMCPTool(
        mockCallable,
        server1Name,
        'server1Name__tool-on-server1',
        'd1',
        {},
        'tool-on-server1',
      );
      const mcpTool2 = new DiscoveredMCPTool(
        mockCallable,
        server2Name,
        'server2Name__tool-on-server2',
        'd2',
        {},
        'tool-on-server2',
      );
      const nonMcpTool = new MockTool('regular-tool');

      toolRegistry.registerTool(mcpTool1);
      toolRegistry.registerTool(mcpTool2);
      toolRegistry.registerTool(nonMcpTool);

      const toolsFromServer1 = toolRegistry.getToolsByServer(server1Name);
      expect(toolsFromServer1).toHaveLength(1);
      expect(toolsFromServer1[0].name).toBe(mcpTool1.name);

      const toolsFromServer2 = toolRegistry.getToolsByServer(server2Name);
      expect(toolsFromServer2).toHaveLength(1);
      expect(toolsFromServer2[0].name).toBe(mcpTool2.name);
    });
  });

  describe('discoverTools', () => {
    it('应在通过命令发现工具时对工具参数进行清理', async () => {
      const discoveryCommand = 'my-discovery-command';
      mockConfigGetToolDiscoveryCommand.mockReturnValue(discoveryCommand);

      const unsanitizedToolDeclaration: FunctionDeclaration = {
        name: 'tool-with-bad-format',
        description: 'A tool with an invalid format property',
        parameters: {
          type: Type.OBJECT,
          properties: {
            some_string: {
              type: Type.STRING,
              format: 'uuid', // 这是一个不支持的格式
            },
          },
        },
      };

      const mockSpawn = vi.mocked(spawn);
      const mockChildProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockChildProcess as any);

      // 模拟 stdout 数据
      mockChildProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(
            Buffer.from(
              JSON.stringify([
                { function_declarations: [unsanitizedToolDeclaration] },
              ]),
            ),
          );
        }
        return mockChildProcess as any;
      });

      // 模拟进程关闭
      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0);
        }
        return mockChildProcess as any;
      });

      await toolRegistry.discoverTools();

      const discoveredTool = toolRegistry.getTool('tool-with-bad-format');
      expect(discoveredTool).toBeDefined();

      const registeredParams = (discoveredTool as DiscoveredTool).schema
        .parameters as Schema;
      expect(registeredParams.properties?.['some_string']).toBeDefined();
      expect(registeredParams.properties?.['some_string']).toHaveProperty(
        'format',
        undefined,
      );
    });

    it('应使用 getMcpServers 中定义的 MCP 服务器发现工具', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      vi.spyOn(config, 'getMcpServerCommand').mockReturnValue(undefined);
      const mcpServerConfigVal = {
        'my-mcp-server': {
          command: 'mcp-server-cmd',
          args: ['--port', '1234'],
          trust: true,
        },
      };
      vi.spyOn(config, 'getMcpServers').mockReturnValue(mcpServerConfigVal);

      await toolRegistry.discoverTools();

      expect(mockDiscoverMcpTools).toHaveBeenCalledWith(
        mcpServerConfigVal,
        undefined,
        toolRegistry,
        false,
      );
    });

    it('应使用 getMcpServers 中定义的 MCP 服务器发现工具', async () => {
      mockConfigGetToolDiscoveryCommand.mockReturnValue(undefined);
      vi.spyOn(config, 'getMcpServerCommand').mockReturnValue(undefined);
      const mcpServerConfigVal = {
        'my-mcp-server': {
          command: 'mcp-server-cmd',
          args: ['--port', '1234'],
          trust: true,
        },
      };
      vi.spyOn(config, 'getMcpServers').mockReturnValue(mcpServerConfigVal);

      await toolRegistry.discoverTools();

      expect(mockDiscoverMcpTools).toHaveBeenCalledWith(
        mcpServerConfigVal,
        undefined,
        toolRegistry,
        false,
      );
    });
  });
});

describe('sanitizeParameters', () => {
  it('当 anyOf 存在时应移除 default', () => {
    const schema: Schema = {
      anyOf: [{ type: Type.STRING }, { type: Type.NUMBER }],
      default: 'hello',
    };
    sanitizeParameters(schema);
    expect(schema.default).toBeUndefined();
  });

  it('应递归地清理 anyOf 中的项目', () => {
    const schema: Schema = {
      anyOf: [
        {
          anyOf: [{ type: Type.STRING }],
          default: 'world',
        },
        { type: Type.NUMBER },
      ],
    };
    sanitizeParameters(schema);
    expect(schema.anyOf![0].default).toBeUndefined();
  });

  it('应递归地清理 items 中的项目', () => {
    const schema: Schema = {
      items: {
        anyOf: [{ type: Type.STRING }],
        default: 'world',
      },
    };
    sanitizeParameters(schema);
    expect(schema.items!.default).toBeUndefined();
  });

  it('应递归地清理 properties 中的项目', () => {
    const schema: Schema = {
      properties: {
        prop1: {
          anyOf: [{ type: Type.STRING }],
          default: 'world',
        },
      },
    };
    sanitizeParameters(schema);
    expect(schema.properties!.prop1.default).toBeUndefined();
  });

  it('应处理复杂的嵌套模式', () => {
    const schema: Schema = {
      properties: {
        prop1: {
          items: {
            anyOf: [{ type: Type.STRING }],
            default: 'world',
          },
        },
        prop2: {
          anyOf: [
            {
              properties: {
                nestedProp: {
                  anyOf: [{ type: Type.NUMBER }],
                  default: 123,
                },
              },
            },
          ],
        },
      },
    };
    sanitizeParameters(schema);
    expect(schema.properties!.prop1.items!.default).toBeUndefined();
    const nestedProp =
      schema.properties!.prop2.anyOf![0].properties!.nestedProp;
    expect(nestedProp?.default).toBeUndefined();
  });

  it('应从简单的字符串属性中移除不支持的格式', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        id: { type: Type.STRING, format: 'uuid' },
      },
    };
    sanitizeParameters(schema);
    expect(schema.properties?.['id']).toHaveProperty('format', undefined);
    expect(schema.properties?.['name']).not.toHaveProperty('format');
  });

  it('不应移除支持的格式值', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, format: 'date-time' },
        role: {
          type: Type.STRING,
          format: 'enum',
          enum: ['admin', 'user'],
        },
      },
    };
    const originalSchema = JSON.parse(JSON.stringify(schema));
    sanitizeParameters(schema);
    expect(schema).toEqual(originalSchema);
  });

  it('应处理对象数组', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              itemId: { type: Type.STRING, format: 'uuid' },
            },
          },
        },
      },
    };
    sanitizeParameters(schema);
    expect(
      (schema.properties?.['items']?.items as Schema)?.properties?.['itemId'],
    ).toHaveProperty('format', undefined);
  });

  it('应处理没有需要清理的属性的模式', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        count: { type: Type.NUMBER },
        isActive: { type: Type.BOOLEAN },
      },
    };
    const originalSchema = JSON.parse(JSON.stringify(schema));
    sanitizeParameters(schema);
    expect(schema).toEqual(originalSchema);
  });

  it('在空或未定义的模式上不应崩溃', () => {
    expect(() => sanitizeParameters({})).not.toThrow();
    expect(() => sanitizeParameters(undefined)).not.toThrow();
  });

  it('应处理带有循环引用的复杂嵌套模式', () => {
    const userNode: any = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, format: 'uuid' },
        name: { type: Type.STRING },
        manager: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, format: 'uuid' },
          },
        },
      },
    };
    userNode.properties.reports = {
      type: Type.ARRAY,
      items: userNode,
    };

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        ceo: userNode,
      },
    };

    expect(() => sanitizeParameters(schema)).not.toThrow();
    expect(schema.properties?.['ceo']?.properties?.['id']).toHaveProperty(
      'format',
      undefined,
    );
    expect(
      schema.properties?.['ceo']?.properties?.['manager']?.properties?.['id'],
    ).toHaveProperty('format', undefined);
  });
});