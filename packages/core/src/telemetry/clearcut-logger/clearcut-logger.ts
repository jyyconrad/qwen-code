/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from 'buffer';
import * as https from 'https';
import {
  StartSessionEvent,
  EndSessionEvent,
  UserPromptEvent,
  ToolCallEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
  FlashFallbackEvent,
  LoopDetectedEvent,
} from '../types.js';
import { EventMetadataKey } from './event-metadata-key.js';
import { Config } from '../../config/config.js';
import { getInstallationId } from '../../utils/user_id.js';
import {
  getCachedGoogleAccount,
  getLifetimeGoogleAccounts,
} from '../../utils/user_account.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';

const start_session_event_name = 'start_session';
const new_prompt_event_name = 'new_prompt';
const tool_call_event_name = 'tool_call';
const api_request_event_name = 'api_request';
const api_response_event_name = 'api_response';
const api_error_event_name = 'api_error';
const end_session_event_name = 'end_session';
const flash_fallback_event_name = 'flash_fallback';
const loop_detected_event_name = 'loop_detected';

export interface LogResponse {
  nextRequestWaitMs?: number;
}

// 用于批量发布日志事件到 Clearcut 的单例类。当新事件到来时，会检查经过的时间，
// 如果距离上次刷新至少已过去一分钟，则将事件刷新到 Clearcut。
export class ClearcutLogger {
  private static instance: ClearcutLogger;
  private config?: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Clearcut 期望这种格式。
  private readonly events: any = [];
  private last_flush_time: number = Date.now();
  private flush_interval_ms: number = 1000 * 60; // 至少等待一分钟再刷新事件。

  private constructor(config?: Config) {
    this.config = config;
  }

  static getInstance(config?: Config): ClearcutLogger | undefined {
    if (config === undefined || !config?.getUsageStatisticsEnabled())
      return undefined;
    if (!ClearcutLogger.instance) {
      ClearcutLogger.instance = new ClearcutLogger(config);
    }
    return ClearcutLogger.instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Clearcut 期望这种格式。
  enqueueLogEvent(event: any): void {
    this.events.push([
      {
        event_time_ms: Date.now(),
        source_extension_json: safeJsonStringify(event),
      },
    ]);
  }

  createLogEvent(name: string, data: object[]): object {
    const email = getCachedGoogleAccount();
    const totalAccounts = getLifetimeGoogleAccounts();
    data.push({
      gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
      value: totalAccounts.toString(),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logEvent: any = {
      console_type: 'GEMINI_CLI',
      application: 102,
      event_name: name,
      event_metadata: [data] as object[],
    };

    // 应记录电子邮件或安装 ID，不能同时记录两者。参见 go/cloudmill-1p-oss-instrumentation#define-sessionable-id
    if (email) {
      logEvent.client_email = email;
    } else {
      logEvent.client_install_id = getInstallationId();
    }

    return logEvent;
  }

  flushIfNeeded(): void {
    if (Date.now() - this.last_flush_time < this.flush_interval_ms) {
      return;
    }

    this.flushToClearcut().catch((error) => {
      console.debug('刷新到 Clearcut 时出错:', error);
    });
  }

  flushToClearcut(): Promise<LogResponse> {
    if (this.config?.getDebugMode()) {
      console.log('正在将日志事件刷新到 Clearcut。');
    }
    const eventsToSend = [...this.events];
    this.events.length = 0;

    return new Promise<Buffer>((resolve, reject) => {
      const request = [
        {
          log_source_name: 'CONCORD',
          request_time_ms: Date.now(),
          log_event: eventsToSend,
        },
      ];
      const body = safeJsonStringify(request);
      const options = {
        hostname: 'play.googleapis.com',
        path: '/log',
        method: 'POST',
        headers: { 'Content-Length': Buffer.byteLength(body) },
      };
      const bufs: Buffer[] = [];
      const req = https.request(options, (res) => {
        res.on('data', (buf) => bufs.push(buf));
        res.on('end', () => {
          resolve(Buffer.concat(bufs));
        });
      });
      req.on('error', (e) => {
        if (this.config?.getDebugMode()) {
          console.log('Clearcut POST 请求错误: ', e);
        }
        // 将事件重新添加到队列前端以便重试。
        this.events.unshift(...eventsToSend);
        reject(e);
      });
      req.end(body);
    })
      .then((buf: Buffer) => {
        try {
          this.last_flush_time = Date.now();
          return this.decodeLogResponse(buf) || {};
        } catch (error: unknown) {
          console.error('刷新日志事件时出错:', error);
          return {};
        }
      })
      .catch((error: unknown) => {
        // 处理所有错误以防止未处理的 Promise 拒绝
        console.error('刷新日志事件时出错:', error);
        // 返回空响应以维持 Promise<LogResponse> 合约
        return {};
      });
  }

  // 可见用于测试。解码来自 Clearcut 服务器的 protobuf 编码响应。
  decodeLogResponse(buf: Buffer): LogResponse | undefined {
    // TODO(obrienowen): 返回特定错误以促进调试。
    if (buf.length < 1) {
      return undefined;
    }

    // 缓冲区的第一个字节是 `field<<3 | type`。我们正在寻找字段 1，
    // 类型为 varint，由 type=0 表示。如果第一个字节不是 8，
    // 则表示字段 1 缺失或消息已损坏。无论哪种情况，我们都返回 undefined。
    if (buf.readUInt8(0) !== 8) {
      return undefined;
    }

    let ms = BigInt(0);
    let cont = true;

    // 在每个字节中，最高有效位是延续位。如果设置了该位，我们继续读取。
    // 最低 7 位是数据位。它们按相反顺序连接形成最终数字。
    for (let i = 1; cont && i < buf.length; i++) {
      const byte = buf.readUInt8(i);
      ms |= BigInt(byte & 0x7f) << BigInt(7 * (i - 1));
      cont = (byte & 0x80) !== 0;
    }

    if (cont) {
      // 我们已超出缓冲区但未看到终止字节。消息已损坏。
      return undefined;
    }

    const returnVal = {
      nextRequestWaitMs: Number(ms),
    };
    return returnVal;
  }

  logStartSessionEvent(event: StartSessionEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_MODEL,
        value: event.model,
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_EMBEDDING_MODEL,
        value: event.embedding_model,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_SANDBOX,
        value: event.sandbox_enabled.toString(),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_CORE_TOOLS,
        value: event.core_tools_enabled,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_APPROVAL_MODE,
        value: event.approval_mode,
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_API_KEY_ENABLED,
        value: event.api_key_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_VERTEX_API_ENABLED,
        value: event.vertex_ai_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_DEBUG_MODE_ENABLED,
        value: event.debug_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_VERTEX_API_ENABLED,
        value: event.vertex_ai_enabled.toString(),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_MCP_SERVERS,
        value: event.mcp_servers,
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_VERTEX_API_ENABLED,
        value: event.vertex_ai_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_TELEMETRY_ENABLED,
        value: event.telemetry_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_TELEMETRY_LOG_USER_PROMPTS_ENABLED,
        value: event.telemetry_log_user_prompts_enabled.toString(),
      },
    ];
    // 立即刷新开始事件
    this.enqueueLogEvent(this.createLogEvent(start_session_event_name, data));
    this.flushToClearcut().catch((error) => {
      console.debug('刷新到 Clearcut 时出错:', error);
    });
  }

  logNewPromptEvent(event: UserPromptEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_USER_PROMPT_LENGTH,
        value: JSON.stringify(event.prompt_length),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(new_prompt_event_name, data));
    this.flushIfNeeded();
  }

  logToolCallEvent(event: ToolCallEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_NAME,
        value: JSON.stringify(event.function_name),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_DECISION,
        value: JSON.stringify(event.decision),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_SUCCESS,
        value: JSON.stringify(event.success),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_DURATION_MS,
        value: JSON.stringify(event.duration_ms),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_ERROR_MESSAGE,
        value: JSON.stringify(event.error),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_ERROR_TYPE,
        value: JSON.stringify(event.error_type),
      },
    ];

    const logEvent = this.createLogEvent(tool_call_event_name, data);
    this.enqueueLogEvent(logEvent);
    this.flushIfNeeded();
  }

  logApiRequestEvent(event: ApiRequestEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_REQUEST_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(api_request_event_name, data));
    this.flushIfNeeded();
  }

  logApiResponseEvent(event: ApiResponseEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_RESPONSE_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_RESPONSE_STATUS_CODE,
        value: JSON.stringify(event.status_code),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_RESPONSE_DURATION_MS,
        value: JSON.stringify(event.duration_ms),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_MESSAGE,
        value: JSON.stringify(event.error),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_INPUT_TOKEN_COUNT,
        value: JSON.stringify(event.input_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_OUTPUT_TOKEN_COUNT,
        value: JSON.stringify(event.output_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_CACHED_TOKEN_COUNT,
        value: JSON.stringify(event.cached_content_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_THINKING_TOKEN_COUNT,
        value: JSON.stringify(event.thoughts_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_TOOL_TOKEN_COUNT,
        value: JSON.stringify(event.tool_token_count),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(api_response_event_name, data));
    this.flushIfNeeded();
  }

  logApiErrorEvent(event: ApiErrorEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_TYPE,
        value: JSON.stringify(event.error_type),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_STATUS_CODE,
        value: JSON.stringify(event.status_code),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_DURATION_MS,
        value: JSON.stringify(event.duration_ms),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(api_error_event_name, data));
    this.flushIfNeeded();
  }

  logFlashFallbackEvent(event: FlashFallbackEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(flash_fallback_event_name, data));
    this.flushToClearcut().catch((error) => {
      console.debug('刷新到 Clearcut 时出错:', error);
    });
  }

  logLoopDetectedEvent(event: LoopDetectedEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_LOOP_DETECTED_TYPE,
        value: JSON.stringify(event.loop_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(loop_detected_event_name, data));
    this.flushIfNeeded();
  }

  logEndSessionEvent(event: EndSessionEvent): void {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_END_SESSION_ID,
        value: event?.session_id?.toString() ?? '',
      },
    ];

    // 在会话结束时立即刷新。
    this.enqueueLogEvent(this.createLogEvent(end_session_event_name, data));
    this.flushToClearcut().catch((error) => {
      console.debug('刷新到 Clearcut 时出错:', error);
    });
  }

  shutdown() {
    const event = new EndSessionEvent(this.config);
    this.logEndSessionEvent(event);
  }
}