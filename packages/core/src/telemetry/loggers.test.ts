/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  CompletedToolCall,
  ContentGeneratorConfig,
  EditTool,
  ErroredToolCall,
  GeminiClient,
  ToolConfirmationOutcome,
  ToolRegistry,
} from '../index.js';
import { logs } from '@opentelemetry/api-logs';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { Config } from '../config/config.js';
import {
  EVENT_API_REQUEST,
  EVENT_API_RESPONSE,
  EVENT_CLI_CONFIG,
  EVENT_TOOL_CALL,
  EVENT_USER_PROMPT,
  EVENT_FLASH_FALLBACK,
} from './constants.js';
import {
  logApiRequest,
  logApiResponse,
  logCliConfiguration,
  logUserPrompt,
  logToolCall,
  logFlashFallback,
} from './loggers.js';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  StartSessionEvent,
  ToolCallDecision,
  ToolCallEvent,
  UserPromptEvent,
  FlashFallbackEvent,
} from './types.js';
import * as metrics from './metrics.js';
import * as sdk from './sdk.js';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { GenerateContentResponseUsageMetadata } from '@google/genai';
import * as uiTelemetry from './uiTelemetry.js';

describe('loggers', () => {
  const mockLogger = {
    emit: vi.fn(),
  };
  const mockUiEvent = {
    addEvent: vi.fn(),
  };

  beforeEach(() => {
    vi.spyOn(sdk, 'isTelemetrySdkInitialized').mockReturnValue(true);
    vi.spyOn(logs, 'getLogger').mockReturnValue(mockLogger);
    vi.spyOn(uiTelemetry.uiTelemetryService, 'addEvent').mockImplementation(
      mockUiEvent.addEvent,
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  describe('logCliConfiguration', () => {
    it('应记录 CLI 配置', () => {
      const mockConfig = {
        getSessionId: () => 'test-session-id',
        getModel: () => 'test-model',
        getEmbeddingModel: () => 'test-embedding-model',
        getSandbox: () => true,
        getCoreTools: () => ['ls', 'read-file'],
        getApprovalMode: () => 'default',
        getContentGeneratorConfig: () => ({
          model: 'test-model',
          apiKey: 'test-api-key',
          authType: AuthType.USE_VERTEX_AI,
        }),
        getTelemetryEnabled: () => true,
        getUsageStatisticsEnabled: () => true,
        getTelemetryLogPromptsEnabled: () => true,
        getFileFilteringRespectGitIgnore: () => true,
        getFileFilteringAllowBuildArtifacts: () => false,
        getDebugMode: () => true,
        getMcpServers: () => ({
          'test-server': {
            command: 'test-command',
          },
        }),
        getQuestion: () => 'test-question',
        getTargetDir: () => 'target-dir',
        getProxy: () => 'http://test.proxy.com:8080',
      } as unknown as Config;

      const startSessionEvent = new StartSessionEvent(mockConfig);
      logCliConfiguration(mockConfig, startSessionEvent);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'CLI 配置已加载。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_CLI_CONFIG,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
          embedding_model: 'test-embedding-model',
          sandbox_enabled: true,
          core_tools_enabled: 'ls,read-file',
          approval_mode: 'default',
          api_key_enabled: true,
          vertex_ai_enabled: true,
          log_user_prompts_enabled: true,
          file_filtering_respect_git_ignore: true,
          debug_mode: true,
          mcp_servers: 'test-server',
        },
      });
    });
  });

  describe('logUserPrompt', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    it('应记录用户提示', () => {
      const event = new UserPromptEvent(
        11,
        'prompt-id-8',
        AuthType.USE_VERTEX_AI,
        'test-prompt',
      );

      logUserPrompt(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '用户提示。长度：11。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          prompt_length: 11,
          prompt: 'test-prompt',
        },
      });
    });

    it('如果禁用则不应记录提示', () => {
      const mockConfig = {
        getSessionId: () => 'test-session-id',
        getTelemetryEnabled: () => true,
        getTelemetryLogPromptsEnabled: () => false,
        getTargetDir: () => 'target-dir',
        getUsageStatisticsEnabled: () => true,
      } as unknown as Config;
      const event = new UserPromptEvent(
        11,
        'test-prompt',
        AuthType.CLOUD_SHELL,
      );

      logUserPrompt(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '用户提示。长度：11。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          prompt_length: 11,
        },
      });
    });
  });

  describe('logApiResponse', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
    } as Config;

    const mockMetrics = {
      recordApiResponseMetrics: vi.fn(),
      recordTokenUsageMetrics: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordApiResponseMetrics').mockImplementation(
        mockMetrics.recordApiResponseMetrics,
      );
      vi.spyOn(metrics, 'recordTokenUsageMetrics').mockImplementation(
        mockMetrics.recordTokenUsageMetrics,
      );
    });

    it('应记录包含所有字段的 API 响应', () => {
      const usageData: GenerateContentResponseUsageMetadata = {
        promptTokenCount: 17,
        candidatesTokenCount: 50,
        cachedContentTokenCount: 10,
        thoughtsTokenCount: 5,
        toolUsePromptTokenCount: 2,
      };
      const event = new ApiResponseEvent(
        'test-model',
        100,
        'prompt-id-1',
        AuthType.LOGIN_WITH_GOOGLE,
        usageData,
        'test-response',
      );

      logApiResponse(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '来自 test-model 的 API 响应。状态：200。持续时间：100ms。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_API_RESPONSE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          [SemanticAttributes.HTTP_STATUS_CODE]: 200,
          model: 'test-model',
          status_code: 200,
          duration_ms: 100,
          input_token_count: 17,
          output_token_count: 50,
          cached_content_token_count: 10,
          thoughts_token_count: 5,
          tool_token_count: 2,
          total_token_count: 0,
          response_text: 'test-response',
          prompt_id: 'prompt-id-1',
          auth_type: 'oauth-personal',
        },
      });

      expect(mockMetrics.recordApiResponseMetrics).toHaveBeenCalledWith(
        mockConfig,
        'test-model',
        100,
        200,
        undefined,
      );

      expect(mockMetrics.recordTokenUsageMetrics).toHaveBeenCalledWith(
        mockConfig,
        'test-model',
        50,
        'output',
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_API_RESPONSE,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('应记录带有错误的 API 响应', () => {
      const usageData: GenerateContentResponseUsageMetadata = {
        promptTokenCount: 17,
        candidatesTokenCount: 50,
        cachedContentTokenCount: 10,
        thoughtsTokenCount: 5,
        toolUsePromptTokenCount: 2,
      };
      const event = new ApiResponseEvent(
        'test-model',
        100,
        'prompt-id-1',
        AuthType.USE_GEMINI,
        usageData,
        'test-response',
        'test-error',
      );

      logApiResponse(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '来自 test-model 的 API 响应。状态：200。持续时间：100ms。',
        attributes: {
          'session.id': 'test-session-id',
          ...event,
          'event.name': EVENT_API_RESPONSE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          'error.message': 'test-error',
        },
      });

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_API_RESPONSE,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });
  });

  describe('logApiRequest', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
    } as Config;

    it('应记录带有 request_text 的 API 请求', () => {
      const event = new ApiRequestEvent(
        'test-model',
        'prompt-id-7',
        'This is a test request',
      );

      logApiRequest(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '向 test-model 发起的 API 请求。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_API_REQUEST,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
          request_text: 'This is a test request',
          prompt_id: 'prompt-id-7',
        },
      });
    });

    it('应记录不带 request_text 的 API 请求', () => {
      const event = new ApiRequestEvent('test-model', 'prompt-id-6');

      logApiRequest(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '向 test-model 发起的 API 请求。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_API_REQUEST,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
          prompt_id: 'prompt-id-6',
        },
      });
    });
  });

  describe('logFlashFallback', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    it('应记录闪回降级事件', () => {
      const event = new FlashFallbackEvent(AuthType.USE_VERTEX_AI);

      logFlashFallback(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '切换到闪回作为降级方案。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_FLASH_FALLBACK,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          auth_type: 'vertex-ai',
        },
      });
    });
  });

  describe('logToolCall', () => {
    const cfg1 = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getGeminiClient: () => mockGeminiClient,
    } as Config;
    const cfg2 = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getProxy: () => 'http://test.proxy.com:8080',
      getContentGeneratorConfig: () =>
        ({ model: 'test-model' }) as ContentGeneratorConfig,
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding-model',
      getWorkingDir: () => 'test-working-dir',
      getSandbox: () => true,
      getCoreTools: () => ['ls', 'read-file'],
      getApprovalMode: () => 'default',
      getTelemetryLogPromptsEnabled: () => true,
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringAllowBuildArtifacts: () => false,
      getDebugMode: () => true,
      getMcpServers: () => ({
        'test-server': {
          command: 'test-command',
        },
      }),
      getQuestion: () => 'test-question',
      getToolRegistry: () => new ToolRegistry(cfg1),
      getFullContext: () => false,
      getUserMemory: () => 'user-memory',
    } as unknown as Config;

    const mockGeminiClient = new GeminiClient(cfg2);
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getGeminiClient: () => mockGeminiClient,
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
    } as Config;

    const mockMetrics = {
      recordToolCallMetrics: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordToolCallMetrics').mockImplementation(
        mockMetrics.recordToolCallMetrics,
      );
      mockLogger.emit.mockReset();
    });

    it('应记录包含所有字段的工具调用', () => {
      const call: CompletedToolCall = {
        status: 'success',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-1',
        },
        response: {
          callId: 'test-call-id',
          responseParts: 'test-response',
          resultDisplay: undefined,
          error: undefined,
        },
        tool: new EditTool(mockConfig),
        durationMs: 100,
        outcome: ToolConfirmationOutcome.ProceedOnce,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '工具调用：test-function。决策：接受。成功：true。持续时间：100ms。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: true,
          decision: ToolCallDecision.ACCEPT,
          prompt_id: 'prompt-id-1',
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        'test-function',
        100,
        true,
        ToolCallDecision.ACCEPT,
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });
    it('应记录带有拒绝决策的工具调用', () => {
      const call: ErroredToolCall = {
        status: 'error',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-2',
        },
        response: {
          callId: 'test-call-id',
          responseParts: 'test-response',
          resultDisplay: undefined,
          error: undefined,
        },
        durationMs: 100,
        outcome: ToolConfirmationOutcome.Cancel,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '工具调用：test-function。决策：拒绝。成功：false。持续时间：100ms。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: false,
          decision: ToolCallDecision.REJECT,
          prompt_id: 'prompt-id-2',
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        'test-function',
        100,
        false,
        ToolCallDecision.REJECT,
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('应记录带有修改决策的工具调用', () => {
      const call: CompletedToolCall = {
        status: 'success',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-3',
        },
        response: {
          callId: 'test-call-id',
          responseParts: 'test-response',
          resultDisplay: undefined,
          error: undefined,
        },
        outcome: ToolConfirmationOutcome.ModifyWithEditor,
        tool: new EditTool(mockConfig),
        durationMs: 100,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '工具调用：test-function。决策：修改。成功：true。持续时间：100ms。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: true,
          decision: ToolCallDecision.MODIFY,
          prompt_id: 'prompt-id-3',
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        'test-function',
        100,
        true,
        ToolCallDecision.MODIFY,
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('应记录不带决策的工具调用', () => {
      const call: CompletedToolCall = {
        status: 'success',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-4',
        },
        response: {
          callId: 'test-call-id',
          responseParts: 'test-response',
          resultDisplay: undefined,
          error: undefined,
        },
        tool: new EditTool(mockConfig),
        durationMs: 100,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '工具调用：test-function。成功：true。持续时间：100ms。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: true,
          prompt_id: 'prompt-id-4',
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        'test-function',
        100,
        true,
        undefined,
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('应记录带有错误的失败工具调用', () => {
      const call: ErroredToolCall = {
        status: 'error',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-5',
        },
        response: {
          callId: 'test-call-id',
          responseParts: 'test-response',
          resultDisplay: undefined,
          error: {
            name: 'test-error-type',
            message: 'test-error',
          },
        },
        durationMs: 100,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: '工具调用：test-function。成功：false。持续时间：100ms。',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: false,
          error: 'test-error',
          'error.message': 'test-error',
          error_type: 'test-error-type',
          'error.type': 'test-error-type',
          prompt_id: 'prompt-id-5',
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        'test-function',
        100,
        false,
        undefined,
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });
  });
});