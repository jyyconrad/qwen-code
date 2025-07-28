/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// 根据 Apache 许可证 2.0 版（“许可证”）获得许可；
// 除非符合许可证要求，否则您不得使用此文件。
// 您可以在以下位置获取许可证副本：
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// 除非适用法律要求或书面同意，否则根据许可证分发的软件
// 是基于“按原样”分发的，不附带任何明示或暗示的担保。
// 请参阅许可证以了解特定语言的管理权限和限制。

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const generatedDir = join(root, 'packages/cli/src/generated');
const gitCommitFile = join(generatedDir, 'git-commit.ts');
let gitCommitInfo = 'N/A';

if (!existsSync(generatedDir)) {
  mkdirSync(generatedDir, { recursive: true });
}

try {
  const gitHash = execSync('git rev-parse --short HEAD', {
    encoding: 'utf-8',
  }).trim();
  if (gitHash) {
    gitCommitInfo = gitHash;
    const gitStatus = execSync('git status --porcelain', {
      encoding: 'utf-8',
    }).trim();
    if (gitStatus) {
      gitCommitInfo = `${gitHash} (local modifications)`;
    }
  }
} catch {
  // ignore
}

const fileContent = `/**
 * @license
 * Copyright ${new Date().getFullYear()} Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 此文件由构建脚本 (scripts/build.js) 自动生成
// 请勿手动编辑此文件。
export const GIT_COMMIT_INFO = '${gitCommitInfo}';
`;

writeFileSync(gitCommitFile, fileContent);