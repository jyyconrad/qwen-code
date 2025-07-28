/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * 检查系统剪贴板是否包含图像（目前仅支持 macOS）
 * @returns 如果剪贴板包含图像则返回 true
 */
export async function clipboardHasImage(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    // 使用 osascript 检查剪贴板类型
    const { stdout } = await execAsync(
      `osascript -e 'clipboard info' 2>/dev/null | grep -qE "«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»" && echo "true" || echo "false"`,
      { shell: '/bin/bash' },
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * 将剪贴板中的图像保存到临时文件（目前仅支持 macOS）
 * @param targetDir 用于创建临时文件的目标目录
 * @returns 保存的图像文件路径，如果没有图像或出错则返回 null
 */
export async function saveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    // 在目标目录内创建一个用于剪贴板图像的临时目录
    // 这样可以避免对目标目录外路径的安全限制
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    await fs.mkdir(tempDir, { recursive: true });

    // 使用时间戳生成唯一的文件名
    const timestamp = new Date().getTime();

    // 按优先顺序尝试不同的图像格式
    const formats = [
      { class: 'PNGf', extension: 'png' },
      { class: 'JPEG', extension: 'jpg' },
      { class: 'TIFF', extension: 'tiff' },
      { class: 'GIFf', extension: 'gif' },
    ];

    for (const format of formats) {
      const tempFilePath = path.join(
        tempDir,
        `clipboard-${timestamp}.${format.extension}`,
      );

      // 尝试将剪贴板保存为此格式
      const script = `
        try
          set imageData to the clipboard as «class ${format.class}»
          set fileRef to open for access POSIX file "${tempFilePath}" with write permission
          write imageData to fileRef
          close access fileRef
          return "success"
        on error errMsg
          try
            close access POSIX file "${tempFilePath}"
          end try
          return "error"
        end try
      `;

      const { stdout } = await execAsync(`osascript -e '${script}'`);

      if (stdout.trim() === 'success') {
        // 验证文件是否已创建且包含内容
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // 文件不存在，继续尝试下一种格式
        }
      }

      // 清理失败的尝试
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // 忽略清理错误
      }
    }

    // 所有格式都失败了
    return null;
  } catch (error) {
    console.error('保存剪贴板图像时出错:', error);
    return null;
  }
}

/**
 * 清理旧的临时剪贴板图像文件
 * 删除超过 1 小时的文件
 * @param targetDir 存储临时文件的目标目录
 */
export async function cleanupOldClipboardImages(
  targetDir?: string,
): Promise<void> {
  try {
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    const files = await fs.readdir(tempDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const file of files) {
      if (
        file.startsWith('clipboard-') &&
        (file.endsWith('.png') ||
          file.endsWith('.jpg') ||
          file.endsWith('.tiff') ||
          file.endsWith('.gif'))
      ) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.unlink(filePath);
        }
      }
    }
  } catch {
    // 忽略清理过程中的错误
  }
}