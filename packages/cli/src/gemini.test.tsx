/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './gemini.js';
import {
  LoadedSettings,
  SettingsFile,
  loadSettings,
} from './config/settings.js';

// 自定义错误以识别模拟的 process.exit 调用
class MockProcessExitError extends Error {
  constructor(readonly code?: string | number | null | undefined) {
    super('PROCESS_EXIT_MOCKED');
    this.name = 'MockProcessExitError';
  }
}

// 模拟依赖项
vi.mock('./config/settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

vi.mock('./config/config.js', () => ({
  loadCliConfig: vi.fn().mockResolvedValue({
    config: {
      getSandbox: vi.fn(() => false),
      getQuestion: vi.fn(() => ''),
    },
    modelWasSwitched: false,
    originalModelBeforeSwitch: null,
    finalModel: 'test-model',
  }),
}));

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn().mockResolvedValue({
    packageJson: { name: 'test-pkg', version: 'test-version' },
    path: '/fake/path/package.json',
  }),
}));

vi.mock('update-notifier', () => ({
  default: vi.fn(() => ({
    notify: vi.fn(),
  })),
}));

vi.mock('./utils/sandbox.js', () => ({
  sandbox_command: vi.fn(() => ''), // 默认无沙箱命令
  start_sandbox: vi.fn(() => Promise.resolve()), // 模拟为一个解析的异步函数
}));

describe('gemini.tsx main 函数', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let loadSettingsMock: ReturnType<typeof vi.mocked<typeof loadSettings>>;
  let originalEnvGeminiSandbox: string | undefined;
  let originalEnvSandbox: string | undefined;

  const processExitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation((code) => {
      throw new MockProcessExitError(code);
    });

  beforeEach(() => {
    loadSettingsMock = vi.mocked(loadSettings);

    // 存储并清除沙箱相关的环境变量以确保一致的测试环境
    originalEnvGeminiSandbox = process.env.GEMINI_SANDBOX;
    originalEnvSandbox = process.env.SANDBOX;
    delete process.env.GEMINI_SANDBOX;
    delete process.env.SANDBOX;

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // 恢复原始环境变量
    if (originalEnvGeminiSandbox !== undefined) {
      process.env.GEMINI_SANDBOX = originalEnvGeminiSandbox;
    } else {
      delete process.env.GEMINI_SANDBOX;
    }
    if (originalEnvSandbox !== undefined) {
      process.env.SANDBOX = originalEnvSandbox;
    } else {
      delete process.env.SANDBOX;
    }
    vi.restoreAllMocks();
  });

  it('如果设置有错误应调用 process.exit(1)', async () => {
    const settingsError = {
      message: '测试设置错误',
      path: '/test/settings.json',
    };
    const userSettingsFile: SettingsFile = {
      path: '/user/settings.json',
      settings: {},
    };
    const workspaceSettingsFile: SettingsFile = {
      path: '/workspace/.iflycode/settings.json',
      settings: {},
    };
    const systemSettingsFile: SettingsFile = {
      path: '/system/settings.json',
      settings: {},
    };
    const mockLoadedSettings = new LoadedSettings(
      systemSettingsFile,
      userSettingsFile,
      workspaceSettingsFile,
      [settingsError],
    );

    loadSettingsMock.mockReturnValue(mockLoadedSettings);

    try {
      await main();
      // 如果 main 完成而未抛出，则测试应失败，因为预期会调用 process.exit
      expect.fail('main 函数未按预期退出');
    } catch (error) {
      expect(error).toBeInstanceOf(MockProcessExitError);
      if (error instanceof MockProcessExitError) {
        expect(error.code).toBe(1);
      }
    }

    // 验证 console.error 是否使用错误消息被调用
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(stripAnsi(String(consoleErrorSpy.mock.calls[0][0]))).toBe(
      'Error in /test/settings.json: 测试设置错误',
    );
    expect(stripAnsi(String(consoleErrorSpy.mock.calls[1][0]))).toBe(
      'Please fix /test/settings.json and try again.',
    );

    // 验证是否调用了 process.exit（间接通过抛出的错误）
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});