/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import {
  Config,
  loadServerHierarchicalMemory,
  setGeminiMdFilename as setServerGeminiMdFilename,
  getCurrentGeminiMdFilename,
  ApprovalMode,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  FileDiscoveryService,
  TelemetryTarget,
  MCPServerConfig,
} from '@iflytek/iflycode-core';
import { Settings } from './settings.js';

import { Extension, filterActiveExtensions } from './extension.js';
import { getCliVersion } from '../utils/version.js';
import { loadSandboxConfig } from './sandboxConfig.js';

// 简单的控制台记录器 - 如果有实际记录器则替换
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

export interface CliArgs {
  model: string | undefined;
  sandbox: boolean | string | undefined;
  sandboxImage: string | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  promptInteractive: string | undefined;
  allFiles: boolean | undefined;
  all_files: boolean | undefined;
  showMemoryUsage: boolean | undefined;
  show_memory_usage: boolean | undefined;
  yolo: boolean | undefined;
  telemetry: boolean | undefined;
  checkpointing: boolean | undefined;
  telemetryTarget: string | undefined;
  telemetryOtlpEndpoint: string | undefined;
  telemetryLogPrompts: boolean | undefined;
  allowedMcpServerNames: string[] | undefined;
  extensions: string[] | undefined;
  listExtensions: boolean | undefined;
  ideMode: boolean | undefined;
  openaiLogging: boolean | undefined;
  openaiApiKey: string | undefined;
  openaiBaseUrl: string | undefined;
}

export async function parseArguments(): Promise<CliArgs> {
  const yargsInstance = yargs(hideBin(process.argv))
    .scriptName('iflycode')
    .usage(
      '$0 [options]',
      'iFlyCode - 启动交互式 CLI，使用 -p/--prompt 进入非交互模式',
    )
    .option('model', {
      alias: 'm',
      type: 'string',
      description: `模型`,
      default: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: '提示。附加到标准输入（如果有）。',
    })
    .option('prompt-interactive', {
      alias: 'i',
      type: 'string',
      description:
        '执行提供的提示并继续进入交互模式',
    })
    .option('sandbox', {
      alias: 's',
      type: 'boolean',
      description: '在沙箱中运行？',
    })
    .option('sandbox-image', {
      type: 'string',
      description: '沙箱镜像 URI。',
    })
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: '在调试模式下运行？',
      default: false,
    })
    .option('all-files', {
      alias: ['a'],
      type: 'boolean',
      description: '在上下文中包含所有文件？',
      default: false,
    })
    .option('all_files', {
      type: 'boolean',
      description: '在上下文中包含所有文件？',
      default: false,
    })
    .deprecateOption(
      'all_files',
      '请改用 --all-files。我们将在未来几周内移除 --all_files。',
    )
    .option('show-memory-usage', {
      type: 'boolean',
      description: '在状态栏中显示内存使用情况',
      default: false,
    })
    .option('show_memory_usage', {
      type: 'boolean',
      description: '在状态栏中显示内存使用情况',
      default: false,
    })
    .deprecateOption(
      'show_memory_usage',
      '请改用 --show-memory-usage。我们将在未来几周内移除 --show_memory_usage。',
    )
    .option('yolo', {
      alias: 'y',
      type: 'boolean',
      description:
        '自动接受所有操作（即 YOLO 模式，详情请见 https://www.youtube.com/watch?v=xvFZjo5PgG0）？',
      default: false,
    })
    .option('telemetry', {
      type: 'boolean',
      description:
        '启用遥测？此标志专门控制是否发送遥测数据。其他 --telemetry-* 标志设置特定值但不会单独启用遥测。',
    })
    .option('telemetry-target', {
      type: 'string',
      choices: ['local', 'gcp'],
      description:
        '设置遥测目标（local 或 gcp）。覆盖设置文件。',
    })
    .option('telemetry-otlp-endpoint', {
      type: 'string',
      description:
        '设置遥测的 OTLP 端点。覆盖环境变量和设置文件。',
    })
    .option('telemetry-log-prompts', {
      type: 'boolean',
      description:
        '启用或禁用遥测的用户提示日志记录。覆盖设置文件。',
    })
    .option('checkpointing', {
      alias: 'c',
      type: 'boolean',
      description: '启用文件编辑的检查点功能',
      default: false,
    })
    .option('allowed-mcp-server-names', {
      type: 'array',
      string: true,
      description: '允许的 MCP 服务器名称',
    })
    .option('extensions', {
      alias: 'e',
      type: 'array',
      string: true,
      description:
        '要使用的扩展列表。如果未提供，则使用所有扩展。',
    })
    .option('list-extensions', {
      alias: 'l',
      type: 'boolean',
      description: '列出所有可用扩展并退出。',
    })
    .option('ide-mode', {
      type: 'boolean',
      description: '在 IDE 模式下运行？',
    })
    .option('openai-logging', {
      type: 'boolean',
      description:
        '启用 OpenAI API 调用的日志记录以进行调试和分析',
    })
    .option('openai-api-key', {
      type: 'string',
      description: '用于身份验证的 OpenAI API 密钥',
    })
    .option('openai-base-url', {
      type: 'string',
      description: 'OpenAI 基础 URL（用于自定义端点）',
    })

    .version(await getCliVersion()) // 这将根据 package.json 启用 --version 标志
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict()
    .check((argv) => {
      if (argv.prompt && argv.promptInteractive) {
        throw new Error(
          '不能同时使用 --prompt (-p) 和 --prompt-interactive (-i)',
        );
      }
      return true;
    });

  yargsInstance.wrap(yargsInstance.terminalWidth());
  return yargsInstance.argv;
}

// 此函数现在是服务器实现的简单包装器。
// 目前保留在 CLI 中，因为 App.tsx 直接调用它来刷新内存。
// TODO: 考虑 App.tsx 是否应该通过服务器调用获取内存，或者 Config 是否应该自行刷新。
export async function loadHierarchicalGeminiMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode) {
    logger.debug(
      `CLI: 将分层内存加载委托给服务器，当前工作目录: ${currentWorkingDirectory}`,
    );
  }
  // 直接调用服务器函数。
  // 服务器函数将使用其自己的 homedir() 获取全局路径。
  return loadServerHierarchicalMemory(
    currentWorkingDirectory,
    debugMode,
    fileService,
    extensionContextFilePaths,
  );
}

export async function loadCliConfig(
  settings: Settings,
  extensions: Extension[],
  sessionId: string,
  argv: CliArgs,
): Promise<Config> {
  const debugMode =
    argv.debug ||
    [process.env.DEBUG, process.env.DEBUG_MODE].some(
      (v) => v === 'true' || v === '1',
    );

  const ideMode =
    (argv.ideMode ?? settings.ideMode ?? false) &&
    process.env.TERM_PROGRAM === 'vscode' &&
    !process.env.SANDBOX;

  const activeExtensions = filterActiveExtensions(
    extensions,
    argv.extensions || [],
  );

  // 处理命令行中的 OpenAI API 密钥
  if (argv.openaiApiKey) {
    process.env.OPENAI_API_KEY = argv.openaiApiKey;
  }

  // 处理命令行中的 OpenAI 基础 URL
  if (argv.openaiBaseUrl) {
    process.env.OPENAI_BASE_URL = argv.openaiBaseUrl;
  }

  // 在加载内存之前设置服务器 memoryTool 模块中的上下文文件名
  // TODO(b/343434939): 这有点 hack。contextFileName 理想情况下应该直接传递
  // 给 core 中的 Config 构造函数，并让 core 处理 setGeminiMdFilename。
  // 然而，loadHierarchicalGeminiMemory 在 createServerConfig 之前被调用。
  if (settings.contextFileName) {
    setServerGeminiMdFilename(settings.contextFileName);
  } else {
    // 如果设置中未提供，则重置为默认值。
    setServerGeminiMdFilename(getCurrentGeminiMdFilename());
  }

  const extensionContextFilePaths = activeExtensions.flatMap(
    (e) => e.contextFiles,
  );

  const fileService = new FileDiscoveryService(process.cwd());
  // 调用（现在是包装器的）loadHierarchicalGeminiMemory，它调用服务器版本
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    debugMode,
    fileService,
    extensionContextFilePaths,
  );

  let mcpServers = mergeMcpServers(settings, activeExtensions);
  const excludeTools = mergeExcludeTools(settings, activeExtensions);

  if (argv.allowedMcpServerNames) {
    const allowedNames = new Set(argv.allowedMcpServerNames.filter(Boolean));
    if (allowedNames.size > 0) {
      mcpServers = Object.fromEntries(
        Object.entries(mcpServers).filter(([key]) => allowedNames.has(key)),
      );
    } else {
      mcpServers = {};
    }
  }

  if (ideMode) {
    mcpServers['_ide_server'] = new MCPServerConfig(
      undefined, // command
      undefined, // args
      undefined, // env
      undefined, // cwd
      undefined, // url
      'http://localhost:3000/mcp', // httpUrl
      undefined, // headers
      undefined, // tcp
      undefined, // timeout
      false, // trust
      'IDE 连接', // description
      undefined, // includeTools
      undefined, // excludeTools
    );
  }

  const sandboxConfig = await loadSandboxConfig(settings, argv);

  return new Config({
    sessionId,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: sandboxConfig,
    targetDir: process.cwd(),
    debugMode,
    question: argv.promptInteractive || argv.prompt || '',
    fullContext: argv.allFiles || argv.all_files || false,
    coreTools: settings.coreTools || undefined,
    excludeTools,
    toolDiscoveryCommand: settings.toolDiscoveryCommand,
    toolCallCommand: settings.toolCallCommand,
    mcpServerCommand: settings.mcpServerCommand,
    mcpServers,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    approvalMode: argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    showMemoryUsage:
      argv.showMemoryUsage ||
      argv.show_memory_usage ||
      settings.showMemoryUsage ||
      false,
    accessibility: settings.accessibility,
    telemetry: {
      enabled: argv.telemetry ?? settings.telemetry?.enabled,
      target: (argv.telemetryTarget ??
        settings.telemetry?.target) as TelemetryTarget,
      otlpEndpoint:
        argv.telemetryOtlpEndpoint ??
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        settings.telemetry?.otlpEndpoint,
      logPrompts: argv.telemetryLogPrompts ?? settings.telemetry?.logPrompts,
    },
    usageStatisticsEnabled: settings.usageStatisticsEnabled ?? true,
    // Git 感知文件过滤设置
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
    },
    checkpointing: argv.checkpointing || settings.checkpointing?.enabled,
    proxy:
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy,
    cwd: process.cwd(),
    fileDiscoveryService: fileService,
    bugCommand: settings.bugCommand,
    model: argv.model!,
    extensionContextFilePaths,
    maxSessionTurns: settings.maxSessionTurns ?? -1,
    listExtensions: argv.listExtensions || false,
    activeExtensions: activeExtensions.map((e) => ({
      name: e.config.name,
      version: e.config.version,
    })),
    noBrowser: !!process.env.NO_BROWSER,
    ideMode,
    enableOpenAILogging:
      (typeof argv.openaiLogging === 'undefined'
        ? settings.enableOpenAILogging
        : argv.openaiLogging) ?? false,
    sampling_params: settings.sampling_params,
  });
}

function mergeMcpServers(settings: Settings, extensions: Extension[]) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  for (const extension of extensions) {
    Object.entries(extension.config.mcpServers || {}).forEach(
      ([key, server]) => {
        if (mcpServers[key]) {
          logger.warn(
            `跳过扩展 MCP 配置，因为服务器键 "${key}" 已存在。`,
          );
          return;
        }
        mcpServers[key] = server;
      },
    );
  }
  return mcpServers;
}

function mergeExcludeTools(
  settings: Settings,
  extensions: Extension[],
): string[] {
  const allExcludeTools = new Set(settings.excludeTools || []);
  for (const extension of extensions) {
    for (const tool of extension.config.excludeTools || []) {
      allExcludeTools.add(tool);
    }
  }
  return [...allExcludeTools];
}