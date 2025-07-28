/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommand } from './types.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  altName: '?',
  description: '获取 iflycode 代码帮助',
  action: (_context, _args): OpenDialogActionReturn => {
    console.debug('正在打开帮助界面 ...');
    return {
      type: 'dialog',
      dialog: 'help',
    };
  },
};