#!/usr/bin/env node

/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const projectRoot = join(import.meta.dirname, '..');

const SETTINGS_DIRECTORY_NAME = '.iflycode';
const USER_SETTINGS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '',
  SETTINGS_DIRECTORY_NAME,
);
const USER_SETTINGS_PATH = join(USER_SETTINGS_DIR, 'settings.json');
const WORKSPACE_SETTINGS_PATH = join(
  projectRoot,
  SETTINGS_DIRECTORY_NAME,
  'settings.json',
);

let settingsTarget = undefined;

function loadSettingsValue(filePath) {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const jsonContent = content.replace(/\/\/[^\n]*/g, '');
      const settings = JSON.parse(jsonContent);
      return settings.telemetry?.target;
    }
  } catch (e) {
    console.warn(
      `⚠️ 警告: 无法解析设置文件 ${filePath}: ${e.message}`,
    );
  }
  return undefined;
}

settingsTarget = loadSettingsValue(WORKSPACE_SETTINGS_PATH);

if (!settingsTarget) {
  settingsTarget = loadSettingsValue(USER_SETTINGS_PATH);
}

let target = settingsTarget || 'local';
const allowedTargets = ['local', 'gcp'];

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
if (targetArg) {
  const potentialTarget = targetArg.split('=')[1];
  if (allowedTargets.includes(potentialTarget)) {
    target = potentialTarget;
    console.log(`⚙️  使用命令行目标: ${target}`);
  } else {
    console.error(
      `🛑 错误: 无效的目标 '${potentialTarget}'。允许的目标为: ${allowedTargets.join(', ')}。`,
    );
    process.exit(1);
  }
} else if (settingsTarget) {
  console.log(
    `⚙️ 使用来自 settings.json 的遥测目标: ${settingsTarget}`,
  );
}

const scriptPath = join(
  projectRoot,
  'scripts',
  target === 'gcp' ? 'telemetry_gcp.js' : 'local_telemetry.js',
);

try {
  console.log(`🚀 正在运行目标的遥测脚本: ${target}。`);
  execSync(`node ${scriptPath}`, { stdio: 'inherit', cwd: projectRoot });
} catch (error) {
  console.error(`🛑 无法运行目标的遥测脚本: ${target}`);
  console.error(error);
  process.exit(1);
}