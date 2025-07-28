/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { sessionId, Logger } from '@iflytek/iflycode-core';

/**
 * 用于管理日志记录器实例的 Hook。
 */
export const useLogger = () => {
  const [logger, setLogger] = useState<Logger | null>(null);

  useEffect(() => {
    const newLogger = new Logger(sessionId);
    /**
     * 开始异步初始化，无需等待。使用 await 会减慢
     * 从启动到看到 gemini-cli 提示符的时间，最好不保存
     * 消息也比 CLI 挂起等待日志记录器加载要好。
     */
    newLogger
      .initialize()
      .then(() => {
        setLogger(newLogger);
      })
      .catch(() => {});
  }, []);

  return logger;
};