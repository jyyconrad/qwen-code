/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import * as os from 'os';
import semver from 'semver';

type WarningCheck = {
  id: string;
  check: (workspaceRoot: string) => Promise<string | null>;
};

// 单个警告检查
const homeDirectoryCheck: WarningCheck = {
  id: 'home-directory',
  check: async (workspaceRoot: string) => {
    try {
      const [workspaceRealPath, homeRealPath] = await Promise.all([
        fs.realpath(workspaceRoot),
        fs.realpath(os.homedir()),
      ]);

      if (workspaceRealPath === homeRealPath) {
        return '您正在主目录中运行 iFlyCode。建议在特定项目的目录中运行。';
      }
      return null;
    } catch (_err: unknown) {
      return '由于文件系统错误，无法验证当前目录。';
    }
  },
};

const nodeVersionCheck: WarningCheck = {
  id: 'node-version',
  check: async (_workspaceRoot: string) => {
    const minMajor = 20;
    const major = semver.major(process.versions.node);
    if (major < minMajor) {
      return `您正在使用 Node.js v${process.versions.node}。Gemini CLI 需要 Node.js ${minMajor} 或更高版本以获得最佳结果。`;
    }
    return null;
  },
};

// 所有警告检查
const WARNING_CHECKS: readonly WarningCheck[] = [
  homeDirectoryCheck,
  nodeVersionCheck,
];

export async function getUserStartupWarnings(
  workspaceRoot: string,
): Promise<string[]> {
  const results = await Promise.all(
    WARNING_CHECKS.map((check) => check.check(workspaceRoot)),
  );
  return results.filter((msg) => msg !== null);
}