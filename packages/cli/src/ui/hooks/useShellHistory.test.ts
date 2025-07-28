/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useShellHistory } from './useShellHistory.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

vi.mock('fs/promises');
vi.mock('os');
vi.mock('crypto');

const MOCKED_PROJECT_ROOT = '/test/project';
const MOCKED_HOME_DIR = '/test/home';
const MOCKED_PROJECT_HASH = 'mocked_hash';

const MOCKED_HISTORY_DIR = path.join(
  MOCKED_HOME_DIR,
  '.iflycode',
  'tmp',
  MOCKED_PROJECT_HASH,
);
const MOCKED_HISTORY_FILE = path.join(MOCKED_HISTORY_DIR, 'shell_history');

describe('useShellHistory', () => {
  const mockedFs = vi.mocked(fs);
  const mockedOs = vi.mocked(os);
  const mockedCrypto = vi.mocked(crypto);

  beforeEach(() => {
    vi.resetAllMocks();

    mockedFs.readFile.mockResolvedValue('');
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedOs.homedir.mockReturnValue(MOCKED_HOME_DIR);

    const hashMock = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(MOCKED_PROJECT_HASH),
    };
    mockedCrypto.createHash.mockReturnValue(hashMock as never);
  });

  it('应初始化并从正确的路径读取历史文件', async () => {
    mockedFs.readFile.mockResolvedValue('cmd1\ncmd2');
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    await waitFor(() => {
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        MOCKED_HISTORY_FILE,
        'utf-8',
      );
    });

    let command: string | null = null;
    act(() => {
      command = result.current.getPreviousCommand();
    });

    // 历史记录按最新优先加载: ['cmd2', 'cmd1']
    expect(command).toBe('cmd2');
  });

  it('应优雅地处理不存在的历史文件', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockedFs.readFile.mockRejectedValue(error);

    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    await waitFor(() => {
      expect(mockedFs.readFile).toHaveBeenCalled();
    });

    let command: string | null = null;
    act(() => {
      command = result.current.getPreviousCommand();
    });

    expect(command).toBe(null);
  });

  it('应添加命令并写入历史文件', async () => {
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('new_command');
    });

    await waitFor(() => {
      expect(mockedFs.mkdir).toHaveBeenCalledWith(MOCKED_HISTORY_DIR, {
        recursive: true,
      });
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        MOCKED_HISTORY_FILE,
        'new_command', // 按最旧优先写入文件。
      );
    });

    let command: string | null = null;
    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('new_command');
  });

  it('应正确地使用上一个/下一个命令导航历史', async () => {
    mockedFs.readFile.mockResolvedValue('cmd1\ncmd2\ncmd3');
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    // 等待历史加载: ['cmd3', 'cmd2', 'cmd1']
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    let command: string | null = null;

    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd3');

    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd2');

    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd1');

    // 应停留在最旧的命令
    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd1');

    act(() => {
      command = result.current.getNextCommand();
    });
    expect(command).toBe('cmd2');

    act(() => {
      command = result.current.getNextCommand();
    });
    expect(command).toBe('cmd3');

    // 应返回到"新命令"行（表示为空字符串）
    act(() => {
      command = result.current.getNextCommand();
    });
    expect(command).toBe('');
  });

  it('不应将空或仅包含空白字符的命令添加到历史中', async () => {
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('   ');
    });

    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  it('应将历史记录截断为 MAX_HISTORY_LENGTH (100)', async () => {
    const oldCommands = Array.from({ length: 120 }, (_, i) => `old_cmd_${i}`);
    mockedFs.readFile.mockResolvedValue(oldCommands.join('\n'));

    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('new_cmd');
    });

    // 等待异步写入发生然后检查参数。
    await waitFor(() => expect(mockedFs.writeFile).toHaveBeenCalled());

    // 钩子按最新优先存储历史。
    // 初始状态: ['old_cmd_119', ..., 'old_cmd_0']
    // 添加 'new_cmd' 后: ['new_cmd', 'old_cmd_119', ..., 'old_cmd_21'] (100 项)
    // 写入文件（反转）: ['old_cmd_21', ..., 'old_cmd_119', 'new_cmd']
    const writtenContent = mockedFs.writeFile.mock.calls[0][1] as string;
    const writtenLines = writtenContent.split('\n');

    expect(writtenLines.length).toBe(100);
    expect(writtenLines[0]).toBe('old_cmd_21'); // 新的最旧命令
    expect(writtenLines[99]).toBe('new_cmd'); // 最新命令
  });

  it('应在重新添加时将现有命令移动到顶部', async () => {
    mockedFs.readFile.mockResolvedValue('cmd1\ncmd2\ncmd3');
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    // 初始状态: ['cmd3', 'cmd2', 'cmd1']
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('cmd1');
    });

    // 重新添加 'cmd1' 后: ['cmd1', 'cmd3', 'cmd2']
    // 写入文件（反转）: ['cmd2', 'cmd3', 'cmd1']
    await waitFor(() => expect(mockedFs.writeFile).toHaveBeenCalled());

    const writtenContent = mockedFs.writeFile.mock.calls[0][1] as string;
    const writtenLines = writtenContent.split('\n');

    expect(writtenLines).toEqual(['cmd2', 'cmd3', 'cmd1']);
  });
});