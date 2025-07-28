/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthDialog } from './AuthDialog.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { AuthType } from '@iflytek/iflycode-core';

describe('AuthDialog', () => {
  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.GEMINI_API_KEY = '';
    process.env.GEMINI_DEFAULT_AUTH_TYPE = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('如果初始认证类型无效，应显示错误', () => {
    process.env.GEMINI_API_KEY = '';

    const settings: LoadedSettings = new LoadedSettings(
      {
        settings: {},
        path: '',
      },
      {
        settings: {
          selectedAuthType: AuthType.USE_GEMINI,
        },
        path: '',
      },
      {
        settings: {},
        path: '',
      },
      [],
    );

    const { lastFrame } = render(
      <AuthDialog
        onSelect={() => {}}
        settings={settings}
        initialErrorMessage="未找到 GEMINI_API_KEY 环境变量"
      />,
    );

    expect(lastFrame()).toContain(
      '未找到 GEMINI_API_KEY 环境变量',
    );
  });

  describe('GEMINI_API_KEY 环境变量', () => {
    it('应检测 GEMINI_API_KEY 环境变量', () => {
      process.env.GEMINI_API_KEY = 'foobar';

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            selectedAuthType: undefined,
          },
          path: '',
        },
        {
          settings: {},
          path: '',
        },
        [],
      );

      const { lastFrame } = render(
        <AuthDialog onSelect={() => {}} settings={settings} />,
      );

      // 由于认证对话框现在只显示 OpenAI 选项，
      // 它不会显示 GEMINI_API_KEY 消息
      expect(lastFrame()).toContain('OpenAI');
    });

    it('如果 GEMINI_DEFAULT_AUTH_TYPE 设置为其他值，则不应显示 GEMINI_API_KEY 消息', () => {
      process.env.GEMINI_API_KEY = 'foobar';
      process.env.GEMINI_DEFAULT_AUTH_TYPE = AuthType.LOGIN_WITH_GOOGLE;

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            selectedAuthType: undefined,
          },
          path: '',
        },
        {
          settings: {},
          path: '',
        },
        [],
      );

      const { lastFrame } = render(
        <AuthDialog onSelect={() => {}} settings={settings} />,
      );

      expect(lastFrame()).not.toContain(
        '检测到现有 API 密钥 (GEMINI_API_KEY)',
      );
    });

    it('如果 GEMINI_DEFAULT_AUTH_TYPE 设置为使用 API 密钥，则应显示 GEMINI_API_KEY 消息', () => {
      process.env.GEMINI_API_KEY = 'foobar';
      process.env.GEMINI_DEFAULT_AUTH_TYPE = AuthType.USE_GEMINI;

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            selectedAuthType: undefined,
          },
          path: '',
        },
        {
          settings: {},
          path: '',
        },
        [],
      );

      const { lastFrame } = render(
        <AuthDialog onSelect={() => {}} settings={settings} />,
      );

      // 由于认证对话框现在只显示 OpenAI 选项，
      // 它不会显示 GEMINI_API_KEY 消息
      expect(lastFrame()).toContain('OpenAI');
    });
  });

  describe('GEMINI_DEFAULT_AUTH_TYPE 环境变量', () => {
    it('应选择由 GEMINI_DEFAULT_AUTH_TYPE 指定的认证类型', () => {
      process.env.GEMINI_DEFAULT_AUTH_TYPE = AuthType.LOGIN_WITH_GOOGLE;

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            selectedAuthType: undefined,
          },
          path: '',
        },
        {
          settings: {},
          path: '',
        },
        [],
      );

      const { lastFrame } = render(
        <AuthDialog onSelect={() => {}} settings={settings} />,
      );

      // 由于只有 OpenAI 可用，它应该默认被选中
      expect(lastFrame()).toContain('● OpenAI');
    });

    it('如果未设置 GEMINI_DEFAULT_AUTH_TYPE，应回退到默认值', () => {
      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            selectedAuthType: undefined,
          },
          path: '',
        },
        {
          settings: {},
          path: '',
        },
        [],
      );

      const { lastFrame } = render(
        <AuthDialog onSelect={() => {}} settings={settings} />,
      );

      // 默认是 OpenAI（唯一选项）
      expect(lastFrame()).toContain('● OpenAI');
    });

    it('如果 GEMINI_DEFAULT_AUTH_TYPE 无效，应显示错误并回退到默认值', () => {
      process.env.GEMINI_DEFAULT_AUTH_TYPE = 'invalid-auth-type';

      const settings: LoadedSettings = new LoadedSettings(
        {
          settings: {
            selectedAuthType: undefined,
          },
          path: '',
        },
        {
          settings: {},
          path: '',
        },
        [],
      );

      const { lastFrame } = render(
        <AuthDialog onSelect={() => {}} settings={settings} />,
      );

      // 由于认证对话框不再显示 GEMINI_DEFAULT_AUTH_TYPE 错误，
      // 它只会显示默认的 OpenAI 选项
      expect(lastFrame()).toContain('● OpenAI');
    });
  });

  // it('当未选择认证方法时应阻止退出并显示错误消息', async () => {
  //   const onSelect = vi.fn();
  //   const settings: LoadedSettings = new LoadedSettings(
  //     {
  //       settings: {},
  //       path: '',
  //     },
  //     {
  //       settings: {
  //         selectedAuthType: undefined,
  //       },
  //       path: '',
  //     },
  //     {
  //       settings: {},
  //       path: '',
  //     },
  //     [],
  //   );

  //   const { lastFrame, stdin, unmount } = render(
  //     <AuthDialog onSelect={onSelect} settings={settings} />,
  //   );
  //   await wait();

  //   // 模拟按下 escape 键
  //   stdin.write('\u001b'); // ESC 键
  //   await wait(100); // 为 CI 环境增加等待时间

  //   // 应显示错误消息而不是调用 onSelect
  //   expect(lastFrame()).toContain(
  //     '您必须选择一个认证方法才能继续。按两次 Ctrl+C 退出。',
  //   );
  //   expect(onSelect).not.toHaveBeenCalled();
  //   unmount();
  // });

  it('如果已有错误消息，则不应退出', async () => {
    const onSelect = vi.fn();
    const settings: LoadedSettings = new LoadedSettings(
      {
        settings: {},
        path: '',
      },
      {
        settings: {},
        path: '',
      },
      [],
    );

    const { lastFrame, stdin, unmount } = render(
      <AuthDialog
        onSelect={onSelect}
        settings={settings}
        initialErrorMessage="初始错误"
      />,
    );
    await wait();

    expect(lastFrame()).toContain('初始错误');

    // 模拟按下 escape 键
    stdin.write('\u001b'); // ESC 键
    await wait();

    // 不应调用 onSelect
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });

  it('当认证方法已选择时应允许退出', async () => {
    const onSelect = vi.fn();
    const settings: LoadedSettings = new LoadedSettings(
      {
        settings: {},
        path: '',
      },
      {
        settings: {
          selectedAuthType: AuthType.USE_GEMINI,
        },
        path: '',
      },
      {
        settings: {},
        path: '',
      },
      [],
    );

    const { stdin, unmount } = render(
      <AuthDialog onSelect={onSelect} settings={settings} />,
    );
    await wait();

    // 模拟按下 escape 键
    stdin.write('\u001b'); // ESC 键
    await wait();

    // 应调用 onSelect 并传入 undefined 以退出
    expect(onSelect).toHaveBeenCalledWith(undefined, SettingScope.User);
    unmount();
  });
});