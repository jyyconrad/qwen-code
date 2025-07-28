/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, PartListUnion, Schema } from '@google/genai';

/**
 * 表示基础工具功能的接口
 */
export interface Tool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> {
  /**
   * 工具的内部名称（用于 API 调用）
   */
  name: string;

  /**
   * 工具的用户友好显示名称
   */
  displayName: string;

  /**
   * 工具功能的描述
   */
  description: string;

  /**
   * 来自 @google/genai 的函数声明模式
   */
  schema: FunctionDeclaration;

  /**
   * 工具的输出是否应渲染为 Markdown
   */
  isOutputMarkdown: boolean;

  /**
   * 工具是否支持实时（流式）输出
   */
  canUpdateOutput: boolean;

  /**
   * 验证工具的参数
   * 应从 `shouldConfirmExecute` 和 `execute` 中调用
   * 如果参数无效，`shouldConfirmExecute` 应立即返回 false
   * @param params 要验证的参数
   * @returns 如果无效则返回错误消息字符串，否则返回 null
   */
  validateToolParams(params: TParams): string | null;

  /**
   * 获取工具操作的执行前描述
   * @param params 工具执行的参数
   * @returns 描述工具将要做什么的 Markdown 字符串
   * 可选，用于向后兼容
   */
  getDescription(params: TParams): string;

  /**
   * 确定工具在执行前是否应提示确认
   * @param params 工具执行的参数
   * @returns 是否应确认执行
   */
  shouldConfirmExecute(
    params: TParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;

  /**
   * 使用给定参数执行工具
   * @param params 工具执行的参数
   * @returns 工具执行的结果
   */
  execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<TResult>;
}

/**
 * 具有通用功能的工具基础实现
 */
export abstract class BaseTool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> implements Tool<TParams, TResult>
{
  /**
   * 创建 BaseTool 的新实例
   * @param name 工具的内部名称（用于 API 调用）
   * @param displayName 工具的用户友好显示名称
   * @param description 工具功能的描述
   * @param isOutputMarkdown 工具的输出是否应渲染为 Markdown
   * @param canUpdateOutput 工具是否支持实时（流式）输出
   * @param parameterSchema 定义参数的 JSON 模式
   */
  constructor(
    readonly name: string,
    readonly displayName: string,
    readonly description: string,
    readonly parameterSchema: Schema,
    readonly isOutputMarkdown: boolean = true,
    readonly canUpdateOutput: boolean = false,
  ) {}

  /**
   * 根据名称、描述和 parameterSchema 计算出的函数声明模式
   */
  get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema,
    };
  }

  /**
   * 验证工具的参数
   * 这是一个占位实现，应被重写
   * 应从 `shouldConfirmExecute` 和 `execute` 中调用
   * 如果参数无效，`shouldConfirmExecute` 应立即返回 false
   * @param params 要验证的参数
   * @returns 如果无效则返回错误消息字符串，否则返回 null
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateToolParams(params: TParams): string | null {
    // 实现通常会使用 JSON 模式验证器
    // 这是一个占位符，应由派生类实现
    return null;
  }

  /**
   * 获取工具操作的执行前描述
   * 默认实现，应由派生类重写
   * @param params 工具执行的参数
   * @returns 描述工具将要做什么的 Markdown 字符串
   */
  getDescription(params: TParams): string {
    return JSON.stringify(params);
  }

  /**
   * 确定工具在执行前是否应提示确认
   * @param params 工具执行的参数
   * @returns 是否应由用户确认执行
   */
  shouldConfirmExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: TParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * 使用给定参数执行工具的抽象方法
   * 必须由派生类实现
   * @param params 工具执行的参数
   * @param signal 用于工具取消的 AbortSignal
   * @returns 工具执行的结果
   */
  abstract execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<TResult>;
}

export interface ToolResult {
  /**
   * 工具操作和结果的简短一行摘要。
   * 例如："读取了 5 个文件"，"向 foo.txt 写入了 256 字节"
   */
  summary?: string;
  /**
   * 旨在包含在 LLM 历史中的内容。
   * 这应代表工具执行的事实结果。
   */
  llmContent: PartListUnion;

  /**
   * 用于用户显示的 Markdown 字符串。
   * 这提供了结果的用户友好摘要或可视化。
   * 注意：这也可能被认为是特定于 UI 的，如果服务器变为纯 API 驱动，
   * 在进一步重构中可能会被移除或修改。
   * 目前，我们保留它，因为 ReadFileTool 中的核心逻辑目前会生成它。
   */
  returnDisplay: ToolResultDisplay;
}

export type ToolResultDisplay = string | FileDiff;

export interface FileDiff {
  fileDiff: string;
  fileName: string;
}

export interface ToolEditConfirmationDetails {
  type: 'edit';
  title: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
  fileName: string;
  fileDiff: string;
  isModifying?: boolean;
}

export interface ToolConfirmationPayload {
  // 用于在内联修改流程中覆盖可修改工具的 `modifiedProposedContent`
  newContent: string;
}

export interface ToolExecuteConfirmationDetails {
  type: 'exec';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  command: string;
  rootCommand: string;
}

export interface ToolMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

export interface ToolInfoConfirmationDetails {
  type: 'info';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  prompt: string;
  urls?: string[];
}

export type ToolCallConfirmationDetails =
  | ToolEditConfirmationDetails
  | ToolExecuteConfirmationDetails
  | ToolMcpConfirmationDetails
  | ToolInfoConfirmationDetails;

export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}