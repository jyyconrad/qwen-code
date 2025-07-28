/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// 一个处理版本控制的脚本，确保所有相关更改都在单个原子提交中完成。

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// 1. 从命令行参数获取版本类型。
const versionType = process.argv[2];
if (!versionType) {
  console.error('错误：未指定版本类型。');
  console.error('用法：npm run version <patch|minor|major|prerelease>');
  process.exit(1);
}

// 2. 更新根目录和所有工作区 package.json 文件中的版本。
run(`npm version ${versionType} --no-git-tag-version --allow-same-version`);
run(
  `npm version ${versionType} --workspaces --no-git-tag-version --allow-same-version`,
);

// 3. 从根目录 package.json 获取新版本号
const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
const newVersion = readJson(rootPackageJsonPath).version;

// 4. 更新根目录 package.json 中的 sandboxImageUri
const rootPackageJson = readJson(rootPackageJsonPath);
if (rootPackageJson.config?.sandboxImageUri) {
  rootPackageJson.config.sandboxImageUri =
    rootPackageJson.config.sandboxImageUri.replace(/:.*$/, `:${newVersion}`);
  console.log(`已更新根目录中的 sandboxImageUri 以使用版本 ${newVersion}`);
  writeJson(rootPackageJsonPath, rootPackageJson);
}

// 5. 更新 cli package.json 中的 sandboxImageUri
const cliPackageJsonPath = resolve(process.cwd(), 'packages/cli/package.json');
const cliPackageJson = readJson(cliPackageJsonPath);
if (cliPackageJson.config?.sandboxImageUri) {
  cliPackageJson.config.sandboxImageUri =
    cliPackageJson.config.sandboxImageUri.replace(/:.*$/, `:${newVersion}`);
  console.log(
    `已更新 cli 包中的 sandboxImageUri 以使用版本 ${newVersion}`,
  );
  writeJson(cliPackageJsonPath, cliPackageJson);
}

// 6. 运行 `npm install` 以更新 package-lock.json。
run('npm install');

console.log(`成功将版本提升至 v${newVersion}。`);