/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { loadCliConfig, parseArguments, CliArgs } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { start_sandbox } from './utils/sandbox.js';
import {
  LoadedSettings,
  loadSettings,
  USER_SETTINGS_PATH,
  SettingScope,
} from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions, Extension } from './config/extension.js';
import { cleanupCheckpoints, registerCleanup } from './utils/cleanup.js';
import { getCliVersion } from './utils/version.js';
import {
  ApprovalMode,
  Config,
  EditTool,
  ShellTool,
  WriteFileTool,
  sessionId,
  logUserPrompt,
  AuthType,
  getOauthClient,
} from '@iflytek/iflycode-core';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';

// 获取 Node 内存参数
function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // 设置目标为总内存的 50%
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    console.debug(
      `当前堆大小 ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env.GEMINI_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(
        `需要以更多内存重新启动: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

// 使用额外参数重新启动
async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}

export async function main() {
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);

  await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    for (const error of settings.errors) {
      let errorMessage = `配置文件错误 ${error.path}: ${error.message}`;
      if (!process.env.NO_COLOR) {
        errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
      }
      console.error(errorMessage);
      console.error(`请修复 ${error.path} 后重试。`);
    }
    process.exit(1);
  }

  const argv = await parseArguments();
  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  if (argv.promptInteractive && !process.stdin.isTTY) {
    console.error(
      '错误: 当从标准输入管道输入时，不支持 --prompt-interactive 标志。',
    );
    process.exit(1);
  }

  if (config.getListExtensions()) {
    console.log('已安装的扩展:');
    for (const extension of extensions) {
      console.log(`- ${extension.config.name}`);
    }
    process.exit(0);
  }

  // 如果未设置认证类型，则设置默认认证类型
  if (!settings.merged.selectedAuthType) {
    if (process.env.CLOUD_SHELL === 'true') {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.CLOUD_SHELL,
      );
    }
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  await config.initialize();

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // 如果在初始加载期间未找到主题，则记录警告并继续。
      // App.tsx 中的 useThemeCommand 钩子将处理打开对话框。
      console.warn(`警告: 未找到主题 "${settings.merged.theme}"。`);
    }
  }

  // 如果我们在沙箱外部且启用了沙箱，则进入沙箱
  if (!process.env.SANDBOX) {
    const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize
      ? getNodeMemoryArgs(config)
      : [];
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (settings.merged.selectedAuthType) {
        // 在此处验证身份认证，因为沙箱会干扰 Oauth2 网页重定向。
        try {
          const err = validateAuthMethod(settings.merged.selectedAuthType);
          if (err) {
            throw new Error(err);
          }
          await config.refreshAuth(settings.merged.selectedAuthType);
        } catch (err) {
          console.error('认证错误:', err);
          process.exit(1);
        }
      }
      await start_sandbox(sandboxConfig, memoryArgs);
      process.exit(0);
    } else {
      // 不在沙箱中且不进入沙箱，因此根据需要重新启动并添加
      // 参数来控制内存使用。
      if (memoryArgs.length > 0) {
        await relaunchWithAdditionalArgs(memoryArgs);
        process.exit(0);
      }
    }
  }

  if (
    settings.merged.selectedAuthType === AuthType.LOGIN_WITH_GOOGLE &&
    config.getNoBrowser()
  ) {
    // 在应用程序渲染前进行 oauth，以便可以复制链接。
    await getOauthClient(settings.merged.selectedAuthType, config);
  }

  let input = config.getQuestion();
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  const shouldBeInteractive =
    !!argv.promptInteractive || (process.stdin.isTTY && input?.length === 0);

  // 渲染 UI，传递必要的配置值。检查是否有命令行问题。
  if (shouldBeInteractive) {
    const version = await getCliVersion();
    setWindowTitle(basename(workspaceRoot), settings);
    const instance = render(
      <React.StrictMode>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
          version={version}
        />
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );

    registerCleanup(() => instance.unmount());
    return;
  }
  // 如果不是 TTY，则从标准输入读取
  // 这适用于用户直接将输入管道到命令中的情况
  if (!process.stdin.isTTY && !input) {
    input += await readStdin();
  }
  if (!input) {
    console.error('未通过标准输入提供输入。');
    process.exit(1);
  }

  const prompt_id = Math.random().toString(16).slice(2);
  logUserPrompt(config, {
    'event.name': 'user_prompt',
    'event.timestamp': new Date().toISOString(),
    prompt: input,
    prompt_id,
    auth_type: config.getContentGeneratorConfig()?.authType,
    prompt_length: input.length,
  });

  // 非交互模式由 runNonInteractive 处理
  const nonInteractiveConfig = await loadNonInteractiveConfig(
    config,
    extensions,
    settings,
    argv,
  );

  await runNonInteractive(nonInteractiveConfig, input, prompt_id);
  process.exit(0);
}

// 设置窗口标题
function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    const windowTitle = (process.env.CLI_TITLE || `iFlyCode - ${title}`).replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F\x7F]/g,
      '',
    );
    process.stdout.write(`\x1b]2;${windowTitle}\x07`);

    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

// --- 全局未处理拒绝处理器 ---
process.on('unhandledRejection', (reason, _promise) => {
  // 将其他意外的未处理拒绝记录为严重错误
  console.error('=========================================');
  console.error('严重错误: 未处理的 Promise 拒绝!');
  console.error('=========================================');
  console.error('原因:', reason);
  console.error('可能的堆栈跟踪如下:');
  if (!(reason instanceof Error)) {
    console.error(reason);
  }
  // 对于真正未处理的错误则退出
  process.exit(1);
});

// 加载非交互配置
async function loadNonInteractiveConfig(
  config: Config,
  extensions: Extension[],
  settings: LoadedSettings,
  argv: CliArgs,
) {
  let finalConfig = config;
  if (config.getApprovalMode() !== ApprovalMode.YOLO) {
    // 不允许所有操作，确保只配置只读工具。
    const existingExcludeTools = settings.merged.excludeTools || [];
    const interactiveTools = [
      ShellTool.Name,
      EditTool.Name,
      WriteFileTool.Name,
    ];

    const newExcludeTools = [
      ...new Set([...existingExcludeTools, ...interactiveTools]),
    ];

    const nonInteractiveSettings = {
      ...settings.merged,
      excludeTools: newExcludeTools,
    };
    finalConfig = await loadCliConfig(
      nonInteractiveSettings,
      extensions,
      config.getSessionId(),
      argv,
    );
    await finalConfig.initialize();
  }

  return await validateNonInterActiveAuth(
    settings.merged.selectedAuthType,
    finalConfig,
  );
}

// 验证非交互认证
async function validateNonInterActiveAuth(
  selectedAuthType: AuthType | undefined,
  nonInteractiveConfig: Config,
) {
  // 为 CLI 做特殊处理。许多无头环境可能没有设置 settings.json
  // 所以如果设置了 GEMINI_API_KEY，我们将使用它。但由于 oauth 相关操作本身就是交互式的，我们仍然期望它存在
  if (!selectedAuthType && !process.env.GEMINI_API_KEY) {
    console.error(
      `请在您的 ${USER_SETTINGS_PATH} 中设置认证方法，或在运行前指定 GEMINI_API_KEY 环境变量`,
    );
    process.exit(1);
  }

  selectedAuthType = selectedAuthType || AuthType.USE_GEMINI;
  const err = validateAuthMethod(selectedAuthType);
  if (err != null) {
    console.error(err);
    process.exit(1);
  }

  await nonInteractiveConfig.refreshAuth(selectedAuthType);
  return nonInteractiveConfig;
}