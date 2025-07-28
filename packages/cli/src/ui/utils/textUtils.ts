/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 计算多行 ASCII 艺术字符串的最大宽度。
 * @param asciiArt ASCII 艺术字符串。
 * @returns ASCII 艺术中最长行的长度。
 */
export const getAsciiArtWidth = (asciiArt: string): number => {
  if (!asciiArt) {
    return 0;
  }
  const lines = asciiArt.split('\n');
  return Math.max(...lines.map((line) => line.length));
};

/**
 * 通过检测是否存在 NULL 字节来判断 Buffer 是否可能为二进制数据。
 * NULL 字节的存在是数据不是纯文本的强烈指示。
 * @param data 要检查的 Buffer。
 * @param sampleSize 从缓冲区开始处测试的字节数。
 * @returns 如果找到 NULL 字节则返回 true，否则返回 false。
 */
export function isBinary(
  data: Buffer | null | undefined,
  sampleSize = 512,
): boolean {
  if (!data) {
    return false;
  }

  const sample = data.length > sampleSize ? data.subarray(0, sampleSize) : data;

  for (const byte of sample) {
    // NULL 字节 (0x00) 的存在是判断二进制文件最可靠的指标之一。
    // 文本文件不应包含 NULL 字节。
    if (byte === 0) {
      return true;
    }
  }

  // 如果在样本中未找到 NULL 字节，则假设它是文本。
  return false;
}

/*
 * -------------------------------------------------------------------------
 *  Unicode 感知辅助函数（在代码点级别而非 UTF-16 代码单元上工作，
 *  因此代理对 emoji 计为一个"列"。）
 * ---------------------------------------------------------------------- */

export function toCodePoints(str: string): string[] {
  // [...str] 或 Array.from 都会按 UTF-32 代码点进行迭代，
  // 正确处理代理对。
  return Array.from(str);
}

export function cpLen(str: string): number {
  return toCodePoints(str).length;
}

export function cpSlice(str: string, start: number, end?: number): string {
  // 按代码点索引进行切片并重新连接。
  const arr = toCodePoints(str).slice(start, end);
  return arr.join('');
}