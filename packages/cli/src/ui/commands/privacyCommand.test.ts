/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { privacyCommand } from './privacyCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('privacyCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('应返回一个对话框操作以打开隐私对话框', () => {
    // 确保命令具有要测试的操作。
    if (!privacyCommand.action) {
      throw new Error('隐私命令必须具有操作。');
    }

    const result = privacyCommand.action(mockContext, '');

    // 断言操作返回正确的对象以触发隐私对话框。
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'privacy',
    });
  });

  it('应具有正确的名称和描述', () => {
    expect(privacyCommand.name).toBe('privacy');
    expect(privacyCommand.description).toBe('显示隐私声明');
  });
});