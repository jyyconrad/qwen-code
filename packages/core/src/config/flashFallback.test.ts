/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Config } from './config.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FLASH_MODEL } from './models.js';

describe('Flash 模型降级配置', () => {
  let config: Config;

  beforeEach(() => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: DEFAULT_GEMINI_MODEL,
    });

    // 初始化 contentGeneratorConfig 用于测试
    (
      config as unknown as { contentGeneratorConfig: unknown }
    ).contentGeneratorConfig = {
      model: DEFAULT_GEMINI_MODEL,
      authType: 'oauth-personal',
    };
  });

  describe('setModel', () => {
    it('应在会话期间更新模型并标记为已切换', () => {
      expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(false);

      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);

      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });

    it('应处理会话期间的多次模型切换', () => {
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      config.setModel('gemini-1.5-pro');
      expect(config.getModel()).toBe('gemini-1.5-pro');
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });

    it('仅在 contentGeneratorConfig 存在时才标记为已切换', () => {
      // 创建未初始化 contentGeneratorConfig 的配置
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
        model: DEFAULT_GEMINI_MODEL,
      });

      // 当 contentGeneratorConfig 未定义时不应崩溃
      newConfig.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(newConfig.isModelSwitchedDuringSession()).toBe(false);
    });
  });

  describe('getModel', () => {
    it('如果可用，应返回 contentGeneratorConfig 模型', () => {
      // 模拟已初始化的内容生成器配置
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('如果 contentGeneratorConfig 不可用，应回退到初始模型', () => {
      // 测试 fresh 配置，其中 contentGeneratorConfig 可能未设置
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
        model: 'custom-model',
      });

      expect(newConfig.getModel()).toBe('custom-model');
    });
  });

  describe('isModelSwitchedDuringSession', () => {
    it('新会话应以 false 开始', () => {
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('如果没有模型切换发生，应保持为 false', () => {
      // 执行不涉及模型切换的其他操作
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('切换状态应在整个会话中保持', () => {
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      // 即使在获取模型后也应保持为 true
      config.getModel();
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });
  });

  describe('resetModelToDefault', () => {
    it('应重置模型为默认值并清除会话切换标志', () => {
      // 首先切换到 Flash
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      // 重置为默认值
      config.resetModelToDefault();

      // 应回到默认值且标志已清除
      expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('应处理 contentGeneratorConfig 未初始化的情况', () => {
      // 创建未初始化 contentGeneratorConfig 的配置
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
        model: DEFAULT_GEMINI_MODEL,
      });

      // 当 contentGeneratorConfig 未定义时不应崩溃
      expect(() => newConfig.resetModelToDefault()).not.toThrow();
      expect(newConfig.isModelSwitchedDuringSession()).toBe(false);
    });
  });
});