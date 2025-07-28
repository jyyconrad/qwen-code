/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import { loadCliConfig, parseArguments } from './config.js';
import { Settings } from './settings.js';
import { Extension } from './extension.js';
import * as ServerConfig from '@iflytek/iflycode-core';
import {
  TelemetryTarget,
  ConfigParameters,
  DEFAULT_TELEMETRY_TARGET,
} from '@iflytek/iflycode-core';

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
  };
});

vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(() =>
    Promise.resolve({ packageJson: { version: 'test-version' } }),
  ),
}));

vi.mock('@iflytek/iflycode-core', async () => {
  const actualServer = await vi.importActual<typeof ServerConfig>(
    '@iflytek/iflycode-core',
  );
  return {
    ...actualServer,
    loadEnvironment: vi.fn(),
    loadServerHierarchicalMemory: vi.fn(
      (cwd, debug, fileService, extensionPaths) =>
        Promise.resolve({
          memoryContent: extensionPaths?.join(',') || '',
          fileCount: extensionPaths?.length || 0,
        }),
    ),
    Config: class MockConfig extends actualServer.Config {
      private enableOpenAILogging: boolean;

      constructor(params: ConfigParameters) {
        super(params);
        this.enableOpenAILogging = params.enableOpenAILogging ?? false;
      }

      getEnableOpenAILogging(): boolean {
        return this.enableOpenAILogging;
      }

      // 覆盖其他方法以确保它们正常工作
      getShowMemoryUsage(): boolean {
        return (
          (this as unknown as { showMemoryUsage?: boolean }).showMemoryUsage ??
          false
        );
      }

      getTelemetryEnabled(): boolean {
        return (
          (this as unknown as { telemetrySettings?: { enabled?: boolean } })
            .telemetrySettings?.enabled ?? false
        );
      }

      getTelemetryLogPromptsEnabled(): boolean {
        return (
          (this as unknown as { telemetrySettings?: { logPrompts?: boolean } })
            .telemetrySettings?.logPrompts ?? true
        );
      }

      getTelemetryOtlpEndpoint(): string {
        return (
          (this as unknown as { telemetrySettings?: { otlpEndpoint?: string } })
            .telemetrySettings?.otlpEndpoint ?? 'http://localhost:4317'
        );
      }

      getTelemetryTarget(): TelemetryTarget {
        return (
          (
            this as unknown as {
              telemetrySettings?: { target?: TelemetryTarget };
            }
          ).telemetrySettings?.target ?? DEFAULT_TELEMETRY_TARGET
        );
      }
    },
  };
});

describe('parseArguments', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('当同时使用 --prompt 和 --prompt-interactive 时应抛出错误', async () => {
    process.argv = [
      'node',
      'script.js',
      '--prompt',
      'test prompt',
      '--prompt-interactive',
      'interactive prompt',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments()).rejects.toThrow('process.exit called');

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
      ),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('当同时使用短标志 -p 和 -i 时应抛出错误', async () => {
    process.argv = [
      'node',
      'script.js',
      '-p',
      'test prompt',
      '-i',
      'interactive prompt',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments()).rejects.toThrow('process.exit called');

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
      ),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('应允许使用 --prompt 而不使用 --prompt-interactive', async () => {
    process.argv = ['node', 'script.js', '--prompt', 'test prompt'];
    const argv = await parseArguments();
    expect(argv.prompt).toBe('test prompt');
    expect(argv.promptInteractive).toBeUndefined();
  });

  it('应允许使用 --prompt-interactive 而不使用 --prompt', async () => {
    process.argv = [
      'node',
      'script.js',
      '--prompt-interactive',
      'interactive prompt',
    ];
    const argv = await parseArguments();
    expect(argv.promptInteractive).toBe('interactive prompt');
    expect(argv.prompt).toBeUndefined();
  });

  it('应允许使用 -i 标志作为 --prompt-interactive 的别名', async () => {
    process.argv = ['node', 'script.js', '-i', 'interactive prompt'];
    const argv = await parseArguments();
    expect(argv.promptInteractive).toBe('interactive prompt');
    expect(argv.prompt).toBeUndefined();
  });
});

describe('loadCliConfig', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key'; // 确保为测试设置 API 密钥
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('当存在 --show-memory-usage 标志时，应将 showMemoryUsage 设置为 true', async () => {
    process.argv = ['node', 'script.js', '--show-memory-usage'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(true);
  });

  it('当未提供 --memory 标志时，应将 showMemoryUsage 设置为 false', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(false);
  });

  it('当 CLI 标志不存在时，应从设置中默认设置 showMemoryUsage 为 false', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { showMemoryUsage: false };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(false);
  });

  it('当 showMemoryUsage 存在时，应优先使用 CLI 标志而非设置 (CLI true, settings false)', async () => {
    process.argv = ['node', 'script.js', '--show-memory-usage'];
    const argv = await parseArguments();
    const settings: Settings = { showMemoryUsage: false };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(true);
  });
});

describe('loadCliConfig telemetry', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('当没有提供标志或设置时，遥测应默认设置为 false', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('当存在 --telemetry 标志时，应将遥测设置为 true', async () => {
    process.argv = ['node', 'script.js', '--telemetry'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('当存在 --no-telemetry 标志时，应将遥测设置为 false', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('如果未提供 CLI 标志，应使用设置中的遥测值 (settings true)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('如果未提供 CLI 标志，应使用设置中的遥测值 (settings false)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('应优先使用 --telemetry CLI 标志 (true) 而非设置 (false)', async () => {
    process.argv = ['node', 'script.js', '--telemetry'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('应优先使用 --no-telemetry CLI 标志 (false) 而非设置 (true)', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('如果未提供 CLI 标志，应使用设置中的遥测 OTLP 端点', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { otlpEndpoint: 'http://settings.example.com' },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe(
      'http://settings.example.com',
    );
  });

  it('应优先使用 --telemetry-otlp-endpoint CLI 标志而非设置', async () => {
    process.argv = [
      'node',
      'script.js',
      '--telemetry-otlp-endpoint',
      'http://cli.example.com',
    ];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { otlpEndpoint: 'http://settings.example.com' },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe('http://cli.example.com');
  });

  it('如果未通过 CLI 或设置提供 OTLP 端点，应使用默认端点', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
  });

  it('如果未提供 CLI 标志，应使用设置中的遥测目标', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { target: ServerConfig.DEFAULT_TELEMETRY_TARGET },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe(
      ServerConfig.DEFAULT_TELEMETRY_TARGET,
    );
  });

  it('应优先使用 --telemetry-target CLI 标志而非设置', async () => {
    process.argv = ['node', 'script.js', '--telemetry-target', 'gcp'];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { target: ServerConfig.DEFAULT_TELEMETRY_TARGET },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe('gcp');
  });

  it('如果未通过 CLI 或设置提供目标，应使用默认目标', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe(
      ServerConfig.DEFAULT_TELEMETRY_TARGET,
    );
  });

  it('如果未提供 CLI 标志，应使用设置中的遥测日志提示', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { logPrompts: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });

  it('应优先使用 --telemetry-log-prompts CLI 标志 (true) 而非设置 (false)', async () => {
    process.argv = ['node', 'script.js', '--telemetry-log-prompts'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { logPrompts: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
  });

  it('应优先使用 --no-telemetry-log-prompts CLI 标志 (false) 而非设置 (true)', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry-log-prompts'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { logPrompts: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });

  it('如果未通过 CLI 或设置提供值，应使用默认日志提示 (true)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
  });

  it('当存在 --openai-logging 标志时，应将 enableOpenAILogging 设置为 true', async () => {
    const settings: Settings = {};
    const argv = await parseArguments();
    argv.openaiLogging = true;
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(
      (
        config as unknown as { getEnableOpenAILogging(): boolean }
      ).getEnableOpenAILogging(),
    ).toBe(true);
  });

  it('当不存在 --openai-logging 标志时，应将 enableOpenAILogging 设置为 false', async () => {
    const settings: Settings = {};
    const argv = await parseArguments();
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(
      (
        config as unknown as { getEnableOpenAILogging(): boolean }
      ).getEnableOpenAILogging(),
    ).toBe(false);
  });

  it('如果未提供 CLI 标志，应使用设置中的 enableOpenAILogging 值 (settings true)', async () => {
    const settings: Settings = { enableOpenAILogging: true };
    const argv = await parseArguments();
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(
      (
        config as unknown as { getEnableOpenAILogging(): boolean }
      ).getEnableOpenAILogging(),
    ).toBe(true);
  });

  it('如果未提供 CLI 标志，应使用设置中的 enableOpenAILogging 值 (settings false)', async () => {
    const settings: Settings = { enableOpenAILogging: false };
    const argv = await parseArguments();
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(
      (
        config as unknown as { getEnableOpenAILogging(): boolean }
      ).getEnableOpenAILogging(),
    ).toBe(false);
  });

  it('应优先使用 --openai-logging CLI 标志 (true) 而非设置 (false)', async () => {
    const settings: Settings = { enableOpenAILogging: false };
    const argv = await parseArguments();
    argv.openaiLogging = true;
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(
      (
        config as unknown as { getEnableOpenAILogging(): boolean }
      ).getEnableOpenAILogging(),
    ).toBe(true);
  });

  it('应优先使用 --openai-logging CLI 标志 (false) 而非设置 (true)', async () => {
    const settings: Settings = { enableOpenAILogging: true };
    const argv = await parseArguments();
    argv.openaiLogging = false;
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(
      (
        config as unknown as { getEnableOpenAILogging(): boolean }
      ).getEnableOpenAILogging(),
    ).toBe(false);
  });
});

describe('Hierarchical Memory Loading (config.ts) - 占位符套件', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    // 其他常见模拟将在此处重置。
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应将扩展上下文文件路径传递给 loadServerHierarchicalMemory', async () => {
    process.argv = ['node', 'script.js'];
    const settings: Settings = {};
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
        },
        contextFiles: ['/path/to/ext1/IFLYCODE.md'],
      },
      {
        config: {
          name: 'ext2',
          version: '1.0.0',
        },
        contextFiles: [],
      },
      {
        config: {
          name: 'ext3',
          version: '1.0.0',
        },
        contextFiles: [
          '/path/to/ext3/context1.md',
          '/path/to/ext3/context2.md',
        ],
      },
    ];
    const argv = await parseArguments();
    await loadCliConfig(settings, extensions, 'session-id', argv);
    expect(ServerConfig.loadServerHierarchicalMemory).toHaveBeenCalledWith(
      expect.any(String),
      false,
      expect.any(Object),
      [
        '/path/to/ext1/IFLYCODE.md',
        '/path/to/ext3/context1.md',
        '/path/to/ext3/context2.md',
      ],
    );
  });

  // 给未来开发者的注意事项：
  // 要重新启用 loadHierarchicalGeminiMemory 的测试，请确保：
  // 1. os.homedir() 在 config.ts 模块加载之前可靠地被模拟
  //    并且其函数（使用 os.homedir()）被调用。
  // 2. fs/promises 和 fs 模拟正确模拟基于模拟 os.homedir() 路径的文件/目录存在性、
  //    可读性和内容。
  // 3. 如果需要，正确设置控制台函数（用于记录器输出）的监视器。
  // 以前失败的测试结构示例：
  /*
  it('应正确使用模拟的 homedir 用于全局路径', async () => {
    const MOCK_GEMINI_DIR_LOCAL = path.join('/mock/home/user', '.iflycode');
    const MOCK_GLOBAL_PATH_LOCAL = path.join(MOCK_GEMINI_DIR_LOCAL, 'IFLYCODE.md');
    mockFs({
      [MOCK_GLOBAL_PATH_LOCAL]: { type: 'file', content: 'GlobalContentOnly' }
    });
    const memory = await loadHierarchicalGeminiMemory("/some/other/cwd", false);
    expect(memory).toBe('GlobalContentOnly');
    expect(vi.mocked(os.homedir)).toHaveBeenCalled();
    expect(fsPromises.readFile).toHaveBeenCalledWith(MOCK_GLOBAL_PATH_LOCAL, 'utf-8');
  });
  */
});

describe('mergeMcpServers', () => {
  it('不应修改原始设置对象', async () => {
    const settings: Settings = {
      mcpServers: {
        'test-server': {
          url: 'http://localhost:8080',
        },
      },
    };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          mcpServers: {
            'ext1-server': {
              url: 'http://localhost:8081',
            },
          },
        },
        contextFiles: [],
      },
    ];
    const originalSettings = JSON.parse(JSON.stringify(settings));
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    await loadCliConfig(settings, extensions, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('mergeExcludeTools', () => {
  it('应合并来自设置和扩展的 excludeTools', async () => {
    const settings: Settings = { excludeTools: ['tool1', 'tool2'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool3', 'tool4'],
        },
        contextFiles: [],
      },
      {
        config: {
          name: 'ext2',
          version: '1.0.0',
          excludeTools: ['tool5'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2', 'tool3', 'tool4', 'tool5']),
    );
    expect(config.getExcludeTools()).toHaveLength(5);
  });

  it('应处理设置和扩展之间的重叠 excludeTools', async () => {
    const settings: Settings = { excludeTools: ['tool1', 'tool2'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2', 'tool3'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2', 'tool3']),
    );
    expect(config.getExcludeTools()).toHaveLength(3);
  });

  it('应处理扩展之间的重叠 excludeTools', async () => {
    const settings: Settings = { excludeTools: ['tool1'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2', 'tool3'],
        },
        contextFiles: [],
      },
      {
        config: {
          name: 'ext2',
          version: '1.0.0',
          excludeTools: ['tool3', 'tool4'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2', 'tool3', 'tool4']),
    );
    expect(config.getExcludeTools()).toHaveLength(4);
  });

  it('当未指定 excludeTools 时，应返回空数组', async () => {
    const settings: Settings = {};
    const extensions: Extension[] = [];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual([]);
  });

  it('应处理有 excludeTools 但无扩展的设置', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { excludeTools: ['tool1', 'tool2'] };
    const extensions: Extension[] = [];
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2']),
    );
    expect(config.getExcludeTools()).toHaveLength(2);
  });

  it('应处理有 excludeTools 但无设置的扩展', async () => {
    const settings: Settings = {};
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool1', 'tool2'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2']),
    );
    expect(config.getExcludeTools()).toHaveLength(2);
  });

  it('不应修改原始设置对象', async () => {
    const settings: Settings = { excludeTools: ['tool1'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2'],
        },
        contextFiles: [],
      },
    ];
    const originalSettings = JSON.parse(JSON.stringify(settings));
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    await loadCliConfig(settings, extensions, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('loadCliConfig with allowed-mcp-server-names', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const baseSettings: Settings = {
    mcpServers: {
      server1: { url: 'http://localhost:8080' },
      server2: { url: 'http://localhost:8081' },
      server3: { url: 'http://localhost:8082' },
    },
  };

  it('如果未提供标志，应允许所有 MCP 服务器', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual(baseSettings.mcpServers);
  });

  it('应仅允许指定的 MCP 服务器', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
    ];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
    });
  });

  it('应允许多个指定的 MCP 服务器', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
      '--allowed-mcp-server-names',
      'server3',
    ];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
      server3: { url: 'http://localhost:8082' },
    });
  });

  it('应处理不存在的服务器名称', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
      '--allowed-mcp-server-names',
      'server4',
    ];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
    });
  });

  it('如果提供了标志但为空，应不允许任何 MCP 服务器', async () => {
    process.argv = ['node', 'script.js', '--allowed-mcp-server-names', ''];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({});
  });
});

describe('loadCliConfig extensions', () => {
  const mockExtensions: Extension[] = [
    {
      config: { name: 'ext1', version: '1.0.0' },
      contextFiles: ['/path/to/ext1.md'],
    },
    {
      config: { name: 'ext2', version: '1.0.0' },
      contextFiles: ['/path/to/ext2.md'],
    },
  ];

  it('如果未使用 --extensions 标志，不应过滤扩展', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(
      settings,
      mockExtensions,
      'test-session',
      argv,
    );
    expect(config.getExtensionContextFilePaths()).toEqual([
      '/path/to/ext1.md',
      '/path/to/ext2.md',
    ]);
  });

  it('如果使用了 --extensions 标志，应过滤扩展', async () => {
    process.argv = ['node', 'script.js', '--extensions', 'ext1'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(
      settings,
      mockExtensions,
      'test-session',
      argv,
    );
    expect(config.getExtensionContextFilePaths()).toEqual(['/path/to/ext1.md']);
  });
});

describe('loadCliConfig ideMode', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key';
    // 在每次测试前显式删除 TERM_PROGRAM 和 SANDBOX
    delete process.env.TERM_PROGRAM;
    delete process.env.SANDBOX;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('应默认为 false', async () => {
    process.argv = ['node', 'script.js'];
    const settings: Settings = {};
    const argv = await parseArguments();
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });

  it('如果 --ide-mode 为 true 但 TERM_PROGRAM 不是 vscode，应为 false', async () => {
    process.argv = ['node', 'script.js', '--ide-mode'];
    const settings: Settings = {};
    const argv = await parseArguments();
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });

  it('如果 settings.ideMode 为 true 但 TERM_PROGRAM 不是 vscode，应为 false', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { ideMode: true };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });

  it('当设置 --ide-mode 且 TERM_PROGRAM 为 vscode 时，应为 true', async () => {
    process.argv = ['node', 'script.js', '--ide-mode'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(true);
  });

  it('当 settings.ideMode 为 true 且 TERM_PROGRAM 为 vscode 时，应为 true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    const settings: Settings = { ideMode: true };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(true);
  });

  it('当 TERM_PROGRAM 为 vscode 时，应优先使用 --ide-mode (true) 而非设置 (false)', async () => {
    process.argv = ['node', 'script.js', '--ide-mode'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    const settings: Settings = { ideMode: false };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(true);
  });

  it('即使 TERM_PROGRAM 为 vscode，也应优先使用 --no-ide-mode (false) 而非设置 (true)', async () => {
    process.argv = ['node', 'script.js', '--no-ide-mode'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    const settings: Settings = { ideMode: true };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });

  it('当 --ide-mode 为 true，TERM_PROGRAM 为 vscode，但设置了 SANDBOX 时，应为 false', async () => {
    process.argv = ['node', 'script.js', '--ide-mode'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    process.env.SANDBOX = 'true';
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });

  it('当 settings.ideMode 为 true，TERM_PROGRAM 为 vscode，但设置了 SANDBOX 时，应为 false', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    process.env.SANDBOX = 'true';
    const settings: Settings = { ideMode: true };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });

  it('当 ideMode 为 true 时，应添加 __ide_server', async () => {
    process.argv = ['node', 'script.js', '--ide-mode'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(true);
    const mcpServers = config.getMcpServers();
    expect(mcpServers['_ide_server']).toBeDefined();
    expect(mcpServers['_ide_server'].httpUrl).toBe('http://localhost:3000/mcp');
    expect(mcpServers['_ide_server'].description).toBe('IDE connection');
    expect(mcpServers['_ide_server'].trust).toBe(false);
  });
});