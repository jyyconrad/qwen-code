/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { authCommand } from './authCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('authCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('应返回一个对话框操作以打开认证对话框', () => {
    if (!authCommand.action) {
      throw new Error('认证命令必须有一个操作。');
    }

    const result = authCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'auth',
    });
  });

  it('应具有正确的名称和描述', () => {
    expect(authCommand.name).toBe('auth');
    expect(authCommand.description).toBe('更改认证方法');
  });
});