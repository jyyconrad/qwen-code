/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';

export async function startIDEServer(_context: vscode.ExtensionContext) {
  const app = express();
  app.use(express.json());

  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  mcpServer.connect(transport);

  app.post('/mcp', async (req: Request, res: Response) => {
    console.log('收到 MCP 请求:', req.body);
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('处理 MCP 请求时出错:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: '内部服务器错误',
          },
          id: null,
        });
      }
    }
  });

  // 处理 SSE 流的 GET 请求
  app.get('/mcp', async (req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').send('方法不被允许');
  });

  // 启动服务器
  // TODO(#3918): 动态生成并写入环境变量
  const PORT = 3000;
  app.listen(PORT, (error) => {
    if (error) {
      console.error('启动服务器失败:', error);
      vscode.window.showErrorMessage(
        `Companion 服务器启动失败，端口 ${PORT}: ${error.message}`,
      );
    }
    console.log(`MCP 可流式 HTTP 服务器正在监听端口 ${PORT}`);
  });
}

const createMcpServer = () => {
  const server = new McpServer({
    name: 'vscode-ide-server',
    version: '1.0.0',
  });
  server.registerTool(
    'getActiveFile',
    {
      description:
        '(IDE 工具) 获取 VS Code 中当前活动文件的路径。',
      inputSchema: {},
    },
    async () => {
      try {
        const activeEditor = vscode.window.activeTextEditor;
        const filePath = activeEditor
          ? activeEditor.document.uri.fsPath
          : undefined;
        if (filePath) {
          return {
            content: [{ type: 'text', text: `活动文件: ${filePath}` }],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: '编辑器中当前没有活动文件。',
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `获取活动文件失败: ${
                (error as Error).message || '未知错误'
              }`,
            },
          ],
        };
      }
    },
  );
  return server;
};