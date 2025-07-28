/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import {
  Config,
  ConfigParameters,
  ContentGeneratorConfig,
} from '@iflytek/iflycode-core';

const TEST_CONTENT_GENERATOR_CONFIG: ContentGeneratorConfig = {
  apiKey: 'test-key',
  model: 'test-model',
  userAgent: 'test-agent',
};

// 模拟文件发现服务和工具注册表
vi.mock('@iflytek/iflycode-core', async () => {
  const actual = await vi.importActual('@iflytek/iflycode-core');
  return {
    ...actual,
    FileDiscoveryService: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(),
    })),
    createToolRegistry: vi.fn().mockResolvedValue({}),
  };
});

describe('配置集成测试', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'gemini-cli-test-'));
    originalEnv = { ...process.env };
    process.env.GEMINI_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('文件过滤配置', () => {
    it('应加载默认的文件过滤设置', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: undefined, // 应默认为 true
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });

    it('应从配置中加载自定义的文件过滤设置', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering: {
          respectGitIgnore: false,
        },
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
    });

    it('应合并用户和工作区的文件过滤设置', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });
  });

  describe('配置集成', () => {
    it('应优雅地处理部分配置对象', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering: {
          respectGitIgnore: false,
        },
      };

      const config = new Config(configParams);

      // 指定的设置应被应用
      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
    });

    it('应优雅地处理空配置对象', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: undefined,
      };

      const config = new Config(configParams);

      // 所有设置应使用默认值
      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });

    it('应优雅地处理缺失的配置部分', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        // 缺少 fileFiltering 配置
      };

      const config = new Config(configParams);

      // 所有 git 相关设置应使用默认值
      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });
  });

  describe('真实世界的配置场景', () => {
    it('应处理安全导向的配置', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });

    it('应处理 CI/CD 环境配置', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering: {
          respectGitIgnore: false,
        }, // CI 可能需要查看所有文件
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
    });
  });

  describe('检查点配置', () => {
    it('当设置为 true 时应启用检查点', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        checkpointing: true,
      };

      const config = new Config(configParams);

      expect(config.getCheckpointingEnabled()).toBe(true);
    });
  });

  describe('扩展上下文文件', () => {
    it('默认情况下扩展上下文文件应为空数组', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
      };
      const config = new Config(configParams);
      expect(config.getExtensionContextFilePaths()).toEqual([]);
    });

    it('应正确存储并返回扩展上下文文件路径', () => {
      const contextFiles = ['/path/to/file1.txt', '/path/to/file2.js'];
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        extensionContextFilePaths: contextFiles,
      };
      const config = new Config(configParams);
      expect(config.getExtensionContextFilePaths()).toEqual(contextFiles);
    });
  });
});