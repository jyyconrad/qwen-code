/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as os from 'os';
import fs from 'fs/promises';
import semver from 'semver';

vi.mock('os', () => ({
  default: { homedir: vi.fn() },
  homedir: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: { realpath: vi.fn() },
}));

vi.mock('semver', () => ({
  default: {
    major: vi.fn(),
  },
  major: vi.fn(),
}));

describe('getUserStartupWarnings', () => {
  const homeDir = '/home/user';

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.mocked(fs.realpath).mockImplementation(async (path) => path.toString());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('home directory check', () => {
    it('当在主目录中运行时应返回警告', async () => {
      vi.mocked(fs.realpath)
        .mockResolvedValueOnce(homeDir)
        .mockResolvedValueOnce(homeDir);

      const warnings = await getUserStartupWarnings(homeDir);

      expect(warnings).toContainEqual(
        expect.stringContaining('home directory'),
      );
    });

    it('当在项目目录中运行时不返回警告', async () => {
      vi.mocked(fs.realpath)
        .mockResolvedValueOnce('/some/project/path')
        .mockResolvedValueOnce(homeDir);

      const warnings = await getUserStartupWarnings('/some/project/path');
      expect(warnings).not.toContainEqual(
        expect.stringContaining('home directory'),
      );
    });

    it('处理检查目录时的错误', async () => {
      vi.mocked(fs.realpath)
        .mockRejectedValueOnce(new Error('FS error'))
        .mockResolvedValueOnce(homeDir);

      const warnings = await getUserStartupWarnings('/error/path');
      expect(warnings).toContainEqual(
        expect.stringContaining('Could not verify'),
      );
    });
  });

  function setNodeVersionMajor(majorVersion: number) {
    vi.mocked(semver.major).mockReturnValue(majorVersion);
  }

  describe('node version check', () => {
    afterEach(() => {
      setNodeVersionMajor(20);
    });

    it('如果 Node.js 版本低于 minMajor 应返回警告', async () => {
      setNodeVersionMajor(18);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Node.js');
      expect(warnings[0]).toContain('requires Node.js 20 or higher');
    });

    it('如果 Node.js 版本等于 minMajor 不返回警告', async () => {
      setNodeVersionMajor(20);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toEqual([]);
    });

    it('如果 Node.js 版本大于 minMajor 不返回警告', async () => {
      setNodeVersionMajor(22);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toEqual([]);
    });

    it('如果未提供则使用默认 minMajor=20', async () => {
      setNodeVersionMajor(18);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Node.js');
      expect(warnings[0]).toContain('requires Node.js 20 or higher');
    });
  });

  // // 添加新检查的示例：
  // describe('node version check', () => {
  //   // node 版本检查的测试将在这里进行
  //   // 这展示了添加新测试部分是多么容易
  // });
});