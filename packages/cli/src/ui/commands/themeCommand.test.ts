/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { themeCommand } from './themeCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('themeCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('应返回一个对话框操作以打开主题对话框', () => {
    // 确保命令具有要测试的操作。
    if (!themeCommand.action) {
      throw new Error('主题命令必须具有操作。');
    }

    const result = themeCommand.action(mockContext, '');

    // 断言操作返回正确的对象以触发主题对话框。
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'theme',
    });
  });

  it('应具有正确的名称和描述', () => {
    expect(themeCommand.name).toBe('theme');
    expect(themeCommand.description).toBe('更改主题');
  });
});