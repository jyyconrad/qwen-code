/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from './clipboardUtils.js';

describe('clipboardUtils', () => {
  describe('clipboardHasImage', () => {
    it('在非 macOS 平台上应返回 false', async () => {
      if (process.platform !== 'darwin') {
        const result = await clipboardHasImage();
        expect(result).toBe(false);
      } else {
        // 在 macOS 上跳过，因为需要实际的剪贴板状态
        expect(true).toBe(true);
      }
    });

    it('在 macOS 上应返回布尔值', async () => {
      if (process.platform === 'darwin') {
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } else {
        // 在非 macOS 上跳过
        expect(true).toBe(true);
      }
    });
  });

  describe('saveClipboardImage', () => {
    it('在非 macOS 平台上应返回 null', async () => {
      if (process.platform !== 'darwin') {
        const result = await saveClipboardImage();
        expect(result).toBe(null);
      } else {
        // 在 macOS 上跳过
        expect(true).toBe(true);
      }
    });

    it('应优雅地处理错误', async () => {
      // 使用无效目录进行测试（不应抛出异常）
      const result = await saveClipboardImage(
        '/invalid/path/that/does/not/exist',
      );

      if (process.platform === 'darwin') {
        // 在 macOS 上，可能由于各种错误而返回 null
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        // 在其他平台上，应始终返回 null
        expect(result).toBe(null);
      }
    });
  });

  describe('cleanupOldClipboardImages', () => {
    it('不应抛出错误', async () => {
      // 应优雅地处理缺失的目录
      await expect(
        cleanupOldClipboardImages('/path/that/does/not/exist'),
      ).resolves.not.toThrow();
    });

    it('在有效目录上应无错误地完成', async () => {
      await expect(cleanupOldClipboardImages('.')).resolves.not.toThrow();
    });
  });
});