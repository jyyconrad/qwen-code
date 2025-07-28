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

import { rmSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// 删除 npm 安装/构建产物
rmSync(join(root, 'node_modules'), { recursive: true, force: true });
rmSync(join(root, 'bundle'), { recursive: true, force: true });
rmSync(join(root, 'packages/cli/src/generated/'), {
  recursive: true,
  force: true,
});
const RMRF_OPTIONS = { recursive: true, force: true };
rmSync(join(root, 'bundle'), RMRF_OPTIONS);
// 动态清理所有工作区中的 dist 目录
const rootPackageJson = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf-8'),
);
for (const workspace of rootPackageJson.workspaces) {
  const packages = globSync(join(workspace, 'package.json'), { cwd: root });
  for (const pkgPath of packages) {
    const pkgDir = dirname(join(root, pkgPath));
    rmSync(join(pkgDir, 'dist'), RMRF_OPTIONS);
  }
}