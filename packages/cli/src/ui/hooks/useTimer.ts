/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

/**
 * 自定义 Hook，用于管理每秒递增的计时器。
 * @param isActive 计时器是否应该运行。
 * @param resetKey 一个键，当它改变时，将计时器重置为 0 并重新启动间隔。
 * @returns 已经过的时间（秒）。
 */
export const useTimer = (isActive: boolean, resetKey: unknown) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevResetKeyRef = useRef(resetKey);
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    let shouldResetTime = false;

    if (prevResetKeyRef.current !== resetKey) {
      shouldResetTime = true;
      prevResetKeyRef.current = resetKey;
    }

    if (prevIsActiveRef.current === false && isActive) {
      // 从非活动状态转换到活动状态
      shouldResetTime = true;
    }

    if (shouldResetTime) {
      setElapsedTime(0);
    }
    prevIsActiveRef.current = isActive;

    // 管理间隔
    if (isActive) {
      // 在启动新间隔之前无条件清除之前的间隔
      // 这处理了在活动时 resetKey 的变化，确保重新开始一个新间隔。
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, resetKey]);

  return elapsedTime;
};