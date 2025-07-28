/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function getPackageVersion() {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function getShortSha() {
  return execSync('git rev-parse --short HEAD').toString().trim();
}

export function getNightlyTagName() {
  const version = getPackageVersion();
  const now = new Date();
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const date = `${year}${month}${day}`;

  const sha = getShortSha();
  return `v${version}-nightly.${date}.${sha}`;
}

export function getReleaseVersion() {
  const isNightly = process.env.IS_NIGHTLY === 'true';
  const manualVersion = process.env.MANUAL_VERSION;

  let releaseTag;

  if (isNightly) {
    console.error('正在计算下一个夜间版本...');
    releaseTag = getNightlyTagName();
  } else if (manualVersion) {
    console.error(`使用手动指定版本: ${manualVersion}`);
    releaseTag = manualVersion;
  } else {
    throw new Error(
      '错误: 未指定版本且当前不是夜间发布版本。',
    );
  }

  if (!releaseTag) {
    throw new Error('错误: 无法确定版本。');
  }

  if (!releaseTag.startsWith('v')) {
    console.error("版本缺少 'v' 前缀。正在添加前缀。");
    releaseTag = `v${releaseTag}`;
  }

  if (releaseTag.includes('+')) {
    throw new Error(
      '错误: 发布版本不支持包含构建元数据 (+) 的版本号。请使用预发布版本（例如 v1.2.3-alpha.4）。',
    );
  }

  if (!releaseTag.match(/^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$/)) {
    throw new Error(
      '错误: 版本必须符合格式 vX.Y.Z 或 vX.Y.Z-prerelease',
    );
  }

  const releaseVersion = releaseTag.substring(1);
  let npmTag = 'latest';
  if (releaseVersion.includes('-')) {
    npmTag = releaseVersion.split('-')[1].split('.')[0];
  }

  return { releaseTag, releaseVersion, npmTag };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const versions = getReleaseVersion();
    console.log(JSON.stringify(versions));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}