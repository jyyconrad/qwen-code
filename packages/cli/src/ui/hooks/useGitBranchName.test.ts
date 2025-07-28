/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  MockedFunction,
} from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useGitBranchName } from './useGitBranchName.js';
import { fs, vol } from 'memfs'; // 用于模拟 fs
import { EventEmitter } from 'node:events';
import { exec as mockExec, type ChildProcess } from 'node:child_process';
import type { FSWatcher } from 'memfs/lib/volume.js';

// 模拟 child_process
vi.mock('child_process');

// 模拟 fs 和 fs/promises
vi.mock('node:fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs;
});

vi.mock('node:fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs.promises;
});

const CWD = '/test/project';
const GIT_HEAD_PATH = `${CWD}/.git/HEAD`;

describe('useGitBranchName', () => {
  beforeEach(() => {
    vol.reset(); // 重置内存文件系统
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/main',
    });
    vi.useFakeTimers(); // 使用假定时器处理异步操作
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  it('应返回分支名称', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers(); // 推进定时器以触发 useEffect 和 exec 回调
      rerender(); // 重新渲染以获取更新后的状态
    });

    expect(result.current).toBe('main');
  });

  it('如果 git 命令失败应返回 undefined', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(new Error('Git error'), '', 'error output');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));
    expect(result.current).toBeUndefined();

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBeUndefined();
  });

  it('如果分支是 HEAD（分离状态）应返回短提交哈希', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (command, _options, callback) => {
        if (command === 'git rev-parse --abbrev-ref HEAD') {
          callback?.(null, 'HEAD\n', '');
        } else if (command === 'git rev-parse --short HEAD') {
          callback?.(null, 'a1b2c3d\n', '');
        }
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));
    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBe('a1b2c3d');
  });

  it('如果分支是 HEAD 且获取提交哈希失败应返回 undefined', async () => {
    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (command, _options, callback) => {
        if (command === 'git rev-parse --abbrev-ref HEAD') {
          callback?.(null, 'HEAD\n', '');
        } else if (command === 'git rev-parse --short HEAD') {
          callback?.(new Error('Git error'), '', 'error output');
        }
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));
    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBeUndefined();
  });

  it('当 .git/HEAD 改变时应更新分支名称', async ({ skip }) => {
    skip(); // TODO: 修复
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });
    expect(result.current).toBe('main');

    // 模拟分支变更
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'develop\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    // 模拟文件变更事件
    // 确保在触发变更前监视器已设置
    await act(async () => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/develop'); // 触发监视器
      vi.runAllTimers(); // 处理监视器和 exec 的定时器
      rerender();
    });

    expect(result.current).toBe('develop');
  });

  it('应静默处理监视器设置错误', async () => {
    // 移除 .git/HEAD 以在 fs.watch 设置时引发错误
    vol.unlinkSync(GIT_HEAD_PATH);

    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { result, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });

    expect(result.current).toBe('main'); // 分支名称仍应被初始获取

    // 尝试触发一个通常会被监视器捕获的变更
    (mockExec as MockedFunction<typeof mockExec>).mockImplementationOnce(
      (_command, _options, callback) => {
        callback?.(null, 'develop\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    // 此写入会触发监视器（如果已设置）
    // 但由于失败，分支名称不应更新
    // 我们需要重新创建文件以便 writeFileSync 不抛出异常
    vol.fromJSON({
      [GIT_HEAD_PATH]: 'ref: refs/heads/develop',
    });

    await act(async () => {
      fs.writeFileSync(GIT_HEAD_PATH, 'ref: refs/heads/develop');
      vi.runAllTimers();
      rerender();
    });

    // 分支名称不应变更，因为监视器设置失败
    expect(result.current).toBe('main');
  });

  it('应在卸载时清理监视器', async ({ skip }) => {
    skip(); // TODO: 修复
    const closeMock = vi.fn();
    const watchMock = vi.spyOn(fs, 'watch').mockReturnValue({
      close: closeMock,
    } as unknown as FSWatcher);

    (mockExec as MockedFunction<typeof mockExec>).mockImplementation(
      (_command, _options, callback) => {
        callback?.(null, 'main\n', '');
        return new EventEmitter() as ChildProcess;
      },
    );

    const { unmount, rerender } = renderHook(() => useGitBranchName(CWD));

    await act(async () => {
      vi.runAllTimers();
      rerender();
    });

    unmount();
    expect(watchMock).toHaveBeenCalledWith(GIT_HEAD_PATH, expect.any(Function));
    expect(closeMock).toHaveBeenCalled();
  });
});