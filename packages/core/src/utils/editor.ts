/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawn } from 'child_process';

export type EditorType =
  | 'vscode'
  | 'vscodium'
  | 'windsurf'
  | 'cursor'
  | 'vim'
  | 'neovim'
  | 'zed';

function isValidEditorType(editor: string): editor is EditorType {
  return [
    'vscode',
    'vscodium',
    'windsurf',
    'cursor',
    'vim',
    'neovim',
    'zed',
  ].includes(editor);
}

interface DiffCommand {
  command: string;
  args: string[];
}

function commandExists(cmd: string): boolean {
  try {
    execSync(
      process.platform === 'win32' ? `where.exe ${cmd}` : `command -v ${cmd}`,
      { stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

const editorCommands: Record<EditorType, { win32: string; default: string }> = {
  vscode: { win32: 'code.cmd', default: 'code' },
  vscodium: { win32: 'codium.cmd', default: 'codium' },
  windsurf: { win32: 'windsurf', default: 'windsurf' },
  cursor: { win32: 'cursor', default: 'cursor' },
  vim: { win32: 'vim', default: 'vim' },
  neovim: { win32: 'nvim', default: 'nvim' },
  zed: { win32: 'zed', default: 'zed' },
};

export function checkHasEditorType(editor: EditorType): boolean {
  const commandConfig = editorCommands[editor];
  const command =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  return commandExists(command);
}

export function allowEditorTypeInSandbox(editor: EditorType): boolean {
  const notUsingSandbox = !process.env.SANDBOX;
  if (['vscode', 'vscodium', 'windsurf', 'cursor', 'zed'].includes(editor)) {
    return notUsingSandbox;
  }
  return true;
}

/**
 * 检查编辑器是否有效且可以使用。
 * 如果首选编辑器未设置/无效/不可用/在沙箱中不允许，则返回 false。
 */
export function isEditorAvailable(editor: string | undefined): boolean {
  if (editor && isValidEditorType(editor)) {
    return checkHasEditorType(editor) && allowEditorTypeInSandbox(editor);
  }
  return false;
}

/**
 * 获取特定编辑器的差异命令。
 */
export function getDiffCommand(
  oldPath: string,
  newPath: string,
  editor: EditorType,
): DiffCommand | null {
  if (!isValidEditorType(editor)) {
    return null;
  }
  const commandConfig = editorCommands[editor];
  const command =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  switch (editor) {
    case 'vscode':
    case 'vscodium':
    case 'windsurf':
    case 'cursor':
    case 'zed':
      return { command, args: ['--wait', '--diff', oldPath, newPath] };
    case 'vim':
    case 'neovim':
      return {
        command,
        args: [
          '-d',
          // 跳过 viminfo 文件以避免 E138 错误
          '-i',
          'NONE',
          // 使左窗口只读，右窗口可编辑
          '-c',
          'wincmd h | set readonly | wincmd l',
          // 为差异设置颜色
          '-c',
          'highlight DiffAdd cterm=bold ctermbg=22 guibg=#005f00 | highlight DiffChange cterm=bold ctermbg=24 guibg=#005f87 | highlight DiffText ctermbg=21 guibg=#0000af | highlight DiffDelete ctermbg=52 guibg=#5f0000',
          // 显示有用的信息
          '-c',
          'set showtabline=2 | set tabline=[Instructions]\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
          '-c',
          'wincmd h | setlocal statusline=OLD\\ FILE',
          '-c',
          'wincmd l | setlocal statusline=%#StatusBold#NEW\\ FILE\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
          // 关闭一个窗口时自动关闭所有窗口
          '-c',
          'autocmd WinClosed * wqa',
          oldPath,
          newPath,
        ],
      };
    default:
      return null;
  }
}

/**
 * 打开差异工具以比较两个文件。
 * 基于终端的编辑器默认会阻塞父进程直到编辑器退出。
 * 基于 GUI 的编辑器需要 "--wait" 等参数来阻塞父进程。
 */
export async function openDiff(
  oldPath: string,
  newPath: string,
  editor: EditorType,
): Promise<void> {
  const diffCommand = getDiffCommand(oldPath, newPath, editor);
  if (!diffCommand) {
    console.error('没有可用的差异工具。请安装受支持的编辑器。');
    return;
  }

  try {
    switch (editor) {
      case 'vscode':
      case 'vscodium':
      case 'windsurf':
      case 'cursor':
      case 'zed':
        // 对于基于 GUI 的编辑器使用 spawn 以避免阻塞整个进程
        return new Promise((resolve, reject) => {
          const childProcess = spawn(diffCommand.command, diffCommand.args, {
            stdio: 'inherit',
            shell: true,
          });

          childProcess.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`${editor} 退出代码 ${code}`));
            }
          });

          childProcess.on('error', (error) => {
            reject(error);
          });
        });

      case 'vim':
      case 'neovim': {
        // 对于基于终端的编辑器使用 execSync
        const command =
          process.platform === 'win32'
            ? `${diffCommand.command} ${diffCommand.args.join(' ')}`
            : `${diffCommand.command} ${diffCommand.args.map((arg) => `"${arg}"`).join(' ')}`;
        execSync(command, {
          stdio: 'inherit',
          encoding: 'utf8',
        });
        break;
      }

      default:
        throw new Error(`不支持的编辑器: ${editor}`);
    }
  } catch (error) {
    console.error(error);
  }
}