/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as actualFsPromises from 'node:fs/promises';

const readFileMock = vi.fn();

// 导出一个控制对象，以便测试可以访问和操作模拟函数
export const mockControl = {
  mockReadFile: readFileMock,
};

// 从实际的 fs/promises 模块导出所有其他函数
export const {
  access,
  appendFile,
  chmod,
  chown,
  copyFile,
  cp,
  lchmod,
  lchown,
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readdir,
  readlink,
  realpath,
  rename,
  rmdir,
  rm,
  stat,
  symlink,
  truncate,
  unlink,
  utimes,
  watch,
  writeFile,
} = actualFsPromises;

// 用我们的模拟函数覆盖 readFile
export const readFile = readFileMock;