/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { checkForUpdates } from './updateCheck.js';

const getPackageJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/package.js', () => ({
  getPackageJson,
}));

const updateNotifier = vi.hoisted(() => vi.fn());
vi.mock('update-notifier', () => ({
  default: updateNotifier,
}));

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('如果 package.json 丢失则应返回 null', async () => {
    getPackageJson.mockResolvedValue(null);
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('如果没有更新则应返回 null', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({ update: null });
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('如果有新版本可用则应返回一条消息', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({
      update: { current: '1.0.0', latest: '1.1.0' },
    });
    const result = await checkForUpdates();
    expect(result).toContain('1.0.0 → 1.1.0');
  });

  it('如果最新版本与当前版本相同则应返回 null', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({
      update: { current: '1.0.0', latest: '1.0.0' },
    });
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('如果最新版本比当前版本旧则应返回 null', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.1.0',
    });
    updateNotifier.mockReturnValue({
      update: { current: '1.1.0', latest: '1.0.0' },
    });
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('应优雅地处理错误', async () => {
    getPackageJson.mockRejectedValue(new Error('test error'));
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });
});