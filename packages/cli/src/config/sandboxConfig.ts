/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SandboxConfig } from '@iflytek/iflycode-core';
import commandExists from 'command-exists';
import * as os from 'node:os';
import { getPackageJson } from '../utils/package.js';
import { Settings } from './settings.js';

// 这是来自 config.ts 的 CliArgs 接口的简化版本
// 以避免循环依赖。
interface SandboxCliArgs {
  sandbox?: boolean | string;
  sandboxImage?: string;
}

const VALID_SANDBOX_COMMANDS: ReadonlyArray<SandboxConfig['command']> = [
  'docker',
  'podman',
  'sandbox-exec',
];

function isSandboxCommand(value: string): value is SandboxConfig['command'] {
  return (VALID_SANDBOX_COMMANDS as readonly string[]).includes(value);
}

function getSandboxCommand(
  sandbox?: boolean | string,
): SandboxConfig['command'] | '' {
  // 如果设置了 SANDBOX 环境变量，说明我们已经在沙箱内。
  if (process.env.SANDBOX) {
    return '';
  }

  // 注意环境变量优先于参数（来自命令行或设置）
  const environmentConfiguredSandbox =
    process.env.GEMINI_SANDBOX?.toLowerCase().trim() ?? '';
  sandbox =
    environmentConfiguredSandbox?.length > 0
      ? environmentConfiguredSandbox
      : sandbox;
  if (sandbox === '1' || sandbox === 'true') sandbox = true;
  else if (sandbox === '0' || sandbox === 'false' || !sandbox) sandbox = false;

  if (sandbox === false) {
    return '';
  }

  if (typeof sandbox === 'string' && sandbox) {
    if (!isSandboxCommand(sandbox)) {
      console.error(
        `ERROR: invalid sandbox command '${sandbox}'. Must be one of ${VALID_SANDBOX_COMMANDS.join(
          ', ',
        )}`,
      );
      process.exit(1);
    }
    // 确认指定的命令存在
    if (commandExists.sync(sandbox)) {
      return sandbox;
    }
    console.error(
      `ERROR: missing sandbox command '${sandbox}' (from GEMINI_SANDBOX)`,
    );
    process.exit(1);
  }

  // 按顺序查找 seatbelt、docker 或 podman
  // 对于基于容器的沙箱，需要显式启用沙箱
  if (os.platform() === 'darwin' && commandExists.sync('sandbox-exec')) {
    return 'sandbox-exec';
  } else if (commandExists.sync('docker') && sandbox === true) {
    return 'docker';
  } else if (commandExists.sync('podman') && sandbox === true) {
    return 'podman';
  }

  // 如果用户请求了沙箱但未找到命令，则抛出错误
  if (sandbox === true) {
    console.error(
      'ERROR: GEMINI_SANDBOX is true but failed to determine command for sandbox; ' +
        'install docker or podman or specify command in GEMINI_SANDBOX',
    );
    process.exit(1);
  }

  return '';
}

export async function loadSandboxConfig(
  settings: Settings,
  argv: SandboxCliArgs,
): Promise<SandboxConfig | undefined> {
  const sandboxOption = argv.sandbox ?? settings.sandbox;
  const command = getSandboxCommand(sandboxOption);

  const packageJson = await getPackageJson();
  const image =
    argv.sandboxImage ??
    process.env.GEMINI_SANDBOX_IMAGE ??
    packageJson?.config?.sandboxImageUri;

  return command && image ? { command, image } : undefined;
}