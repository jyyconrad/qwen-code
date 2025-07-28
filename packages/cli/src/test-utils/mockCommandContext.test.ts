/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect } from 'vitest';
import { createMockCommandContext } from './mockCommandContext.js';

describe('createMockCommandContext', () => {
  it('应返回一个具有默认模拟对象的有效 CommandContext 对象', () => {
    const context = createMockCommandContext();

    // 只进行一些抽查以确保结构正确
    // 且函数为模拟函数。
    expect(context).toBeDefined();
    expect(context.ui.addItem).toBeInstanceOf(Function);
    expect(vi.isMockFunction(context.ui.addItem)).toBe(true);
  });

  it('应正确应用顶层覆盖', () => {
    const mockClear = vi.fn();
    const overrides = {
      ui: {
        clear: mockClear,
      },
    };

    const context = createMockCommandContext(overrides);

    // 调用函数以查看是否使用了覆盖
    context.ui.clear();

    // 断言我们特定的模拟函数被调用了，而不是默认的
    expect(mockClear).toHaveBeenCalled();
    // 并且其他默认值仍然存在
    expect(vi.isMockFunction(context.ui.addItem)).toBe(true);
  });

  it('应正确应用深度嵌套的覆盖', () => {
    // 这是工厂逻辑最重要的测试。
    const mockConfig = {
      getProjectRoot: () => '/test/project',
      getModel: () => 'gemini-pro',
    };

    const overrides = {
      services: {
        config: mockConfig,
      },
    };

    const context = createMockCommandContext(overrides);

    expect(context.services.config).toBeDefined();
    expect(context.services.config?.getModel()).toBe('gemini-pro');
    expect(context.services.config?.getProjectRoot()).toBe('/test/project');

    // 验证同一嵌套对象上的默认属性仍然存在
    expect(context.services.logger).toBeDefined();
  });
});