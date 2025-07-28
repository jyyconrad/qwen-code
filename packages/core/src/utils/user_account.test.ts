/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import {
  cacheGoogleAccount,
  getCachedGoogleAccount,
  clearCachedGoogleAccount,
  getLifetimeGoogleAccounts,
} from './user_account.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

describe('user_account', () => {
  let tempHomeDir: string;
  const accountsFile = () =>
    path.join(tempHomeDir, '.iflycode', 'google_accounts.json');
  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    (os.homedir as Mock).mockReturnValue(tempHomeDir);
  });
  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('cacheGoogleAccount', () => {
    it('应创建目录并写入初始账户文件', async () => {
      await cacheGoogleAccount('test1@google.com');

      // 验证 Google 账户 ID 已缓存
      expect(fs.existsSync(accountsFile())).toBe(true);
      expect(fs.readFileSync(accountsFile(), 'utf-8')).toBe(
        JSON.stringify({ active: 'test1@google.com', old: [] }, null, 2),
      );
    });

    it('应更新活跃账户并将之前的移到旧列表中', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify(
          { active: 'test2@google.com', old: ['test1@google.com'] },
          null,
          2,
        ),
      );

      await cacheGoogleAccount('test3@google.com');

      expect(fs.readFileSync(accountsFile(), 'utf-8')).toBe(
        JSON.stringify(
          {
            active: 'test3@google.com',
            old: ['test1@google.com', 'test2@google.com'],
          },
          null,
          2,
        ),
      );
    });

    it('不应将重复项添加到旧列表中', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify(
          { active: 'test1@google.com', old: ['test2@google.com'] },
          null,
          2,
        ),
      );
      await cacheGoogleAccount('test2@google.com');
      await cacheGoogleAccount('test1@google.com');

      expect(fs.readFileSync(accountsFile(), 'utf-8')).toBe(
        JSON.stringify(
          { active: 'test1@google.com', old: ['test2@google.com'] },
          null,
          2,
        ),
      );
    });

    it('应通过重新开始处理损坏的 JSON', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), 'not valid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      await cacheGoogleAccount('test1@google.com');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'))).toEqual({
        active: 'test1@google.com',
        old: [],
      });
    });
  });

  describe('getCachedGoogleAccount', () => {
    it('如果文件存在且有效，应返回活跃账户', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: 'active@google.com', old: [] }, null, 2),
      );
      const account = getCachedGoogleAccount();
      expect(account).toBe('active@google.com');
    });

    it('如果文件不存在，应返回 null', () => {
      const account = getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('如果文件为空，应返回 null', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      const account = getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('如果文件损坏，应返回 null 并记录日志', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '{ "active": "test@google.com"'); // 无效的 JSON
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const account = getCachedGoogleAccount();

      expect(account).toBeNull();
      expect(consoleDebugSpy).toHaveBeenCalled();
    });
  });

  describe('clearCachedGoogleAccount', () => {
    it('应将活跃账户设为 null 并将其移至旧列表', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify(
          { active: 'active@google.com', old: ['old1@google.com'] },
          null,
          2,
        ),
      );

      await clearCachedGoogleAccount();

      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['old1@google.com', 'active@google.com']);
    });

    it('应优雅地处理空文件', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      await clearCachedGoogleAccount();
      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual([]);
    });
  });

  describe('getLifetimeGoogleAccounts', () => {
    it('如果文件不存在，应返回 0', () => {
      expect(getLifetimeGoogleAccounts()).toBe(0);
    });

    it('如果文件为空，应返回 0', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      expect(getLifetimeGoogleAccounts()).toBe(0);
    });

    it('如果文件损坏，应返回 0', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), 'invalid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      expect(getLifetimeGoogleAccounts()).toBe(0);
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('如果只有活跃账户，应返回 1', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: 'test1@google.com', old: [] }),
      );
      expect(getLifetimeGoogleAccounts()).toBe(1);
    });

    it('当活跃账户为 null 时，应正确计算旧账户数量', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({
          active: null,
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(getLifetimeGoogleAccounts()).toBe(2);
    });

    it('应正确计算活跃账户和旧账户的总数', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({
          active: 'test3@google.com',
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(getLifetimeGoogleAccounts()).toBe(3);
    });
  });
});