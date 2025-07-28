/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStartupWarnings } from './startupWarnings.js';
import * as fs from 'fs/promises';
import { getErrorMessage } from '@iflytek/iflycode-core';

vi.mock('fs/promises');
vi.mock('@iflytek/iflycode-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getErrorMessage: vi.fn(),
  };
});

describe.skip('startupWarnings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('应返回文件中的警告并删除该文件', async () => {
    const mockWarnings = 'Warning 1\nWarning 2';
    vi.spyOn(fs, 'access').mockResolvedValue();
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockWarnings);
    vi.spyOn(fs, 'unlink').mockResolvedValue();

    const warnings = await getStartupWarnings();

    expect(fs.access).toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalled();
    expect(warnings).toEqual(['Warning 1', 'Warning 2']);
  });

  it('如果文件不存在，应返回一个空数组', async () => {
    const error = new Error('File not found');
    (error as Error & { code: string }).code = 'ENOENT';
    vi.spyOn(fs, 'access').mockRejectedValue(error);

    const warnings = await getStartupWarnings();

    expect(warnings).toEqual([]);
  });

  it('如果读取文件失败，应返回一条错误信息', async () => {
    const error = new Error('Permission denied');
    vi.spyOn(fs, 'access').mockRejectedValue(error);
    vi.mocked(getErrorMessage).mockReturnValue('Permission denied');

    const warnings = await getStartupWarnings();

    expect(warnings).toEqual([
      'Error checking/reading warnings file: Permission denied',
    ]);
  });

  it('如果删除文件失败，应返回一条警告', async () => {
    const mockWarnings = 'Warning 1';
    vi.spyOn(fs, 'access').mockResolvedValue();
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockWarnings);
    vi.spyOn(fs, 'unlink').mockRejectedValue(new Error('Permission denied'));

    const warnings = await getStartupWarnings();

    expect(warnings).toEqual([
      'Warning 1',
      'Warning: Could not delete temporary warnings file.',
    ]);
  });
});