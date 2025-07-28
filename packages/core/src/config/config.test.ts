/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { Config, ConfigParameters, SandboxConfig } from './config.js';
import * as path from 'path';
import { setGeminiMdFilename as mockSetGeminiMdFilename } from '../tools/memoryTool.js';
import {
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
} from '../telemetry/index.js';
import {
  AuthType,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { GeminiClient } from '../core/client.js';
import { GitService } from '../services/gitService.js';
import { loadServerHierarchicalMemory } from '../utils/memoryDiscovery.js';

// Mock dependencies that might be called during Config construction or createServerConfig
vi.mock('../tools/tool-registry', () => {
  const ToolRegistryMock = vi.fn();
  ToolRegistryMock.prototype.registerTool = vi.fn();
  ToolRegistryMock.prototype.discoverTools = vi.fn();
  ToolRegistryMock.prototype.getAllTools = vi.fn(() => []); // Mock methods if needed
  ToolRegistryMock.prototype.getTool = vi.fn();
  ToolRegistryMock.prototype.getFunctionDeclarations = vi.fn(() => []);
  return { ToolRegistry: ToolRegistryMock };
});

vi.mock('../utils/memoryDiscovery.js', () => ({
  loadServerHierarchicalMemory: vi.fn(),
}));

// Mock individual tools if their constructors are complex or have side effects
vi.mock('../tools/ls');
vi.mock('../tools/read-file');
vi.mock('../tools/grep');
vi.mock('../tools/glob');
vi.mock('../tools/edit');
vi.mock('../tools/shell');
vi.mock('../tools/write-file');
vi.mock('../tools/web-fetch');
vi.mock('../tools/read-many-files');
vi.mock('../tools/memoryTool', () => ({
  MemoryTool: vi.fn(),
  setGeminiMdFilename: vi.fn(),
  getCurrentGeminiMdFilename: vi.fn(() => 'IFLYCODE.md'), // Mock the original filename
  DEFAULT_CONTEXT_FILENAME: 'IFLYCODE.md',
  GEMINI_CONFIG_DIR: '.iflycode',
}));

vi.mock('../core/contentGenerator.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../core/contentGenerator.js')>();
  return {
    ...actual,
    createContentGeneratorConfig: vi.fn(),
  };
});

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../telemetry/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../telemetry/index.js')>();
  return {
    ...actual,
    initializeTelemetry: vi.fn(),
  };
});

vi.mock('../services/gitService.js', () => {
  const GitServiceMock = vi.fn();
  GitServiceMock.prototype.initialize = vi.fn();
  return { GitService: GitServiceMock };
});

describe('服务器配置 (config.ts)', () => {
  const MODEL = 'gemini-pro';
  const SANDBOX: SandboxConfig = {
    command: 'docker',
    image: 'gemini-cli-sandbox',
  };
  const TARGET_DIR = '/path/to/target';
  const DEBUG_MODE = false;
  const QUESTION = '测试问题';
  const FULL_CONTEXT = false;
  const USER_MEMORY = '测试用户记忆';
  const TELEMETRY_SETTINGS = { enabled: false };
  const EMBEDDING_MODEL = 'gemini-embedding';
  const SESSION_ID = 'test-session-id';
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    embeddingModel: EMBEDDING_MODEL,
    sandbox: SANDBOX,
    targetDir: TARGET_DIR,
    debugMode: DEBUG_MODE,
    question: QUESTION,
    fullContext: FULL_CONTEXT,
    userMemory: USER_MEMORY,
    telemetry: TELEMETRY_SETTINGS,
    sessionId: SESSION_ID,
    model: MODEL,
  };

  beforeEach(() => {
    // Reset mocks if necessary
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('如果启用了检查点且 GitService 失败，应抛出错误', async () => {
      const gitError = new Error('Git 未安装');
      (GitService.prototype.initialize as Mock).mockRejectedValue(gitError);

      const config = new Config({
        ...baseParams,
        checkpointing: true,
      });

      await expect(config.initialize()).rejects.toThrow(gitError);
    });

    it('如果禁用了检查点且 GitService 失败，不应抛出错误', async () => {
      const gitError = new Error('Git 未安装');
      (GitService.prototype.initialize as Mock).mockRejectedValue(gitError);

      const config = new Config({
        ...baseParams,
        checkpointing: false,
      });

      await expect(config.initialize()).resolves.toBeUndefined();
    });
  });

  describe('refreshAuth', () => {
    it('应刷新认证并更新配置', async () => {
      const config = new Config(baseParams);
      const authType = AuthType.USE_GEMINI;
      const newModel = 'gemini-flash';
      const mockContentConfig = {
        model: newModel,
        apiKey: 'test-key',
      };

      (createContentGeneratorConfig as Mock).mockResolvedValue(
        mockContentConfig,
      );

      await config.refreshAuth(authType);

      expect(createContentGeneratorConfig).toHaveBeenCalledWith(
        MODEL, // 应使用原始模型 'gemini-pro' 调用
        authType,
      );
      // 验证 contentGeneratorConfig 是否已更新为新模型
      expect(config.getContentGeneratorConfig()).toEqual(mockContentConfig);
      expect(config.getContentGeneratorConfig().model).toBe(newModel);
      expect(config.getModel()).toBe(newModel); // getModel() 应返回更新后的模型
      expect(GeminiClient).toHaveBeenCalledWith(config);
    });
  });

  it('Config 构造函数应正确存储 userMemory', () => {
    const config = new Config(baseParams);

    expect(config.getUserMemory()).toBe(USER_MEMORY);
    // 如有必要，验证其他 getter
    expect(config.getTargetDir()).toBe(path.resolve(TARGET_DIR)); // 检查解析后的路径
  });

  it('如果未提供 userMemory，Config 构造函数应默认为空字符串', () => {
    const paramsWithoutMemory: ConfigParameters = { ...baseParams };
    delete paramsWithoutMemory.userMemory;
    const config = new Config(paramsWithoutMemory);

    expect(config.getUserMemory()).toBe('');
  });

  it('如果提供了 contextFileName，Config 构造函数应调用 setGeminiMdFilename', () => {
    const contextFileName = 'CUSTOM_AGENTS.md';
    const paramsWithContextFile: ConfigParameters = {
      ...baseParams,
      contextFileName,
    };
    new Config(paramsWithContextFile);
    expect(mockSetGeminiMdFilename).toHaveBeenCalledWith(contextFileName);
  });

  it('如果未提供 contextFileName，Config 构造函数不应调用 setGeminiMdFilename', () => {
    new Config(baseParams); // baseParams 不包含 contextFileName
    expect(mockSetGeminiMdFilename).not.toHaveBeenCalled();
  });

  it('当未提供文件过滤设置时，应设置默认值', () => {
    const config = new Config(baseParams);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
  });

  it('当提供了自定义文件过滤设置时，应正确设置', () => {
    const paramsWithFileFiltering: ConfigParameters = {
      ...baseParams,
      fileFiltering: {
        respectGitIgnore: false,
      },
    };
    const config = new Config(paramsWithFileFiltering);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
  });

  it('当 telemetry 设置为 true 时，Config 构造函数应正确设置', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: { enabled: true },
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('当 telemetry 设置为 false 时，Config 构造函数应正确设置', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: { enabled: false },
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('如果未提供 telemetry，Config 构造函数应默认为默认值', () => {
    const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
    delete paramsWithoutTelemetry.telemetry;
    const config = new Config(paramsWithoutTelemetry);
    expect(config.getTelemetryEnabled()).toBe(TELEMETRY_SETTINGS.enabled);
  });

  it('应有一个 getFileService 方法返回 FileDiscoveryService', () => {
    const config = new Config(baseParams);
    const fileService = config.getFileService();
    expect(fileService).toBeDefined();
  });

  describe('遥测设置', () => {
    it('如果未提供，应返回默认遥测目标', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true },
      };
      const config = new Config(params);
      expect(config.getTelemetryTarget()).toBe(DEFAULT_TELEMETRY_TARGET);
    });

    it('应返回提供的 OTLP 端点', () => {
      const endpoint = 'http://custom.otel.collector:4317';
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true, otlpEndpoint: endpoint },
      };
      const config = new Config(params);
      expect(config.getTelemetryOtlpEndpoint()).toBe(endpoint);
    });

    it('如果未提供，应返回默认 OTLP 端点', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true },
      };
      const config = new Config(params);
      expect(config.getTelemetryOtlpEndpoint()).toBe(DEFAULT_OTLP_ENDPOINT);
    });

    it('应返回提供的 logPrompts 设置', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true, logPrompts: false },
      };
      const config = new Config(params);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
    });

    it('如果未提供，应返回默认 logPrompts 设置 (true)', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true },
      };
      const config = new Config(params);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    it('如果未提供 telemetry 对象，应返回默认 logPrompts 设置 (true)', () => {
      const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
      delete paramsWithoutTelemetry.telemetry;
      const config = new Config(paramsWithoutTelemetry);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    it('如果未提供 telemetry 对象，应返回默认遥测目标', () => {
      const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
      delete paramsWithoutTelemetry.telemetry;
      const config = new Config(paramsWithoutTelemetry);
      expect(config.getTelemetryTarget()).toBe(DEFAULT_TELEMETRY_TARGET);
    });

    it('如果未提供 telemetry 对象，应返回默认 OTLP 端点', () => {
      const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
      delete paramsWithoutTelemetry.telemetry;
      const config = new Config(paramsWithoutTelemetry);
      expect(config.getTelemetryOtlpEndpoint()).toBe(DEFAULT_OTLP_ENDPOINT);
    });
  });

  describe('refreshMemory', () => {
    it('刷新成功时应更新内存和文件计数', async () => {
      const config = new Config(baseParams);
      const mockMemoryData = {
        memoryContent: 'new memory content',
        fileCount: 5,
      };

      (loadServerHierarchicalMemory as Mock).mockResolvedValue(mockMemoryData);

      const result = await config.refreshMemory();

      expect(loadServerHierarchicalMemory).toHaveBeenCalledWith(
        config.getWorkingDir(),
        config.getDebugMode(),
        config.getFileService(),
        config.getExtensionContextFilePaths(),
      );

      expect(config.getUserMemory()).toBe(mockMemoryData.memoryContent);
      expect(config.getGeminiMdFileCount()).toBe(mockMemoryData.fileCount);
      expect(result).toEqual(mockMemoryData);
    });

    it('应传播来自 loadServerHierarchicalMemory 的错误', async () => {
      const config = new Config(baseParams);
      const testError = new Error('加载内存失败');

      (loadServerHierarchicalMemory as Mock).mockRejectedValue(testError);

      await expect(config.refreshMemory()).rejects.toThrow(testError);
    });
  });
});