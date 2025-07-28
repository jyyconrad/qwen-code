/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CommandService } from './CommandService.js';
import { type SlashCommand } from '../ui/commands/types.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { aboutCommand } from '../ui/commands/aboutCommand.js';

// 模拟命令模块以将服务与命令实现隔离
vi.mock('../ui/commands/memoryCommand.js', () => ({
  memoryCommand: { name: 'memory', description: 'Mock Memory' },
}));
vi.mock('../ui/commands/helpCommand.js', () => ({
  helpCommand: { name: 'help', description: 'Mock Help' },
}));
vi.mock('../ui/commands/clearCommand.js', () => ({
  clearCommand: { name: 'clear', description: 'Mock Clear' },
}));
vi.mock('../ui/commands/authCommand.js', () => ({
  authCommand: { name: 'auth', description: 'Mock Auth' },
}));
vi.mock('../ui/commands/themeCommand.js', () => ({
  themeCommand: { name: 'theme', description: 'Mock Theme' },
}));
vi.mock('../ui/commands/privacyCommand.js', () => ({
  privacyCommand: { name: 'privacy', description: 'Mock Privacy' },
}));
vi.mock('../ui/commands/aboutCommand.js', () => ({
  aboutCommand: { name: 'about', description: 'Mock About' },
}));

describe('CommandService', () => {
  describe('when using default production loader', () => {
    let commandService: CommandService;

    beforeEach(() => {
      commandService = new CommandService();
    });

    it('should initialize with an empty command tree', () => {
      const tree = commandService.getCommands();
      expect(tree).toBeInstanceOf(Array);
      expect(tree.length).toBe(0);
    });

    describe('loadCommands', () => {
      it('should load the built-in commands into the command tree', async () => {
        // 前置条件检查
        expect(commandService.getCommands().length).toBe(0);

        // 操作
        await commandService.loadCommands();
        const tree = commandService.getCommands();

        // 后置条件断言
        expect(tree.length).toBe(7);

        const commandNames = tree.map((cmd) => cmd.name);
        expect(commandNames).toContain('auth');
        expect(commandNames).toContain('memory');
        expect(commandNames).toContain('help');
        expect(commandNames).toContain('clear');
        expect(commandNames).toContain('theme');
        expect(commandNames).toContain('privacy');
        expect(commandNames).toContain('about');
      });

      it('should overwrite any existing commands when called again', async () => {
        // 加载一次
        await commandService.loadCommands();
        expect(commandService.getCommands().length).toBe(7);

        // 再次加载
        await commandService.loadCommands();
        const tree = commandService.getCommands();

        // 不应追加，而应覆盖
        expect(tree.length).toBe(7);
      });
    });

    describe('getCommandTree', () => {
      it('should return the current command tree', async () => {
        const initialTree = commandService.getCommands();
        expect(initialTree).toEqual([]);

        await commandService.loadCommands();

        const loadedTree = commandService.getCommands();
        expect(loadedTree.length).toBe(7);
        expect(loadedTree).toEqual([
          aboutCommand,
          authCommand,
          clearCommand,
          helpCommand,
          memoryCommand,
          privacyCommand,
          themeCommand,
        ]);
      });
    });
  });

  describe('when initialized with an injected loader function', () => {
    it('should use the provided loader instead of the built-in one', async () => {
      // 安排：创建一组模拟命令
      const mockCommands: SlashCommand[] = [
        { name: 'injected-test-1', description: 'injected 1' },
        { name: 'injected-test-2', description: 'injected 2' },
      ];

      // 安排：创建一个解析为我们的模拟命令的模拟加载器函数
      const mockLoader = vi.fn().mockResolvedValue(mockCommands);

      // 操作：使用注入的加载器函数实例化服务
      const commandService = new CommandService(mockLoader);
      await commandService.loadCommands();
      const tree = commandService.getCommands();

      // 断言：树应仅包含我们注入的命令
      expect(mockLoader).toHaveBeenCalled(); // 验证我们的模拟加载器确实被调用了
      expect(tree.length).toBe(2);
      expect(tree).toEqual(mockCommands);

      const commandNames = tree.map((cmd) => cmd.name);
      expect(commandNames).not.toContain('memory'); // 验证它没有加载生产命令
    });
  });
});