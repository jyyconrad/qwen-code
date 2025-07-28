/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

// 用于返回状态、状态设置器和指向状态最新值的 ref 的 Hook。
// 我们需要这个 Hook 以便在同一个函数中多次设置状态和引用更新后的状态。
export const useStateAndRef = <
  // 除函数外的所有类型。
  T extends object | null | undefined | number | string,
>(
  initialValue: T,
) => {
  const [_, setState] = React.useState<T>(initialValue);
  const ref = React.useRef<T>(initialValue);

  const setStateInternal = React.useCallback<typeof setState>(
    (newStateOrCallback) => {
      let newValue: T;
      if (typeof newStateOrCallback === 'function') {
        newValue = newStateOrCallback(ref.current);
      } else {
        newValue = newStateOrCallback;
      }
      setState(newValue);
      ref.current = newValue;
    },
    [],
  );

  return [ref, setStateInternal] as const;
};