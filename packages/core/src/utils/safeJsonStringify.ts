/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 安全地将对象序列化为 JSON，通过将循环引用替换为 [Circular] 来处理循环引用。
 *
 * @param obj - 要序列化的对象
 * @param space - 可选的格式化空格参数（默认为无格式化）
 * @returns 循环引用被替换为 [Circular] 的 JSON 字符串
 */
export function safeJsonStringify(
  obj: unknown,
  space?: string | number,
): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    },
    space,
  );
}