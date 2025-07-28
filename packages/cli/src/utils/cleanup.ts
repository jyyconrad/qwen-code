/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getProjectTempDir } from '@iflytek/iflycode-core';

const cleanupFunctions: Array<() => void> = [];

export function registerCleanup(fn: () => void) {
  cleanupFunctions.push(fn);
}

export function runExitCleanup() {
  for (const fn of cleanupFunctions) {
    try {
      fn();
    } catch (_) {
      // 清理过程中忽略错误。
    }
  }
  cleanupFunctions.length = 0; // 清空数组
}

export async function cleanupCheckpoints() {
  const tempDir = getProjectTempDir(process.cwd());
  const checkpointsDir = join(tempDir, 'checkpoints');
  try {
    await fs.rm(checkpointsDir, { recursive: true, force: true });
  } catch {
    // 如果目录不存在或删除失败则忽略错误。
  }
}