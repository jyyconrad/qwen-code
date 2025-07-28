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
import { Config, FileDiscoveryService } from '@iflytek/iflycode-core';

interface MockConfig {
  getFileFilteringRespectGitIgnore: () => boolean;
  getEnableRecursiveFileSearch: () => boolean;
  getFileService: () => FileDiscoveryService | null;
}

// 模拟依赖项
vi.mock('fs/promises');
vi.mock('@iflytek/iflycode-core', async () => {
  const actual = await vi.importActual('@iflytek/iflycode-core');
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

describe('useCompletion git-aware filtering integration', () => {
  let mockFileDiscoveryService: Mocked<FileDiscoveryService>;
  let mockConfig: MockConfig;

  const testCwd = '/test/project';
  const slashCommands = [
    { name: 'help', description: 'Show help', action: vi.fn() },
    { name: 'clear', description: 'Clear screen', action: vi.fn() },
  ];

  // 对于这些测试，一个最小的模拟就足够了。
  const mockCommandContext = {} as CommandContext;

  const mockSlashCommands: SlashCommand[] = [
    {
      name: 'help',
      altName: '?',
      description: 'Show help',
      action: vi.fn(),
    },
    {
      name: 'clear',
      description: 'Clear the screen',
      action: vi.fn(),
    },
    {
      name: 'memory',
      description: 'Manage memory',
      // 此命令是父命令，无操作。
      subCommands: [
        {
          name: 'show',
          description: 'Show memory',
          action: vi.fn(),
        },
        {
          name: 'add',
          description: 'Add to memory',
          action: vi.fn(),
        },
      ],
    },
    {
      name: 'chat',
      description: 'Manage chat history',
      subCommands: [
        {
          name: 'save',
          description: 'Save chat',
          action: vi.fn(),
        },
        {
          name: 'resume',
          description: 'Resume a saved chat',
          action: vi.fn(),
          // 此命令提供自己的参数补全
          completion: vi
            .fn()
            .mockResolvedValue([
              'my-chat-tag-1',
              'my-chat-tag-2',
              'my-channel',
            ]),
        },
      ],
    },
  ];

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
    };

    vi.mocked(FileDiscoveryService).mockImplementation(
      () => mockFileDiscoveryService,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should filter git-ignored entries from @ completions', async () => {
    const globResults = [`${testCwd}/data`, `${testCwd}/dist`];
    vi.mocked(glob).mockResolvedValue(globResults);

    // 模拟 git ignore 服务以忽略某些文件
    mockFileDiscoveryService.shouldGitIgnoreFile.mockImplementation(
      (path: string) => path.includes('dist'),
    );
    mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
      (path: string, options) => {
        if (options?.respectGitIgnore !== false) {
          return mockFileDiscoveryService.shouldGitIgnoreFile(path);
        }
        return false;
      },
    );

    const { result } = renderHook(() =>
      useCompletion(
        '@d',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfig as Config,
      ),
    );

    // 等待异步操作完成
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150)); // 考虑防抖
    });

    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions).toEqual(
      expect.arrayContaining([{ label: 'data', value: 'data' }]),
    );
    expect(result.current.showSuggestions).toBe(true);
  });

  it('should filter git-ignored directories from @ completions', async () => {
    // 模拟 fs.readdir 以返回常规和 git-ignored 目录
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'src', isDirectory: () => true },
      { name: 'node_modules', isDirectory: () => true },
      { name: 'dist', isDirectory: () => true },
      { name: 'README.md', isDirectory: () => false },
      { name: '.env', isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    // 模拟 git ignore 服务以忽略某些文件
    mockFileDiscoveryService.shouldGitIgnoreFile.mockImplementation(
      (path: string) =>
        path.includes('node_modules') ||
        path.includes('dist') ||
        path.includes('.env'),
    );
    mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
      (path: string, options) => {
        if (options?.respectGitIgnore !== false) {
          return mockFileDiscoveryService.shouldGitIgnoreFile(path);
        }
        return false;
      },
    );

    const { result } = renderHook(() =>
      useCompletion(
        '@',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfig as Config,
      ),
    );

    // 等待异步操作完成
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150)); // 考虑防抖
    });

    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions).toEqual(
      expect.arrayContaining([
        { label: 'src/', value: 'src/' },
        { label: 'README.md', value: 'README.md' },
      ]),
    );
    expect(result.current.showSuggestions).toBe(true);
  });

  it('should handle recursive search with git-aware filtering', async () => {
    // 模拟递归文件搜索场景
    vi.mocked(fs.readdir).mockImplementation(
      async (dirPath: string | Buffer | URL) => {
        if (dirPath === testCwd) {
          return [
            { name: 'src', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
            { name: 'temp', isDirectory: () => true },
          ] as Array<{ name: string; isDirectory: () => boolean }>;
        }
        if (dirPath.endsWith('/src')) {
          return [
            { name: 'index.ts', isDirectory: () => false },
            { name: 'components', isDirectory: () => true },
          ] as Array<{ name: string; isDirectory: () => boolean }>;
        }
        if (dirPath.endsWith('/temp')) {
          return [{ name: 'temp.log', isDirectory: () => false }] as Array<{
            name: string;
            isDirectory: () => boolean;
          }>;
        }
        return [] as Array<{ name: string; isDirectory: () => boolean }>;
      },
    );

    // 模拟 git ignore 服务
    mockFileDiscoveryService.shouldGitIgnoreFile.mockImplementation(
      (path: string) => path.includes('node_modules') || path.includes('temp'),
    );
    mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
      (path: string, options) => {
        if (options?.respectGitIgnore !== false) {
          return mockFileDiscoveryService.shouldGitIgnoreFile(path);
        }
        return false;
      },
    );

    const { result } = renderHook(() =>
      useCompletion(
        '@t',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfig as Config,
      ),
    );

    // 等待异步操作完成
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // 不应包含 node_modules 或 dist 中的任何内容
    const suggestionLabels = result.current.suggestions.map((s) => s.label);
    expect(suggestionLabels).not.toContain('temp/');
    expect(suggestionLabels.some((l) => l.includes('node_modules'))).toBe(
      false,
    );
  });

  it('should not perform recursive search when disabled in config', async () => {
    const globResults = [`${testCwd}/data`, `${testCwd}/dist`];
    vi.mocked(glob).mockResolvedValue(globResults);

    // 在模拟配置中禁用递归搜索
    const mockConfigNoRecursive = {
      ...mockConfig,
      getEnableRecursiveFileSearch: vi.fn(() => false),
    } as unknown as Config;

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'data', isDirectory: () => true },
      { name: 'dist', isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    renderHook(() =>
      useCompletion(
        '@d',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfigNoRecursive,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // 由于递归搜索被禁用，不应调用 `glob`
    expect(glob).not.toHaveBeenCalled();
    // 应调用 `fs.readdir` 来读取顶级目录
    expect(fs.readdir).toHaveBeenCalledWith(testCwd, { withFileTypes: true });
  });

  it('should work without config (fallback behavior)', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'src', isDirectory: () => true },
      { name: 'node_modules', isDirectory: () => true },
      { name: 'README.md', isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const { result } = renderHook(() =>
      useCompletion(
        '@',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        undefined,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // 没有配置时，应包含所有文件
    expect(result.current.suggestions).toHaveLength(3);
    expect(result.current.suggestions).toEqual(
      expect.arrayContaining([
        { label: 'src/', value: 'src/' },
        { label: 'node_modules/', value: 'node_modules/' },
        { label: 'README.md', value: 'README.md' },
      ]),
    );
  });

  it('should handle git discovery service initialization failure gracefully', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'src', isDirectory: () => true },
      { name: 'README.md', isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCompletion(
        '@',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfig as Config,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // 由于我们使用集中式服务，初始化错误在配置级别处理
    // 此测试应验证优雅的回退行为
    expect(result.current.suggestions.length).toBeGreaterThanOrEqual(0);
    // 即使 git 发现失败也应显示补全
    expect(result.current.suggestions.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  it('should handle directory-specific completions with git filtering', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'component.tsx', isDirectory: () => false },
      { name: 'temp.log', isDirectory: () => false },
      { name: 'index.ts', isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    mockFileDiscoveryService.shouldGitIgnoreFile.mockImplementation(
      (path: string) => path.includes('.log'),
    );
    mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
      (path: string, options) => {
        if (options?.respectGitIgnore !== false) {
          return mockFileDiscoveryService.shouldGitIgnoreFile(path);
        }
        return false;
      },
    );

    const { result } = renderHook(() =>
      useCompletion(
        '@src/comp',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfig as Config,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // 应过滤掉 .log 文件但包含匹配的 .tsx 文件
    expect(result.current.suggestions).toEqual([
      { label: 'component.tsx', value: 'component.tsx' },
    ]);
  });

  it('should use glob for top-level @ completions when available', async () => {
    const globResults = [`${testCwd}/src/index.ts`, `${testCwd}/README.md`];
    vi.mocked(glob).mockResolvedValue(globResults);

    const { result } = renderHook(() =>
      useCompletion(
        '@s',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfig as Config,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(glob).toHaveBeenCalledWith('**/s*', {
      cwd: testCwd,
      dot: false,
      nocase: true,
    });
    expect(fs.readdir).not.toHaveBeenCalled(); // 确保使用 glob 而不是 readdir
    expect(result.current.suggestions).toEqual([
      { label: 'README.md', value: 'README.md' },
      { label: 'src/index.ts', value: 'src/index.ts' },
    ]);
  });

  it('should include dotfiles in glob search when input starts with a dot', async () => {
    const globResults = [
      `${testCwd}/.env`,
      `${testCwd}/.gitignore`,
      `${testCwd}/src/index.ts`,
    ];
    vi.mocked(glob).mockResolvedValue(globResults);

    const { result } = renderHook(() =>
      useCompletion(
        '@.',
        testCwd,
        true,
        slashCommands,
        mockCommandContext,
        mockConfig as Config,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(glob).toHaveBeenCalledWith('**/.*', {
      cwd: testCwd,
      dot: true,
      nocase: true,
    });
    expect(fs.readdir).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([
      { label: '.env', value: '.env' },
      { label: '.gitignore', value: '.gitignore' },
      { label: 'src/index.ts', value: 'src/index.ts' },
    ]);
  });

  it('should suggest top-level command names based on partial input', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/mem',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toEqual([
      { label: 'memory', value: 'memory', description: 'Manage memory' },
    ]);
    expect(result.current.showSuggestions).toBe(true);
  });

  it('should suggest commands based on altName', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/?',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toEqual([
      { label: 'help', value: 'help', description: 'Show help' },
    ]);
  });

  it('should suggest sub-command names for a parent command', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory a',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toEqual([
      { label: 'add', value: 'add', description: 'Add to memory' },
    ]);
  });

  it('should suggest all sub-commands when the query ends with the parent command and a space', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory ',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions).toEqual(
      expect.arrayContaining([
        { label: 'show', value: 'show', description: 'Show memory' },
        { label: 'add', value: 'add', description: 'Add to memory' },
      ]),
    );
  });

  it('should call the command.completion function for argument suggestions', async () => {
    const availableTags = ['my-chat-tag-1', 'my-chat-tag-2', 'another-channel'];
    const mockCompletionFn = vi
      .fn()
      .mockImplementation(async (context: CommandContext, partialArg: string) =>
        availableTags.filter((tag) => tag.startsWith(partialArg)),
      );

    const mockCommandsWithFiltering = JSON.parse(
      JSON.stringify(mockSlashCommands),
    ) as SlashCommand[];

    const chatCmd = mockCommandsWithFiltering.find(
      (cmd) => cmd.name === 'chat',
    );
    if (!chatCmd || !chatCmd.subCommands) {
      throw new Error(
        "Test setup error: Could not find the 'chat' command with subCommands in the mock data.",
      );
    }

    const resumeCmd = chatCmd.subCommands.find((sc) => sc.name === 'resume');
    if (!resumeCmd) {
      throw new Error(
        "Test setup error: Could not find the 'resume' sub-command in the mock data.",
      );
    }

    resumeCmd.completion = mockCompletionFn;

    const { result } = renderHook(() =>
      useCompletion(
        '/chat resume my-ch',
        '/test/cwd',
        true,
        mockCommandsWithFiltering,
        mockCommandContext,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, 'my-ch');

    expect(result.current.suggestions).toEqual([
      { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
      { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
    ]);
  });

  it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/clear ',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toHaveLength(0);
    expect(result.current.showSuggestions).toBe(false);
  });

  it('should not provide suggestions for an unknown command', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/unknown-command',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toHaveLength(0);
    expect(result.current.showSuggestions).toBe(false);
  });

  it('should suggest sub-commands for a fully typed parent command without a trailing space', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory', // 注意：无尾随空格
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    // 断言立即显示子命令建议
    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions).toEqual(
      expect.arrayContaining([
        { label: 'show', value: 'show', description: 'Show memory' },
        { label: 'add', value: 'add', description: 'Add to memory' },
      ]),
    );
    expect(result.current.showSuggestions).toBe(true);
  });

  it('should NOT provide suggestions for a perfectly typed command that is a leaf node', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/clear', // 无尾随空格
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toHaveLength(0);
    expect(result.current.showSuggestions).toBe(false);
  });

  it('should call command.completion with an empty string when args start with a space', async () => {
    const mockCompletionFn = vi
      .fn()
      .mockResolvedValue(['my-chat-tag-1', 'my-chat-tag-2', 'my-channel']);

    const isolatedMockCommands = JSON.parse(
      JSON.stringify(mockSlashCommands),
    ) as SlashCommand[];

    const resumeCommand = isolatedMockCommands
      .find((cmd) => cmd.name === 'chat')
      ?.subCommands?.find((cmd) => cmd.name === 'resume');

    if (!resumeCommand) {
      throw new Error(
        'Test setup failed: could not find resume command in mock',
      );
    }
    resumeCommand.completion = mockCompletionFn;

    const { result } = renderHook(() =>
      useCompletion(
        '/chat resume ', // 尾随空格，无部分参数
        '/test/cwd',
        true,
        isolatedMockCommands,
        mockCommandContext,
      ),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
    expect(result.current.suggestions).toHaveLength(3);
    expect(result.current.showSuggestions).toBe(true);
  });

  it('should suggest all top-level commands for the root slash', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions.length).toBe(mockSlashCommands.length);
    expect(result.current.suggestions.map((s) => s.label)).toEqual(
      expect.arrayContaining(['help', 'clear', 'memory', 'chat']),
    );
  });

  it('should provide no suggestions for an invalid sub-command', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory dothisnow',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    expect(result.current.suggestions).toHaveLength(0);
    expect(result.current.showSuggestions).toBe(false);
  });
});