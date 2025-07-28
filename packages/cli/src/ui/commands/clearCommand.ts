/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: '清除屏幕和对话历史',
  action: async (context, _args) => {
    context.ui.setDebugMessage('正在清除终端并重置聊天。');
    await context.services.config?.getGeminiClient()?.resetChat();
    context.ui.clear();
  },
};