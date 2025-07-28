/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';
import {
  CodeAssistGlobalUserSettingResponse,
  LoadCodeAssistRequest,
  LoadCodeAssistResponse,
  LongrunningOperationResponse,
  OnboardUserRequest,
  SetCodeAssistGlobalUserSettingRequest,
} from './types.js';
import {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import * as readline from 'readline';
import { ContentGenerator } from '../core/contentGenerator.js';
import { UserTierId } from './types.js';
import {
  CaCountTokenResponse,
  CaGenerateContentResponse,
  fromCountTokenResponse,
  fromGenerateContentResponse,
  toCountTokenRequest,
  toGenerateContentRequest,
} from './converter.js';
import { Readable } from 'node:stream';

interface ErrorData {
  error?: {
    message?: string;
  };
}

interface GaxiosResponse {
  status: number;
  data: unknown;
}

interface StreamError extends Error {
  status?: number;
  response?: GaxiosResponse;
}

/** 在每个请求中使用的 HTTP 选项。 */
export interface HttpOptions {
  /** 要随请求发送的附加 HTTP 头。 */
  headers?: Record<string, string>;
}

export const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

export class CodeAssistServer implements ContentGenerator {
  private userTier: UserTierId | undefined = undefined;

  constructor(
    readonly client: OAuth2Client,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
    readonly sessionId?: string,
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resps = await this.requestStreamingPost<CaGenerateContentResponse>(
      'streamGenerateContent',
      toGenerateContentRequest(req, this.projectId, this.sessionId),
      req.config?.abortSignal,
    );
    return (async function* (): AsyncGenerator<GenerateContentResponse> {
      for await (const resp of resps) {
        yield fromGenerateContentResponse(resp);
      }
    })();
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const resp = await this.requestPost<CaGenerateContentResponse>(
      'generateContent',
      toGenerateContentRequest(req, this.projectId, this.sessionId),
      req.config?.abortSignal,
    );
    return fromGenerateContentResponse(resp);
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongrunningOperationResponse> {
    return await this.requestPost<LongrunningOperationResponse>(
      'onboardUser',
      req,
    );
  }

  async loadCodeAssist(
    req: LoadCodeAssistRequest,
  ): Promise<LoadCodeAssistResponse> {
    return await this.requestPost<LoadCodeAssistResponse>(
      'loadCodeAssist',
      req,
    );
  }

  async getCodeAssistGlobalUserSetting(): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.requestGet<CodeAssistGlobalUserSettingResponse>(
      'getCodeAssistGlobalUserSetting',
    );
  }

  async setCodeAssistGlobalUserSetting(
    req: SetCodeAssistGlobalUserSettingRequest,
  ): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.requestPost<CodeAssistGlobalUserSettingResponse>(
      'setCodeAssistGlobalUserSetting',
      req,
    );
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    const resp = await this.requestPost<CaCountTokenResponse>(
      'countTokens',
      toCountTokenRequest(req),
    );
    return fromCountTokenResponse(resp);
  }

  async embedContent(
    _req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }

  async requestPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      body: JSON.stringify(req),
      signal,
    });
    return res.data as T;
  }

  async requestGet<T>(method: string, signal?: AbortSignal): Promise<T> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      signal,
    });
    return res.data as T;
  }

  async requestStreamingPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
      method: 'POST',
      params: {
        alt: 'sse',
      },
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'stream',
      body: JSON.stringify(req),
      signal,
    });

    return (async function* (): AsyncGenerator<T> {
      // 如果需要，将 ReadableStream 转换为 Node.js 流
      let nodeStream: NodeJS.ReadableStream;

      if (res.data instanceof ReadableStream) {
        // 将 Web ReadableStream 转换为 Node.js Readable 流
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeStream = Readable.fromWeb(res.data as any);
      } else if (
        res.data &&
        typeof (res.data as NodeJS.ReadableStream).on === 'function'
      ) {
        // 已经是 Node.js 流
        nodeStream = res.data as NodeJS.ReadableStream;
      } else {
        // 如果 res.data 不是流，可能是错误响应
        // 尝试从响应中提取错误信息
        let errorMessage =
          '响应数据不是可读流。这可能表示服务器错误或配额问题。';

        if (res.data && typeof res.data === 'object') {
          // 检查这是否是包含错误详情的错误响应
          const errorData = res.data as ErrorData;
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (typeof errorData === 'string') {
            errorMessage = errorData;
          }
        }

        // 创建一个看起来像配额错误的错误，如果它包含配额信息
        const error: StreamError = new Error(errorMessage);
        // 添加状态和响应属性，以便重试逻辑可以正确处理
        error.status = res.status;
        error.response = res;
        throw error;
      }

      const rl = readline.createInterface({
        input: nodeStream,
        crlfDelay: Infinity, // 识别 '\r\n' 和 '\n' 作为换行符
      });

      let bufferedLines: string[] = [];
      for await (const line of rl) {
        // 空行用于分隔流中的 JSON 对象
        if (line === '') {
          if (bufferedLines.length === 0) {
            continue; // 没有数据可产出
          }
          yield JSON.parse(bufferedLines.join('\n')) as T;
          bufferedLines = []; // 产出后重置缓冲区
        } else if (line.startsWith('data: ')) {
          bufferedLines.push(line.slice(6).trim());
        } else {
          throw new Error(`响应中意外的行格式: ${line}`);
        }
      }
    })();
  }

  async getTier(): Promise<UserTierId | undefined> {
    if (this.userTier === undefined) {
      await this.detectUserTier();
    }
    return this.userTier;
  }

  private async detectUserTier(): Promise<void> {
    try {
      // 检测运行时重置用户层级
      this.userTier = undefined;

      // 仅在我们有项目 ID 时尝试层级检测
      if (this.projectId) {
        const loadRes = await this.loadCodeAssist({
          cloudaicompanionProject: this.projectId,
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
            duetProject: this.projectId,
          },
        });
        if (loadRes.currentTier) {
          this.userTier = loadRes.currentTier.id;
        }
      }
    } catch (error) {
      // 静默失败 - 这不是关键功能
      // 如果层级检测失败，我们将默认为 FREE 层级行为
      console.debug('用户层级检测失败:', error);
    }
  }

  getMethodUrl(method: string): string {
    const endpoint = process.env.CODE_ASSIST_ENDPOINT ?? CODE_ASSIST_ENDPOINT;
    return `${endpoint}/${CODE_ASSIST_API_VERSION}:${method}`;
  }
}