/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 检查查询字符串是否可能表示 '@' 命令。
 * 当查询以 '@' 开头，或包含 '@' 且前面是空白字符、后面是
 * 非空白字符时触发。
 *
 * @param query 输入的查询字符串。
 * @returns 如果查询看起来像 '@' 命令则返回 true，否则返回 false。
 */
export const isAtCommand = (query: string): boolean =>
  // 检查是否以 @ 开头 OR 有空格后跟 @
  query.startsWith('@') || /\s@/.test(query);

/**
 * 检查查询字符串是否可能表示 '/' 命令。
 * 当查询以 '/' 开头时触发
 *
 * @param query 输入的查询字符串。
 * @returns 如果查询看起来像 '/' 命令则返回 true，否则返回 false。
 */
export const isSlashCommand = (query: string): boolean => query.startsWith('/');