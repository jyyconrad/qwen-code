/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getReleaseVersion } from '../get-release-version';
import { execSync } from 'child_process';
import * as fs from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    default: {
      ...mod.default,
      readFileSync: vi.fn(),
    },
  };
});

describe('getReleaseVersion', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('当 IS_NIGHTLY 为 true 时应计算夜间版本', () => {
    process.env.IS_NIGHTLY = 'true';
    const knownDate = new Date('2025-07-20T10:00:00.000Z');
    vi.setSystemTime(knownDate);
    vi.mocked(fs.default.readFileSync).mockReturnValue(
      JSON.stringify({ version: '0.1.0' }),
    );
    vi.mocked(execSync).mockReturnValue('abcdef');
    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v0.1.0-nightly.250720.abcdef');
    expect(releaseVersion).toBe('0.1.0-nightly.250720.abcdef');
    expect(npmTag).toBe('nightly');
  });

  it('应使用手动指定的版本（当提供时）', () => {
    process.env.MANUAL_VERSION = '1.2.3';
    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.2.3');
    expect(releaseVersion).toBe('1.2.3');
    expect(npmTag).toBe('latest');
  });

  it('如果缺少 v 前缀，应为手动版本添加 v 前缀', () => {
    process.env.MANUAL_VERSION = '1.2.3';
    const { releaseTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.2.3');
  });

  it('应正确处理预发布版本', () => {
    process.env.MANUAL_VERSION = 'v1.2.3-beta.1';
    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.2.3-beta.1');
    expect(releaseVersion).toBe('1.2.3-beta.1');
    expect(npmTag).toBe('beta');
  });

  it('对于无效的版本格式应抛出错误', () => {
    process.env.MANUAL_VERSION = '1.2';
    expect(() => getReleaseVersion()).toThrow(
      'Error: Version must be in the format vX.Y.Z or vX.Y.Z-prerelease',
    );
  });

  it('对于非夜间发布的版本，如果没有提供版本则应抛出错误', () => {
    expect(() => getReleaseVersion()).toThrow(
      'Error: No version specified and this is not a nightly release.',
    );
  });

  it('对于包含构建元数据的版本应抛出错误', () => {
    process.env.MANUAL_VERSION = 'v1.2.3+build456';
    expect(() => getReleaseVersion()).toThrow(
      'Error: Versions with build metadata (+) are not supported for releases.',
    );
  });
});

describe('get-release-version script', () => {
  it('直接执行时应将版本 JSON 打印到 stdout', () => {
    const expectedJson = {
      releaseTag: 'v0.1.0-nightly.20250705',
      releaseVersion: '0.1.0-nightly.20250705',
      npmTag: 'nightly',
    };
    execSync.mockReturnValue(JSON.stringify(expectedJson));

    const result = execSync('node scripts/get-release-version.js').toString();
    expect(JSON.parse(result)).toEqual(expectedJson);
  });
});