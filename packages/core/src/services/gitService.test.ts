/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService } from './gitService.js';
import * as path from 'path';
import type * as FsPromisesModule from 'fs/promises';
import type { ChildProcess } from 'node:child_process';

const hoistedMockExec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  exec: hoistedMockExec,
}));

const hoistedMockMkdir = vi.hoisted(() => vi.fn());
const hoistedMockReadFile = vi.hoisted(() => vi.fn());
const hoistedMockWriteFile = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof FsPromisesModule;
  return {
    ...actual,
    mkdir: hoistedMockMkdir,
    readFile: hoistedMockReadFile,
    writeFile: hoistedMockWriteFile,
  };
});

const hoistedMockEnv = vi.hoisted(() => vi.fn());
const hoistedMockSimpleGit = vi.hoisted(() => vi.fn());
const hoistedMockCheckIsRepo = vi.hoisted(() => vi.fn());
const hoistedMockInit = vi.hoisted(() => vi.fn());
const hoistedMockRaw = vi.hoisted(() => vi.fn());
const hoistedMockAdd = vi.hoisted(() => vi.fn());
const hoistedMockCommit = vi.hoisted(() => vi.fn());
vi.mock('simple-git', () => ({
  simpleGit: hoistedMockSimpleGit.mockImplementation(() => ({
    checkIsRepo: hoistedMockCheckIsRepo,
    init: hoistedMockInit,
    raw: hoistedMockRaw,
    add: hoistedMockAdd,
    commit: hoistedMockCommit,
    env: hoistedMockEnv,
  })),
  CheckRepoActions: { IS_REPO_ROOT: 'is-repo-root' },
}));

const hoistedIsGitRepositoryMock = vi.hoisted(() => vi.fn());
vi.mock('../utils/gitUtils.js', () => ({
  isGitRepository: hoistedIsGitRepositoryMock,
}));

const hoistedMockIsNodeError = vi.hoisted(() => vi.fn());
vi.mock('../utils/errors.js', () => ({
  isNodeError: hoistedMockIsNodeError,
}));

const hoistedMockHomedir = vi.hoisted(() => vi.fn());
vi.mock('os', () => ({
  homedir: hoistedMockHomedir,
}));

const hoistedMockCreateHash = vi.hoisted(() => {
  const mockUpdate = vi.fn().mockReturnThis();
  const mockDigest = vi.fn();
  return {
    createHash: vi.fn(() => ({
      update: mockUpdate,
      digest: mockDigest,
    })),
    mockUpdate,
    mockDigest,
  };
});
vi.mock('crypto', () => ({
  createHash: hoistedMockCreateHash.createHash,
}));

describe('GitService', () => {
  const mockProjectRoot = '/test/project';
  const mockHomedir = '/mock/home';
  const mockHash = 'mock-hash';

  beforeEach(() => {
    vi.clearAllMocks();
    hoistedIsGitRepositoryMock.mockReturnValue(true);
    hoistedMockExec.mockImplementation((command, callback) => {
      if (command === 'git --version') {
        callback(null, 'git version 2.0.0');
      } else {
        callback(new Error('命令未被模拟'));
      }
      return {};
    });
    hoistedMockMkdir.mockResolvedValue(undefined);
    hoistedMockReadFile.mockResolvedValue('');
    hoistedMockWriteFile.mockResolvedValue(undefined);
    hoistedMockIsNodeError.mockImplementation((e) => e instanceof Error);
    hoistedMockHomedir.mockReturnValue(mockHomedir);
    hoistedMockCreateHash.mockUpdate.mockReturnThis();
    hoistedMockCreateHash.mockDigest.mockReturnValue(mockHash);

    hoistedMockEnv.mockImplementation(() => ({
      checkIsRepo: hoistedMockCheckIsRepo,
      init: hoistedMockInit,
      raw: hoistedMockRaw,
      add: hoistedMockAdd,
      commit: hoistedMockCommit,
    }));
    hoistedMockSimpleGit.mockImplementation(() => ({
      checkIsRepo: hoistedMockCheckIsRepo,
      init: hoistedMockInit,
      raw: hoistedMockRaw,
      add: hoistedMockAdd,
      commit: hoistedMockCommit,
      env: hoistedMockEnv,
    }));
    hoistedMockCheckIsRepo.mockResolvedValue(false);
    hoistedMockInit.mockResolvedValue(undefined);
    hoistedMockRaw.mockResolvedValue('');
    hoistedMockAdd.mockResolvedValue(undefined);
    hoistedMockCommit.mockResolvedValue({
      commit: 'initial',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('如果 projectRoot 是 Git 仓库，应成功创建实例', () => {
      expect(() => new GitService(mockProjectRoot)).not.toThrow();
    });
  });

  describe('verifyGitAvailability', () => {
    it('如果 git --version 命令成功，应解析为 true', async () => {
      const service = new GitService(mockProjectRoot);
      await expect(service.verifyGitAvailability()).resolves.toBe(true);
    });

    it('如果 git --version 命令失败，应解析为 false', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('未找到 git'));
        return {} as ChildProcess;
      });
      const service = new GitService(mockProjectRoot);
      await expect(service.verifyGitAvailability()).resolves.toBe(false);
    });
  });

  describe('initialize', () => {
    it('如果 Git 不可用，应抛出错误', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('未找到 git'));
        return {} as ChildProcess;
      });
      const service = new GitService(mockProjectRoot);
      await expect(service.initialize()).rejects.toThrow(
        '检查点已启用，但未安装 Git。请安装 Git 或禁用检查点以继续。',
      );
    });

    it('如果 Git 可用，应调用 setupShadowGitRepository', async () => {
      const service = new GitService(mockProjectRoot);
      const setupSpy = vi
        .spyOn(service, 'setupShadowGitRepository')
        .mockResolvedValue(undefined);

      await service.initialize();
      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('setupShadowGitRepository', () => {
    const repoDir = path.join(mockHomedir, '.iflycode', 'history', mockHash);
    const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');
    const visibleGitIgnorePath = path.join(mockProjectRoot, '.gitignore');
    const gitConfigPath = path.join(repoDir, '.gitconfig');

    it('应创建包含正确内容的 .gitconfig 文件', async () => {
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      const expectedConfigContent =
        '[user]\n  name = Gemini CLI\n  email = gemini-cli@google.com\n[commit]\n  gpgsign = false\n';
      expect(hoistedMockWriteFile).toHaveBeenCalledWith(
        gitConfigPath,
        expectedConfigContent,
      );
    });

    it('应创建 history 和 repository 目录', async () => {
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockMkdir).toHaveBeenCalledWith(repoDir, {
        recursive: true,
      });
    });

    it('如果尚未初始化，应在 historyDir 中初始化 git 仓库', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(false);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockSimpleGit).toHaveBeenCalledWith(repoDir);
      expect(hoistedMockInit).toHaveBeenCalled();
    });

    it('如果已初始化，则不应再次初始化 git 仓库', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(true);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockInit).not.toHaveBeenCalled();
    });

    it('如果存在，应从 projectRoot 复制 .gitignore', async () => {
      const gitignoreContent = `node_modules/\n.env`;
      hoistedMockReadFile.mockImplementation(async (filePath) => {
        if (filePath === visibleGitIgnorePath) {
          return gitignoreContent;
        }
        return '';
      });
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockReadFile).toHaveBeenCalledWith(
        visibleGitIgnorePath,
        'utf-8',
      );
      expect(hoistedMockWriteFile).toHaveBeenCalledWith(
        hiddenGitIgnorePath,
        gitignoreContent,
      );
    });

    it('如果读取 projectRoot .gitignore 时发生其他错误，应抛出错误', async () => {
      const readError = new Error('读取权限被拒绝');
      hoistedMockReadFile.mockImplementation(async (filePath) => {
        if (filePath === visibleGitIgnorePath) {
          throw readError;
        }
        return '';
      });
      hoistedMockIsNodeError.mockImplementation(
        (e: unknown): e is NodeJS.ErrnoException => e instanceof Error,
      );

      const service = new GitService(mockProjectRoot);
      await expect(service.setupShadowGitRepository()).rejects.toThrow(
        '读取权限被拒绝',
      );
    });

    it('如果历史仓库中没有提交记录，应进行初始提交', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(false);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockCommit).toHaveBeenCalledWith('Initial commit', {
        '--allow-empty': null,
      });
    });

    it('如果已存在提交记录，则不应进行初始提交', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(true);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockCommit).not.toHaveBeenCalled();
    });
  });
});