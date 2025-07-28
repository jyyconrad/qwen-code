/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  checkHasEditorType,
  getDiffCommand,
  openDiff,
  allowEditorTypeInSandbox,
  isEditorAvailable,
  type EditorType,
} from './editor.js';
import { execSync, spawn } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

const originalPlatform = process.platform;

describe('编辑器工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SANDBOX;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SANDBOX;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  describe('checkHasEditorType', () => {
    const testCases: Array<{
      editor: EditorType;
      command: string;
      win32Command: string;
    }> = [
      { editor: 'vscode', command: 'code', win32Command: 'code.cmd' },
      { editor: 'vscodium', command: 'codium', win32Command: 'codium.cmd' },
      { editor: 'windsurf', command: 'windsurf', win32Command: 'windsurf' },
      { editor: 'cursor', command: 'cursor', win32Command: 'cursor' },
      { editor: 'vim', command: 'vim', win32Command: 'vim' },
      { editor: 'neovim', command: 'nvim', win32Command: 'nvim' },
      { editor: 'zed', command: 'zed', win32Command: 'zed' },
    ];

    for (const { editor, command, win32Command } of testCases) {
      describe(`${editor}`, () => {
        it(`如果 "${command}" 命令在非 Windows 系统上存在则应返回 true`, () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          (execSync as Mock).mockReturnValue(
            Buffer.from(`/usr/bin/${command}`),
          );
          expect(checkHasEditorType(editor)).toBe(true);
          expect(execSync).toHaveBeenCalledWith(`command -v ${command}`, {
            stdio: 'ignore',
          });
        });

        it(`如果 "${command}" 命令在非 Windows 系统上不存在则应返回 false`, () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          (execSync as Mock).mockImplementation(() => {
            throw new Error();
          });
          expect(checkHasEditorType(editor)).toBe(false);
        });

        it(`如果 "${win32Command}" 命令在 Windows 上存在则应返回 true`, () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          (execSync as Mock).mockReturnValue(
            Buffer.from(`C:\\Program Files\\...\\${win32Command}`),
          );
          expect(checkHasEditorType(editor)).toBe(true);
          expect(execSync).toHaveBeenCalledWith(`where.exe ${win32Command}`, {
            stdio: 'ignore',
          });
        });

        it(`如果 "${win32Command}" 命令在 Windows 上不存在则应返回 false`, () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          (execSync as Mock).mockImplementation(() => {
            throw new Error();
          });
          expect(checkHasEditorType(editor)).toBe(false);
        });
      });
    }
  });

  describe('getDiffCommand', () => {
    const guiEditors: Array<{
      editor: EditorType;
      command: string;
      win32Command: string;
    }> = [
      { editor: 'vscode', command: 'code', win32Command: 'code.cmd' },
      { editor: 'vscodium', command: 'codium', win32Command: 'codium.cmd' },
      { editor: 'windsurf', command: 'windsurf', win32Command: 'windsurf' },
      { editor: 'cursor', command: 'cursor', win32Command: 'cursor' },
      { editor: 'zed', command: 'zed', win32Command: 'zed' },
    ];

    for (const { editor, command, win32Command } of guiEditors) {
      it(`应为 ${editor} 在非 Windows 系统上返回正确的命令`, () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command,
          args: ['--wait', '--diff', 'old.txt', 'new.txt'],
        });
      });

      it(`应为 ${editor} 在 Windows 系统上返回正确的命令`, () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command: win32Command,
          args: ['--wait', '--diff', 'old.txt', 'new.txt'],
        });
      });
    }

    const terminalEditors: Array<{
      editor: EditorType;
      command: string;
    }> = [
      { editor: 'vim', command: 'vim' },
      { editor: 'neovim', command: 'nvim' },
    ];

    for (const { editor, command } of terminalEditors) {
      it(`应为 ${editor} 返回正确的命令`, () => {
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command,
          args: [
            '-d',
            '-i',
            'NONE',
            '-c',
            'wincmd h | set readonly | wincmd l',
            '-c',
            'highlight DiffAdd cterm=bold ctermbg=22 guibg=#005f00 | highlight DiffChange cterm=bold ctermbg=24 guibg=#005f87 | highlight DiffText ctermbg=21 guibg=#0000af | highlight DiffDelete ctermbg=52 guibg=#5f0000',
            '-c',
            'set showtabline=2 | set tabline=[Instructions]\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
            '-c',
            'wincmd h | setlocal statusline=OLD\\ FILE',
            '-c',
            'wincmd l | setlocal statusline=%#StatusBold#NEW\\ FILE\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
            '-c',
            'autocmd WinClosed * wqa',
            'old.txt',
            'new.txt',
          ],
        });
      });
    }

    it('应为不支持的编辑器返回 null', () => {
      // @ts-expect-error 测试不支持的编辑器
      const command = getDiffCommand('old.txt', 'new.txt', 'foobar');
      expect(command).toBeNull();
    });
  });

  describe('openDiff', () => {
    const spawnEditors: EditorType[] = [
      'vscode',
      'vscodium',
      'windsurf',
      'cursor',
      'zed',
    ];
    for (const editor of spawnEditors) {
      it(`应为 ${editor} 调用 spawn`, async () => {
        const mockSpawn = {
          on: vi.fn((event, cb) => {
            if (event === 'close') {
              cb(0);
            }
          }),
        };
        (spawn as Mock).mockReturnValue(mockSpawn);
        await openDiff('old.txt', 'new.txt', editor);
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        expect(spawn).toHaveBeenCalledWith(
          diffCommand.command,
          diffCommand.args,
          {
            stdio: 'inherit',
            shell: true,
          },
        );
        expect(mockSpawn.on).toHaveBeenCalledWith(
          'close',
          expect.any(Function),
        );
        expect(mockSpawn.on).toHaveBeenCalledWith(
          'error',
          expect.any(Function),
        );
      });

      it(`如果 ${editor} 的 spawn 调用失败则应拒绝`, async () => {
        const mockError = new Error('spawn error');
        const mockSpawn = {
          on: vi.fn((event, cb) => {
            if (event === 'error') {
              cb(mockError);
            }
          }),
        };
        (spawn as Mock).mockReturnValue(mockSpawn);
        await expect(openDiff('old.txt', 'new.txt', editor)).rejects.toThrow(
          'spawn error',
        );
      });

      it(`如果 ${editor} 以非零代码退出则应拒绝`, async () => {
        const mockSpawn = {
          on: vi.fn((event, cb) => {
            if (event === 'close') {
              cb(1);
            }
          }),
        };
        (spawn as Mock).mockReturnValue(mockSpawn);
        await expect(openDiff('old.txt', 'new.txt', editor)).rejects.toThrow(
          `${editor} exited with code 1`,
        );
      });
    }

    const execSyncEditors: EditorType[] = ['vim', 'neovim'];
    for (const editor of execSyncEditors) {
      it(`在非 Windows 系统上应为 ${editor} 调用 execSync`, async () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        await openDiff('old.txt', 'new.txt', editor);
        expect(execSync).toHaveBeenCalledTimes(1);
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        const expectedCommand = `${
          diffCommand.command
        } ${diffCommand.args.map((arg) => `"${arg}"`).join(' ')}`;
        expect(execSync).toHaveBeenCalledWith(expectedCommand, {
          stdio: 'inherit',
          encoding: 'utf8',
        });
      });

      it(`在 Windows 系统上应为 ${editor} 调用 execSync`, async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        await openDiff('old.txt', 'new.txt', editor);
        expect(execSync).toHaveBeenCalledTimes(1);
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        const expectedCommand = `${diffCommand.command} ${diffCommand.args.join(
          ' ',
        )}`;
        expect(execSync).toHaveBeenCalledWith(expectedCommand, {
          stdio: 'inherit',
          encoding: 'utf8',
        });
      });
    }

    it('如果差分命令不可用则应记录错误', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      // @ts-expect-error 测试不支持的编辑器
      await openDiff('old.txt', 'new.txt', 'foobar');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '没有可用的差分工具。请安装受支持的编辑器。',
      );
    });
  });

  describe('allowEditorTypeInSandbox', () => {
    it('应在沙盒模式下允许 vim', () => {
      process.env.SANDBOX = 'sandbox';
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('在非沙盒模式下应允许 vim', () => {
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('应在沙盒模式下允许 neovim', () => {
      process.env.SANDBOX = 'sandbox';
      expect(allowEditorTypeInSandbox('neovim')).toBe(true);
    });

    it('在非沙盒模式下应允许 neovim', () => {
      expect(allowEditorTypeInSandbox('neovim')).toBe(true);
    });

    const guiEditors: EditorType[] = [
      'vscode',
      'vscodium',
      'windsurf',
      'cursor',
      'zed',
    ];
    for (const editor of guiEditors) {
      it(`在沙盒模式下不应允许 ${editor}`, () => {
        process.env.SANDBOX = 'sandbox';
        expect(allowEditorTypeInSandbox(editor)).toBe(false);
      });

      it(`在非沙盒模式下应允许 ${editor}`, () => {
        expect(allowEditorTypeInSandbox(editor)).toBe(true);
      });
    }
  });

  describe('isEditorAvailable', () => {
    it('对于未定义的编辑器应返回 false', () => {
      expect(isEditorAvailable(undefined)).toBe(false);
    });

    it('对于空字符串编辑器应返回 false', () => {
      expect(isEditorAvailable('')).toBe(false);
    });

    it('对于无效的编辑器类型应返回 false', () => {
      expect(isEditorAvailable('invalid-editor')).toBe(false);
    });

    it('当已安装且不在沙盒模式下时，对于 vscode 应返回 true', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));
      expect(isEditorAvailable('vscode')).toBe(true);
    });

    it('当未安装且不在沙盒模式下时，对于 vscode 应返回 false', () => {
      (execSync as Mock).mockImplementation(() => {
        throw new Error();
      });
      expect(isEditorAvailable('vscode')).toBe(false);
    });

    it('当已安装但在沙盒模式下时，对于 vscode 应返回 false', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('vscode')).toBe(false);
    });

    it('当已安装且在沙盒模式下时，对于 vim 应返回 true', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/vim'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('vim')).toBe(true);
    });

    it('当已安装且在沙盒模式下时，对于 neovim 应返回 true', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/nvim'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('neovim')).toBe(true);
    });
  });
});