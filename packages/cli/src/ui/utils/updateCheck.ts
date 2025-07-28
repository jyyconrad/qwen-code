/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import updateNotifier from 'update-notifier';
import semver from 'semver';
import { getPackageJson } from '../../utils/package.js';

export async function checkForUpdates(): Promise<string | null> {
  try {
    const packageJson = await getPackageJson();
    if (!packageJson || !packageJson.name || !packageJson.version) {
      return null;
    }
    const notifier = updateNotifier({
      pkg: {
        name: packageJson.name,
        version: packageJson.version,
      },
      // 每次都检查
      updateCheckInterval: 0,
      // 允许在脚本中运行通知器
      shouldNotifyInNpmScript: true,
    });

    if (
      notifier.update &&
      semver.gt(notifier.update.latest, notifier.update.current)
    ) {
      return `Gemini CLI 有新版本可用！${notifier.update.current} → ${notifier.update.latest}\n运行 npm install -g ${packageJson.name} 进行更新`;
    }

    return null;
  } catch (e) {
    console.warn('检查更新失败：' + e);
    return null;
  }
}