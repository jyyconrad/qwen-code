/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { getOauthClient } from './oauth2.js';
import { getCachedGoogleAccount } from '../utils/user_account.js';
import { OAuth2Client, Compute } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import open from 'open';
import crypto from 'crypto';
import * as os from 'os';
import { AuthType } from '../core/contentGenerator.js';
import { Config } from '../config/config.js';
import readline from 'node:readline';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

vi.mock('google-auth-library');
vi.mock('http');
vi.mock('open');
vi.mock('crypto');
vi.mock('node:readline');

const mockConfig = {
  getNoBrowser: () => false,
} as unknown as Config;

// 全局模拟 fetch
global.fetch = vi.fn();

describe('oauth2', () => {
  let tempHomeDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    (os.homedir as Mock).mockReturnValue(tempHomeDir);
  });
  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
    delete process.env.CLOUD_SHELL;
  });

  it('应执行网页登录', async () => {
    const mockAuthUrl = 'https://example.com/auth';
    const mockCode = 'test-code';
    const mockState = 'test-state';
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
    };

    const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
    const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
    const mockSetCredentials = vi.fn();
    const mockGetAccessToken = vi
      .fn()
      .mockResolvedValue({ token: 'mock-access-token' });
    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      setCredentials: mockSetCredentials,
      getAccessToken: mockGetAccessToken,
      credentials: mockTokens,
      on: vi.fn(),
    } as unknown as OAuth2Client;
    (OAuth2Client as unknown as Mock).mockImplementation(
      () => mockOAuth2Client,
    );

    vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
    (open as Mock).mockImplementation(async () => ({}) as never);

    // 模拟 UserInfo API 响应
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: vi
        .fn()
        .mockResolvedValue({ email: 'test-google-account@gmail.com' }),
    } as unknown as Response);

    let requestCallback!: http.RequestListener<
      typeof http.IncomingMessage,
      typeof http.ServerResponse
    >;

    let serverListeningCallback: (value: unknown) => void;
    const serverListeningPromise = new Promise(
      (resolve) => (serverListeningCallback = resolve),
    );

    let capturedPort = 0;
    const mockHttpServer = {
      listen: vi.fn((port: number, callback?: () => void) => {
        capturedPort = port;
        if (callback) {
          callback();
        }
        serverListeningCallback(undefined);
      }),
      close: vi.fn((callback?: () => void) => {
        if (callback) {
          callback();
        }
      }),
      on: vi.fn(),
      address: () => ({ port: capturedPort }),
    };
    (http.createServer as Mock).mockImplementation((cb) => {
      requestCallback = cb as http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;
      return mockHttpServer as unknown as http.Server;
    });

    const clientPromise = getOauthClient(
      AuthType.LOGIN_WITH_GOOGLE,
      mockConfig,
    );

    // 等待服务器开始监听。
    await serverListeningPromise;

    const mockReq = {
      url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
    } as http.IncomingMessage;
    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    await requestCallback(mockReq, mockRes);

    const client = await clientPromise;
    expect(client).toBe(mockOAuth2Client);

    expect(open).toHaveBeenCalledWith(mockAuthUrl);
    expect(mockGetToken).toHaveBeenCalledWith({
      code: mockCode,
      redirect_uri: `http://localhost:${capturedPort}/oauth2callback`,
    });
    expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);

    // 验证 Google 账户已缓存
    const googleAccountPath = path.join(
      tempHomeDir,
      '.iflycode',
      'google_accounts.json',
    );
    expect(fs.existsSync(googleAccountPath)).toBe(true);
    const cachedGoogleAccount = fs.readFileSync(googleAccountPath, 'utf-8');
    expect(JSON.parse(cachedGoogleAccount)).toEqual({
      active: 'test-google-account@gmail.com',
      old: [],
    });

    // 验证 getCachedGoogleAccount 函数是否正常工作
    expect(getCachedGoogleAccount()).toBe('test-google-account@gmail.com');
  });

  it('应执行用户代码登录', async () => {
    const mockConfigWithNoBrowser = {
      getNoBrowser: () => true,
    } as unknown as Config;

    const mockCodeVerifier = {
      codeChallenge: 'test-challenge',
      codeVerifier: 'test-verifier',
    };
    const mockAuthUrl = 'https://example.com/auth-user-code';
    const mockCode = 'test-user-code';
    const mockTokens = {
      access_token: 'test-access-token-user-code',
      refresh_token: 'test-refresh-token-user-code',
    };

    const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
    const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
    const mockSetCredentials = vi.fn();
    const mockGenerateCodeVerifierAsync = vi
      .fn()
      .mockResolvedValue(mockCodeVerifier);

    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      setCredentials: mockSetCredentials,
      generateCodeVerifierAsync: mockGenerateCodeVerifierAsync,
      on: vi.fn(),
    } as unknown as OAuth2Client;
    (OAuth2Client as unknown as Mock).mockImplementation(
      () => mockOAuth2Client,
    );

    const mockReadline = {
      question: vi.fn((_query, callback) => callback(mockCode)),
      close: vi.fn(),
    };
    (readline.createInterface as Mock).mockReturnValue(mockReadline);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const client = await getOauthClient(
      AuthType.LOGIN_WITH_GOOGLE,
      mockConfigWithNoBrowser,
    );

    expect(client).toBe(mockOAuth2Client);

    // 验证认证流程
    expect(mockGenerateCodeVerifierAsync).toHaveBeenCalled();
    expect(mockGenerateAuthUrl).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(mockAuthUrl),
    );
    expect(mockReadline.question).toHaveBeenCalledWith(
      '输入授权码: ',
      expect.any(Function),
    );
    expect(mockGetToken).toHaveBeenCalledWith({
      code: mockCode,
      codeVerifier: mockCodeVerifier.codeVerifier,
      redirect_uri: 'https://sdk.cloud.google.com/authcode_cloudcode.html',
    });
    expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);

    consoleLogSpy.mockRestore();
  });

  describe('在 Cloud Shell 中', () => {
    const mockGetAccessToken = vi.fn();
    let mockComputeClient: Compute;

    beforeEach(() => {
      vi.spyOn(os, 'homedir').mockReturnValue('/user/home');
      vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'readFile').mockRejectedValue(
        new Error('文件未找到'),
      ); // 默认无缓存凭据

      mockGetAccessToken.mockResolvedValue({ token: 'test-access-token' });
      mockComputeClient = {
        credentials: { refresh_token: 'test-refresh-token' },
        getAccessToken: mockGetAccessToken,
      } as unknown as Compute;

      (Compute as unknown as Mock).mockImplementation(() => mockComputeClient);
    });

    it('应首先尝试加载缓存的凭据', async () => {
      const cachedCreds = { refresh_token: 'cached-token' };
      vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
        JSON.stringify(cachedCreds),
      );

      const mockClient = {
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
        getTokenInfo: vi.fn().mockResolvedValue({}),
        on: vi.fn(),
      };

      // 模拟函数内部的 new OAuth2Client()
      (OAuth2Client as unknown as Mock).mockImplementation(
        () => mockClient as unknown as OAuth2Client,
      );

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        '/user/home/.iflycode/oauth_creds.json',
        'utf-8',
      );
      expect(mockClient.setCredentials).toHaveBeenCalledWith(cachedCreds);
      expect(mockClient.getAccessToken).toHaveBeenCalled();
      expect(mockClient.getTokenInfo).toHaveBeenCalled();
      expect(Compute).not.toHaveBeenCalled(); // 如果缓存有效，不应获取新客户端
    });

    it('如果没有缓存凭据，应使用 Compute 获取客户端', async () => {
      await getOauthClient(AuthType.CLOUD_SHELL, mockConfig);

      expect(Compute).toHaveBeenCalledWith({});
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it('通过 ADC 获取凭据后不应缓存凭据', async () => {
      const newCredentials = { refresh_token: 'new-adc-token' };
      mockComputeClient.credentials = newCredentials;
      mockGetAccessToken.mockResolvedValue({ token: 'new-adc-token' });

      await getOauthClient(AuthType.CLOUD_SHELL, mockConfig);

      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('ADC 认证成功时应返回 Compute 客户端', async () => {
      const client = await getOauthClient(AuthType.CLOUD_SHELL, mockConfig);
      expect(client).toBe(mockComputeClient);
    });

    it('如果 ADC 失败应抛出错误', async () => {
      const testError = new Error('ADC 失败');
      mockGetAccessToken.mockRejectedValue(testError);

      await expect(
        getOauthClient(AuthType.CLOUD_SHELL, mockConfig),
      ).rejects.toThrow(
        '无法使用 Cloud Shell 凭据进行身份验证。请选择其他认证方法或确保您处于正确配置的环境中。错误: ADC 失败',
      );
    });
  });
});