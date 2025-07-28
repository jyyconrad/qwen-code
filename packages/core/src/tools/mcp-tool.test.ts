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
import { DiscoveredMCPTool } from './mcp-tool.js'; // Added getStringifiedResultForDisplay
import { ToolResult, ToolConfirmationOutcome } from './tools.js'; // Added ToolConfirmationOutcome
import { CallableTool, Part } from '@google/genai';

// Mock @google/genai mcpToTool and CallableTool
// 我们只需要模拟 DiscoveredMCPTool 使用的 CallableTool 的部分方法。
const mockCallTool = vi.fn();
const mockToolMethod = vi.fn();

const mockCallableToolInstance: Mocked<CallableTool> = {
  tool: mockToolMethod as any, // DiscoveredMCPTool 实例方法不直接使用
  callTool: mockCallTool as any,
  // 如果 DiscoveredMCPTool 开始使用其他方法，请添加
};

describe('DiscoveredMCPTool', () => {
  const serverName = 'mock-mcp-server';
  const toolNameForModel = 'test-mcp-tool-for-model';
  const serverToolName = 'actual-server-tool-name';
  const baseDescription = '一个测试 MCP 工具。';
  const inputSchema: Record<string, unknown> = {
    type: 'object' as const,
    properties: { param: { type: 'string' } },
    required: ['param'],
  };

  beforeEach(() => {
    mockCallTool.mockClear();
    mockToolMethod.mockClear();
    // 在每个相关测试前清除允许列表，特别是 shouldConfirmExecute
    (DiscoveredMCPTool as any).allowlist.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('应正确设置属性（非通用服务器）', () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName, // serverName 是 'mock-mcp-server'，不是 'mcp'
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );

      expect(tool.name).toBe(toolNameForModel);
      expect(tool.schema.name).toBe(toolNameForModel);
      expect(tool.schema.description).toBe(baseDescription);
      expect(tool.schema.parameters).toEqual(inputSchema);
      expect(tool.serverToolName).toBe(serverToolName);
      expect(tool.timeout).toBeUndefined();
    });

    it('应正确设置属性（通用 "mcp" 服务器）', () => {
      const genericServerName = 'mcp';
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        genericServerName, // serverName 是 'mcp'
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      expect(tool.schema.description).toBe(baseDescription);
    });

    it('应接受并存储自定义超时时间', () => {
      const customTimeout = 5000;
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        customTimeout,
      );
      expect(tool.timeout).toBe(customTimeout);
    });
  });

  describe('execute', () => {
    it('应使用正确参数调用 mcpTool.callTool 并格式化显示输出', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'testValue' };
      const mockToolSuccessResultObject = {
        success: true,
        details: 'executed',
      };
      const mockFunctionResponseContent: Part[] = [
        { text: JSON.stringify(mockToolSuccessResultObject) },
      ];
      const mockMcpToolResponseParts: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: { content: mockFunctionResponseContent },
          },
        },
      ];
      mockCallTool.mockResolvedValue(mockMcpToolResponseParts);

      const toolResult: ToolResult = await tool.execute(params);

      expect(mockCallTool).toHaveBeenCalledWith([
        { name: serverToolName, args: params },
      ]);
      expect(toolResult.llmContent).toEqual(mockMcpToolResponseParts);

      const stringifiedResponseContent = JSON.stringify(
        mockToolSuccessResultObject,
      );
      expect(toolResult.returnDisplay).toBe(stringifiedResponseContent);
    });

    it('应处理 getStringifiedResultForDisplay 返回的空结果', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'testValue' };
      const mockMcpToolResponsePartsEmpty: Part[] = [];
      mockCallTool.mockResolvedValue(mockMcpToolResponsePartsEmpty);
      const toolResult: ToolResult = await tool.execute(params);
      expect(toolResult.returnDisplay).toBe('```json\n[]\n```');
    });

    it('如果 mcpTool.callTool 拒绝，应传播拒绝', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'failCase' };
      const expectedError = new Error('MCP 调用失败');
      mockCallTool.mockRejectedValue(expectedError);

      await expect(tool.execute(params)).rejects.toThrow(expectedError);
    });
  });

  describe('shouldConfirmExecute', () => {
    // beforeEach 已经清除了允许列表

    it('如果信任为 true，应返回 false', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        undefined,
        true,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
    });

    it('如果服务器在允许列表中，应返回 false', async () => {
      (DiscoveredMCPTool as any).allowlist.add(serverName);
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
    });

    it('如果工具在允许列表中，应返回 false', async () => {
      const toolAllowlistKey = `${serverName}.${serverToolName}`;
      (DiscoveredMCPTool as any).allowlist.add(toolAllowlistKey);
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
    });

    it('如果不受信任且不在允许列表中，应返回确认详情', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (confirmation && confirmation.type === 'mcp') {
        // ToolMcpConfirmationDetails 的类型守卫
        expect(confirmation.type).toBe('mcp');
        expect(confirmation.serverName).toBe(serverName);
        expect(confirmation.toolName).toBe(serverToolName);
      } else if (confirmation) {
        // 处理其他可能的确认类型（如有必要），或加强测试（如果只期望 MCP）
        throw new Error(
          '确认类型不是预期的 MCP 或为 false',
        );
      } else {
        throw new Error(
          '确认详情格式不正确或为 false',
        );
      }
    });

    it('在 ProceedAlwaysServer 时应将服务器添加到允许列表', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(
          ToolConfirmationOutcome.ProceedAlwaysServer,
        );
        expect((DiscoveredMCPTool as any).allowlist.has(serverName)).toBe(true);
      } else {
        throw new Error(
          '确认详情或 onConfirm 格式不正确',
        );
      }
    });

    it('在 ProceedAlwaysTool 时应将工具添加到允许列表', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const toolAllowlistKey = `${serverName}.${serverToolName}`;
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedAlwaysTool);
        expect((DiscoveredMCPTool as any).allowlist.has(toolAllowlistKey)).toBe(
          true,
        );
      } else {
        throw new Error(
          '确认详情或 onConfirm 格式不正确',
        );
      }
    });
  });
});