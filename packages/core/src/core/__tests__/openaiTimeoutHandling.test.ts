/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIContentGenerator } from '../openaiContentGenerator.js';
import { Config } from '../../config/config.js';
import OpenAI from 'openai';

// Mock OpenAI
vi.mock('openai');

// Mock logger modules
vi.mock('../../telemetry/loggers.js', () => ({
  logApiResponse: vi.fn(),
}));

vi.mock('../../utils/openaiLogger.js', () => ({
  openaiLogger: {
    logInteraction: vi.fn(),
  },
}));

describe('OpenAIContentGenerator 超时处理', () => {
  let generator: OpenAIContentGenerator;
  let mockConfig: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOpenAIClient: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock config
    mockConfig = {
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'openai',
        enableOpenAILogging: false,
        timeout: 120000,
        maxRetries: 3,
      }),
    } as unknown as Config;

    // Mock OpenAI client
    mockOpenAIClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    vi.mocked(OpenAI).mockImplementation(() => mockOpenAIClient);

    // Create generator instance
    generator = new OpenAIContentGenerator('test-api-key', 'gpt-4', mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('通过实际请求识别超时错误', () => {
    it('应正确处理各种超时错误格式', async () => {
      const timeoutErrors = [
        new Error('Request timeout'),
        new Error('Connection timed out'),
        new Error('ETIMEDOUT'),
        Object.assign(new Error('Network error'), { code: 'ETIMEDOUT' }),
        Object.assign(new Error('Socket error'), { code: 'ESOCKETTIMEDOUT' }),
        Object.assign(new Error('API error'), { type: 'timeout' }),
        new Error('request timed out'),
        new Error('deadline exceeded'),
      ];

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello' }] }],
        model: 'gpt-4',
      };

      for (const error of timeoutErrors) {
        mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(error);

        try {
          await generator.generateContent(request);
        } catch (thrownError: unknown) {
          // 应包含超时特定的消息和故障排除提示
          const errorMessage =
            thrownError instanceof Error
              ? thrownError.message
              : String(thrownError);
          expect(errorMessage).toMatch(
            /timeout after \d+s|Troubleshooting tips:/,
          );
        }
      }
    });

    it('应处理非超时错误而不包含超时消息', async () => {
      const nonTimeoutErrors = [
        new Error('Invalid API key'),
        new Error('Rate limit exceeded'),
        new Error('Model not found'),
        Object.assign(new Error('Auth error'), { code: 'INVALID_REQUEST' }),
        Object.assign(new Error('API error'), { type: 'authentication_error' }),
      ];

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello' }] }],
        model: 'gpt-4',
      };

      for (const error of nonTimeoutErrors) {
        mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(error);

        try {
          await generator.generateContent(request);
        } catch (thrownError: unknown) {
          // 不应包含超时特定的消息
          const errorMessage =
            thrownError instanceof Error
              ? thrownError.message
              : String(thrownError);
          expect(errorMessage).not.toMatch(/timeout after \d+s/);
          expect(errorMessage).not.toMatch(/Troubleshooting tips:/);
          expect(errorMessage).toMatch(/OpenAI API error:/);
        }
      }
    });
  });

  describe('generateContent 超时处理', () => {
    it('应使用有帮助的消息处理超时错误', async () => {
      // Mock timeout error
      const timeoutError = new Error('Request timeout');
      mockOpenAIClient.chat.completions.create.mockRejectedValue(timeoutError);

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello' }] }],
        model: 'gpt-4',
      };

      await expect(generator.generateContent(request)).rejects.toThrow(
        /Request timeout after \d+s\. Try reducing input length or increasing timeout in config\./,
      );
    });

    it('应正常处理非超时错误', async () => {
      // Mock non-timeout error
      const apiError = new Error('Invalid API key');
      mockOpenAIClient.chat.completions.create.mockRejectedValue(apiError);

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello' }] }],
        model: 'gpt-4',
      };

      await expect(generator.generateContent(request)).rejects.toThrow(
        'OpenAI API error: Invalid API key',
      );
    });

    it('应在超时错误中包含故障排除提示', async () => {
      const timeoutError = new Error('Connection timed out');
      mockOpenAIClient.chat.completions.create.mockRejectedValue(timeoutError);

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello' }] }],
        model: 'gpt-4',
      };

      try {
        await generator.generateContent(request);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('Troubleshooting tips:');
        expect(errorMessage).toContain('Reduce input length or complexity');
        expect(errorMessage).toContain('Increase timeout in config');
        expect(errorMessage).toContain('Check network connectivity');
        expect(errorMessage).toContain('Consider using streaming mode');
      }
    });
  });

  describe('generateContentStream 超时处理', () => {
    it('应处理流式传输超时错误', async () => {
      const timeoutError = new Error('Streaming timeout');
      mockOpenAIClient.chat.completions.create.mockRejectedValue(timeoutError);

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello' }] }],
        model: 'gpt-4',
      };

      await expect(generator.generateContentStream(request)).rejects.toThrow(
        /Streaming setup timeout after \d+s\. Try reducing input length or increasing timeout in config\./,
      );
    });

    it('应包含流式传输特定的故障排除提示', async () => {
      const timeoutError = new Error('request timed out');
      mockOpenAIClient.chat.completions.create.mockRejectedValue(timeoutError);

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello' }] }],
        model: 'gpt-4',
      };

      try {
        await generator.generateContentStream(request);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain(
          'Streaming setup timeout troubleshooting:',
        );
        expect(errorMessage).toContain(
          'Check network connectivity and firewall settings',
        );
        expect(errorMessage).toContain('Consider using non-streaming mode');
      }
    });
  });

  describe('超时配置', () => {
    it('应使用默认超时配置', () => {
      new OpenAIContentGenerator('test-key', 'gpt-4', mockConfig);

      // 验证 OpenAI 客户端是否使用超时配置创建
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: '',
        timeout: 120000,
        maxRetries: 3,
      });
    });

    it('应使用配置中的自定义超时', () => {
      const customConfig = {
        getContentGeneratorConfig: vi.fn().mockReturnValue({
          timeout: 300000, // 5 minutes
          maxRetries: 5,
        }),
      } as unknown as Config;

      new OpenAIContentGenerator('test-key', 'gpt-4', customConfig);

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: '',
        timeout: 300000,
        maxRetries: 5,
      });
    });

    it('应在缺少超时配置时优雅处理', () => {
      const noTimeoutConfig = {
        getContentGeneratorConfig: vi.fn().mockReturnValue({}),
      } as unknown as Config;

      new OpenAIContentGenerator('test-key', 'gpt-4', noTimeoutConfig);

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: '',
        timeout: 120000, // default
        maxRetries: 3, // default
      });
    });
  });

  describe('超时时的令牌估算', () => {
    it('即使请求超时也应估算令牌', async () => {
      const timeoutError = new Error('Request timeout');
      mockOpenAIClient.chat.completions.create.mockRejectedValue(timeoutError);

      // Mock countTokens to return a value
      const mockCountTokens = vi.spyOn(generator, 'countTokens');
      mockCountTokens.mockResolvedValue({ totalTokens: 100 });

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello world' }] }],
        model: 'gpt-4',
      };

      try {
        await generator.generateContent(request);
      } catch (_error) {
        // Verify that countTokens was called for estimation
        expect(mockCountTokens).toHaveBeenCalledWith({
          contents: request.contents,
          model: 'gpt-4',
        });
      }
    });

    it('如果 countTokens 失败则回退到基于字符的估算', async () => {
      const timeoutError = new Error('Request timeout');
      mockOpenAIClient.chat.completions.create.mockRejectedValue(timeoutError);

      // Mock countTokens to throw error
      const mockCountTokens = vi.spyOn(generator, 'countTokens');
      mockCountTokens.mockRejectedValue(new Error('Count tokens failed'));

      const request = {
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello world' }] }],
        model: 'gpt-4',
      };

      // Should not throw due to token counting failure
      await expect(generator.generateContent(request)).rejects.toThrow(
        /Request timeout after \d+s/,
      );
    });
  });
});