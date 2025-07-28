/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolMcpConfirmationDetails,
} from './tools.js';
import { CallableTool, Part, FunctionCall, Schema } from '@google/genai';

type ToolParams = Record<string, unknown>;

export class DiscoveredMCPTool extends BaseTool<ToolParams, ToolResult> {
  private static readonly allowlist: Set<string> = new Set();

  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Schema,
    readonly serverToolName: string,
    readonly timeout?: number,
    readonly trust?: boolean,
  ) {
    super(
      name,
      `${serverToolName} (${serverName} MCP Server)`,
      description,
      parameterSchema,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  async shouldConfirmExecute(
    _params: ToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const serverAllowListKey = this.serverName;
    const toolAllowListKey = `${this.serverName}.${this.serverToolName}`;

    if (this.trust) {
      return false; // 服务器受信任，无需确认
    }

    if (
      DiscoveredMCPTool.allowlist.has(serverAllowListKey) ||
      DiscoveredMCPTool.allowlist.has(toolAllowListKey)
    ) {
      return false; // 服务器和/或工具已在白名单中
    }

    const confirmationDetails: ToolMcpConfirmationDetails = {
      type: 'mcp',
      title: '确认 MCP 工具执行',
      serverName: this.serverName,
      toolName: this.serverToolName, // 在确认中显示原始工具名称
      toolDisplayName: this.name, // 显示暴露给模型和用户的全局注册表名称
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
          DiscoveredMCPTool.allowlist.add(serverAllowListKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
          DiscoveredMCPTool.allowlist.add(toolAllowListKey);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const functionCalls: FunctionCall[] = [
      {
        name: this.serverToolName,
        args: params,
      },
    ];

    const responseParts: Part[] = await this.mcpTool.callTool(functionCalls);

    return {
      llmContent: responseParts,
      returnDisplay: getStringifiedResultForDisplay(responseParts),
    };
  }
}

/**
 * 处理一个 `Part` 对象数组，主要来自工具的执行结果，
 * 生成用户友好的字符串表示形式，通常用于 CLI 中显示。
 *
 * `result` 数组可以包含各种类型的 `Part` 对象：
 * 1. `FunctionResponse` 部分：
 *    - 如果 `FunctionResponse` 的 `response.content` 是一个仅由
 *      `TextPart` 对象组成的数组，则将其文本内容连接成单个字符串。
 *      这是为了直接呈现简单的文本输出。
 *    - 如果 `response.content` 是一个数组但包含其他类型的 `Part` 对象（或混合），
 *      则保留 `content` 数组本身。这处理工具返回的结构化数据，如 JSON 对象或数组。
 *    - 如果 `response.content` 不是数组或缺失，则保留整个 `functionResponse`
 *      对象。
 * 2. 其他 `Part` 类型（例如，`result` 数组中的直接 `TextPart`）：
 *    - 这些将按原样保留。
 *
 * 所有处理过的部分都会被收集到一个数组中，然后使用 JSON.stringify 进行序列化，
 * 并带有缩进，最后包装在 markdown JSON 代码块中。
 */
function getStringifiedResultForDisplay(result: Part[]) {
  if (!result || result.length === 0) {
    return '```json\n[]\n```';
  }

  const processFunctionResponse = (part: Part) => {
    if (part.functionResponse) {
      const responseContent = part.functionResponse.response?.content;
      if (responseContent && Array.isArray(responseContent)) {
        // 检查 responseContent 中的所有部分是否都是简单的 TextPart
        const allTextParts = responseContent.every(
          (p: Part) => p.text !== undefined,
        );
        if (allTextParts) {
          return responseContent.map((p: Part) => p.text).join('');
        }
        // 如果不是所有简单文本部分，则返回这些内容部分的数组以供 JSON 序列化
        return responseContent;
      }

      // 如果没有内容，或不是数组，或不是 functionResponse，则序列化整个 functionResponse 部分以供检查
      return part.functionResponse;
    }
    return part; // 对于意外结构或非 FunctionResponsePart 的回退
  };

  const processedResults =
    result.length === 1
      ? processFunctionResponse(result[0])
      : result.map(processFunctionResponse);
  if (typeof processedResults === 'string') {
    return processedResults;
  }

  return '```json\n' + JSON.stringify(processedResults, null, 2) + '\n```';
}