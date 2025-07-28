/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 定义用于 Clearcut 日志记录的有效事件元数据键。
export enum EventMetadataKey {
  GEMINI_CLI_KEY_UNKNOWN = 0,

  // ==========================================================================
  // 会话开始事件键
  // ===========================================================================

  // 记录会话中使用的模型 ID。
  GEMINI_CLI_START_SESSION_MODEL = 1,

  // 记录会话中使用的嵌入模型 ID。
  GEMINI_CLI_START_SESSION_EMBEDDING_MODEL = 2,

  // 记录会话中使用的沙箱。
  GEMINI_CLI_START_SESSION_SANDBOX = 3,

  // 记录会话中启用的核心工具。
  GEMINI_CLI_START_SESSION_CORE_TOOLS = 4,

  // 记录会话中使用的审批模式。
  GEMINI_CLI_START_SESSION_APPROVAL_MODE = 5,

  // 记录会话中是否使用了 API 密钥。
  GEMINI_CLI_START_SESSION_API_KEY_ENABLED = 6,

  // 记录会话中是否使用了 Vertex API。
  GEMINI_CLI_START_SESSION_VERTEX_API_ENABLED = 7,

  // 记录会话中是否启用了调试模式。
  GEMINI_CLI_START_SESSION_DEBUG_MODE_ENABLED = 8,

  // 记录会话中启用的 MCP 服务器。
  GEMINI_CLI_START_SESSION_MCP_SERVERS = 9,

  // 记录会话中是否启用了用户收集的遥测数据。
  GEMINI_CLI_START_SESSION_TELEMETRY_ENABLED = 10,

  // 记录是否为用户收集的遥测数据启用了提示收集。
  GEMINI_CLI_START_SESSION_TELEMETRY_LOG_USER_PROMPTS_ENABLED = 11,

  // 记录会话是否配置为尊重 gitignore 文件。
  GEMINI_CLI_START_SESSION_RESPECT_GITIGNORE = 12,

  // ==========================================================================
  // 用户提示事件键
  // ===========================================================================

  // 记录提示的长度。
  GEMINI_CLI_USER_PROMPT_LENGTH = 13,

  // ==========================================================================
  // 工具调用事件键
  // ===========================================================================

  // 记录函数名称。
  GEMINI_CLI_TOOL_CALL_NAME = 14,

  // 记录用户关于如何处理工具调用的决定。
  GEMINI_CLI_TOOL_CALL_DECISION = 15,

  // 记录工具调用是否成功。
  GEMINI_CLI_TOOL_CALL_SUCCESS = 16,

  // 记录工具调用的持续时间（毫秒）。
  GEMINI_CLI_TOOL_CALL_DURATION_MS = 17,

  // 记录工具调用的错误消息（如果有）。
  GEMINI_CLI_TOOL_ERROR_MESSAGE = 18,

  // 记录工具调用的错误类型（如果有）。
  GEMINI_CLI_TOOL_CALL_ERROR_TYPE = 19,

  // ==========================================================================
  // GenAI API 请求事件键
  // ===========================================================================

  // 记录请求的模型 ID。
  GEMINI_CLI_API_REQUEST_MODEL = 20,

  // ==========================================================================
  // GenAI API 响应事件键
  // ===========================================================================

  // 记录 API 调用的模型 ID。
  GEMINI_CLI_API_RESPONSE_MODEL = 21,

  // 记录响应的状态码。
  GEMINI_CLI_API_RESPONSE_STATUS_CODE = 22,

  // 记录 API 调用的持续时间（毫秒）。
  GEMINI_CLI_API_RESPONSE_DURATION_MS = 23,

  // 记录 API 调用的错误消息（如果有）。
  GEMINI_CLI_API_ERROR_MESSAGE = 24,

  // 记录 API 调用的输入令牌数。
  GEMINI_CLI_API_RESPONSE_INPUT_TOKEN_COUNT = 25,

  // 记录 API 调用的输出令牌数。
  GEMINI_CLI_API_RESPONSE_OUTPUT_TOKEN_COUNT = 26,

  // 记录 API 调用的缓存令牌数。
  GEMINI_CLI_API_RESPONSE_CACHED_TOKEN_COUNT = 27,

  // 记录 API 调用的思考令牌数。
  GEMINI_CLI_API_RESPONSE_THINKING_TOKEN_COUNT = 28,

  // 记录 API 调用的工具使用令牌数。
  GEMINI_CLI_API_RESPONSE_TOOL_TOKEN_COUNT = 29,

  // ==========================================================================
  // GenAI API 错误事件键
  // ===========================================================================

  // 记录 API 调用的模型 ID。
  GEMINI_CLI_API_ERROR_MODEL = 30,

  // 记录错误类型。
  GEMINI_CLI_API_ERROR_TYPE = 31,

  // 记录错误响应的状态码。
  GEMINI_CLI_API_ERROR_STATUS_CODE = 32,

  // 记录 API 调用的持续时间（毫秒）。
  GEMINI_CLI_API_ERROR_DURATION_MS = 33,

  // ==========================================================================
  // 会话结束事件键
  // ===========================================================================

  // 记录会话的结束。
  GEMINI_CLI_END_SESSION_ID = 34,

  // ==========================================================================
  // 共享键
  // ===========================================================================

  // 记录提示 ID
  GEMINI_CLI_PROMPT_ID = 35,

  // 记录提示、API 响应和错误的身份验证类型。
  GEMINI_CLI_AUTH_TYPE = 36,

  // 记录曾经使用过的 Google 账户总数。
  GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT = 37,

  // ==========================================================================
  // 检测到循环事件键
  // ===========================================================================

  // 记录检测到的循环类型。
  GEMINI_CLI_LOOP_DETECTED_TYPE = 38,
}

export function getEventMetadataKey(
  keyName: string,
): EventMetadataKey | undefined {
  // 通过字符串名称访问枚举成员
  const key = EventMetadataKey[keyName as keyof typeof EventMetadataKey];

  // 检查结果是否为有效的枚举成员（非 undefined 且为数字）
  if (typeof key === 'number') {
    return key;
  }
  return undefined;
}