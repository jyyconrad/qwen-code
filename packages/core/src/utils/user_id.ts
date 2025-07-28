/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { GEMINI_DIR } from './paths.js';

const homeDir = os.homedir() ?? '';
const geminiDir = path.join(homeDir, GEMINI_DIR);
const installationIdFile = path.join(geminiDir, 'installation_id');

function ensureGeminiDirExists() {
  if (!fs.existsSync(geminiDir)) {
    fs.mkdirSync(geminiDir, { recursive: true });
  }
}

function readInstallationIdFromFile(): string | null {
  if (fs.existsSync(installationIdFile)) {
    const installationid = fs.readFileSync(installationIdFile, 'utf-8').trim();
    return installationid || null;
  }
  return null;
}

function writeInstallationIdToFile(installationId: string) {
  fs.writeFileSync(installationIdFile, installationId, 'utf-8');
}

/**
 * 从文件中检索安装 ID，如果不存在则创建它。
 * 此 ID 用于唯一用户安装跟踪。
 * @returns 用户的 UUID 字符串。
 */
export function getInstallationId(): string {
  try {
    ensureGeminiDirExists();
    let installationId = readInstallationIdFromFile();

    if (!installationId) {
      installationId = randomUUID();
      writeInstallationIdToFile(installationId);
    }

    return installationId;
  } catch (error) {
    console.error(
      '访问安装 ID 文件时出错，生成临时 ID:',
      error,
    );
    return '123456789';
  }
}