/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../ui/commands/types.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { aboutCommand } from '../ui/commands/aboutCommand.js';

const loadBuiltInCommands = async (): Promise<SlashCommand[]> => [
  aboutCommand,
  authCommand,
  clearCommand,
  helpCommand,
  memoryCommand,
  privacyCommand,
  themeCommand,
];

export class CommandService {
  private commands: SlashCommand[] = [];

  constructor(
    private commandLoader: () => Promise<SlashCommand[]> = loadBuiltInCommands,
  ) {
    // 构造函数可用于未来的依赖注入。
  }

  async loadCommands(): Promise<void> {
    // 目前，我们只加载内置命令。
    // 基于文件和远程的命令将在后续添加。
    this.commands = await this.commandLoader();
  }

  getCommands(): SlashCommand[] {
    return this.commands;
  }
}