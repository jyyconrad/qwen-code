/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';

const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

/**
 * 在终端中启用和禁用括号粘贴模式。
 *
 * 此钩子确保在组件挂载时启用括号粘贴模式，
 * 在组件卸载或进程退出时禁用该模式。
 */
export const useBracketedPaste = () => {
  const cleanup = () => {
    process.stdout.write(DISABLE_BRACKETED_PASTE);
  };

  useEffect(() => {
    process.stdout.write(ENABLE_BRACKETED_PASTE);

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    return () => {
      cleanup();
      process.removeListener('exit', cleanup);
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    };
  }, []);
};