/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';

// 模拟依赖项
vi.mock('fs/promises');
vi.mock('glob');
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    FileDiscoveryService: vi.fn(),
    isNodeError: vi.fn((error) => error.code === 'ENOENT'),
    escapePath: vi.fn((path) => path),
    unescapePath: vi.fn((path) => path),
    getErrorMessage: vi.fn((error) => error.message),
  };
});
vi.mock('glob');

describe('useCompletion', () => {
  let mockFileDiscoveryService: Mocked<FileDiscoveryService>;
  let mockConfig: Mocked<Config>;
  let mockCommandContext: CommandContext;
  let mockSlashCommands: SlashCommand[];

  const testCwd = '/test/project';

  beforeEach(() => {
    mockFileDiscoveryService = {
      shouldGitIgnoreFile: vi.fn(),
      shouldGeminiIgnoreFile: vi.fn(),
      shouldIgnoreFile: vi.fn(),
      filterFiles: vi.fn(),
      getGeminiIgnorePatterns: vi.fn(),
      projectRoot: '',
      gitIgnoreFilter: null,
      geminiIgnoreFilter: null,
    } as unknown as Mocked<FileDiscoveryService>;

    mockConfig = {
      getFileFilteringRespectGitIgnore: vi.fn(() => true),
      getFileService: vi.fn().mockReturnValue(mockFileDiscoveryService),
      getEnableRecursiveFileSearch: vi.fn(() => true),
    } as unknown as Mocked<Config>;

    mockCommandContext = {} as CommandContext;

    mockSlashCommands = [
      {
        name: 'help',
        altName: '?',
        description: '显示帮助',
        action: vi.fn(),
      },
      {
        name: 'clear',
        description: '清屏',
        action: vi.fn(),
      },
      {
        name: 'memory',
        description: '管理内存',
        subCommands: [
          {
            name: 'show',
            description: '显示内存',
            action: vi.fn(),
          },
          {
            name: 'add',
            description: '添加到内存',
            action: vi.fn(),
          },
        ],
      },
      {
        name: 'chat',
        description: '管理聊天历史',
        subCommands: [
          {
            name: 'save',
            description: '保存聊天',
            action: vi.fn(),
          },
          {
            name: 'resume',
            description: '恢复已保存的聊天',
            action: vi.fn(),
            completion: vi.fn().mockResolvedValue(['chat1', 'chat2']),
          },
        ],
      },
    ];

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Hook 初始化和状态', () => {
    it('应使用默认状态初始化', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          false,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    it('当 isActive 变为 false 时应重置状态', () => {
      const { result, rerender } = renderHook(
        ({ isActive }) =>
          useCompletion(
            '/help',
            testCwd,
            isActive,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { isActive: true } },
      );

      rerender({ isActive: false });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    it('应提供所需函数', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(typeof result.current.setActiveSuggestionIndex).toBe('function');
      expect(typeof result.current.setShowSuggestions).toBe('function');
      expect(typeof result.current.resetCompletionState).toBe('function');
      expect(typeof result.current.navigateUp).toBe('function');
      expect(typeof result.current.navigateDown).toBe('function');
    });
  });

  describe('resetCompletionState', () => {
    it('应将所有状态重置为默认值', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/help',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      act(() => {
        result.current.setActiveSuggestionIndex(5);
        result.current.setShowSuggestions(true);
      });

      act(() => {
        result.current.resetCompletionState();
      });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });
  });

  describe('导航函数', () => {
    it('在没有建议时应处理 navigateUp', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(-1);
    });

    it('在没有建议时应处理 navigateDown', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      act(() => {
        result.current.navigateDown();
      });

      expect(result.current.activeSuggestionIndex).toBe(-1);
    });

    it('应通过建议向上导航并循环', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(1);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('应通过建议向下导航并循环', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(1);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateDown();
      });

      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('应处理多个建议的导航', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(4);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateDown();
      });
      expect(result.current.activeSuggestionIndex).toBe(1);

      act(() => {
        result.current.navigateDown();
      });
      expect(result.current.activeSuggestionIndex).toBe(2);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(1);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(3);
    });

    it('应处理大型建议列表和滚动的导航', () => {
      const largeMockCommands = Array.from({ length: 15 }, (_, i) => ({
        name: `command${i}`,
        description: `命令 ${i}`,
        action: vi.fn(),
      }));

      const { result } = renderHook(() =>
        useCompletion(
          '/command',
          testCwd,
          true,
          largeMockCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(15);
      expect(result.current.activeSuggestionIndex).toBe(0);
      expect(result.current.visibleStartIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(14);
      expect(result.current.visibleStartIndex).toBe(Math.max(0, 15 - 8));
    });
  });

  describe('斜杠命令补全', () => {
    it('应为根斜杠显示所有命令', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(4);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['help', 'clear', 'memory', 'chat']),
      );
      expect(result.current.showSuggestions).toBe(true);
      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('应按前缀过滤命令', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
      expect(result.current.suggestions[0].description).toBe('显示帮助');
    });

    it('应按 altName 建议命令', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/?',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
    });

    it('对于精确的叶命令匹配不应显示建议', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/clear',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('应为父命令显示子命令', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('应在父命令后加空格显示所有子命令', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory ',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('应按前缀过滤子命令', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory a',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('add');
    });

    it('应优雅地处理未知命令', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/unknown',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  describe('命令参数补全', () => {
    it('应为命令参数调用补全函数', async () => {
      const completionFn = vi.fn().mockResolvedValue(['arg1', 'arg2']);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      const { result } = renderHook(() =>
        useCompletion(
          '/chat resume ',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(completionFn).toHaveBeenCalledWith(mockCommandContext, '');
      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual([
        'arg1',
        'arg2',
      ]);
    });

    it('应使用部分参数调用补全函数', async () => {
      const completionFn = vi.fn().mockResolvedValue(['arg1', 'arg2']);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      renderHook(() =>
        useCompletion(
          '/chat resume ar',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(completionFn).toHaveBeenCalledWith(mockCommandContext, 'ar');
    });

    it('应处理返回 null 的补全函数', async () => {
      const completionFn = vi.fn().mockResolvedValue(null);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      const { result } = renderHook(() =>
        useCompletion(
          '/chat resume ',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  describe('文件路径补全 (@-语法)', () => {
    beforeEach(() => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'file2.js', isDirectory: () => false },
        { name: 'folder1', isDirectory: () => true },
        { name: '.hidden', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
    });

    it('应为 @ 前缀显示文件补全', async () => {
      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(3);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['file1.txt', 'file2.js', 'folder1/']),
      );
    });

    it('应按前缀过滤文件', async () => {
      // 由于 enableRecursiveFileSearch 为 true，模拟递归搜索
      vi.mocked(glob).mockResolvedValue([
        `${testCwd}/file1.txt`,
        `${testCwd}/file2.js`,
      ]);

      const { result } = renderHook(() =>
        useCompletion(
          '@file',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['file1.txt', 'file2.js']),
      );
    });

    it('当前缀以点开头时应包含隐藏文件', async () => {
      // 由于 enableRecursiveFileSearch 为 true，模拟递归搜索
      vi.mocked(glob).mockResolvedValue([`${testCwd}/.hidden`]);

      const { result } = renderHook(() =>
        useCompletion(
          '@.',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('.hidden');
    });

    it('应优雅地处理 ENOENT 错误', async () => {
      const enoentError = new Error('No such file or directory');
      (enoentError as Error & { code: string }).code = 'ENOENT';
      vi.mocked(fs.readdir).mockRejectedValue(enoentError);

      const { result } = renderHook(() =>
        useCompletion(
          '@nonexistent',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('应通过重置状态处理其他错误', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('防抖', () => {
    it('应对文件补全请求进行防抖', async () => {
      // 由于 enableRecursiveFileSearch 为 true，模拟递归搜索
      vi.mocked(glob).mockResolvedValue([`${testCwd}/file1.txt`]);

      const { rerender } = renderHook(
        ({ query }) =>
          useCompletion(
            query,
            testCwd,
            true,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { query: '@f' } },
      );

      rerender({ query: '@fi' });
      rerender({ query: '@fil' });
      rerender({ query: '@file' });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(glob).toHaveBeenCalledTimes(1);
    });
  });

  describe('查询处理边缘情况', () => {
    it('应处理空查询', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('应处理不带斜杠或 @ 的查询', () => {
      const { result } = renderHook(() =>
        useCompletion(
          'regular text',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('应处理带空格的查询', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '   /hel',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
    });

    it('应处理查询末尾的 @', async () => {
      // 由于 enableRecursiveFileSearch 为 true，模拟递归搜索
      vi.mocked(glob).mockResolvedValue([`${testCwd}/file1.txt`]);

      const { result } = renderHook(() =>
        useCompletion(
          'some text @',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      // 等待补全完成
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // 应处理 @ 查询并获取建议
      expect(result.current.isLoadingSuggestions).toBe(false);
      expect(result.current.suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('文件排序行为', () => {
    it('应优先显示同名基础文件的源文件而非测试文件', async () => {
      // 模拟 glob 返回具有相同基础名称但不同扩展名的文件
      vi.mocked(glob).mockResolvedValue([
        `${testCwd}/component.test.ts`,
        `${testCwd}/component.ts`,
        `${testCwd}/utils.spec.js`,
        `${testCwd}/utils.js`,
        `${testCwd}/api.test.tsx`,
        `${testCwd}/api.tsx`,
      ]);

      mockFileDiscoveryService.shouldIgnoreFile.mockReturnValue(false);

      const { result } = renderHook(() =>
        useCompletion(
          '@comp',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(6);

      // 提取标签以便于测试
      const labels = result.current.suggestions.map((s) => s.label);

      // 验证确切的排序顺序：源文件应排在其测试文件之前
      expect(labels).toEqual([
        'api.tsx',
        'api.test.tsx',
        'component.ts',
        'component.test.ts',
        'utils.js',
        'utils.spec.js',
      ]);
    });
  });

  describe('配置和 FileDiscoveryService 集成', () => {
    it('应在没有配置的情况下工作', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          undefined,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('file1.txt');
    });

    it('当提供配置时应尊重文件过滤', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'ignored.log', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
        (path: string) => path.includes('.log'),
      );

      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('file1.txt');
    });
  });
});