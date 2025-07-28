/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js'; // 导入 LoadedSettings, AppSettings, MergedSetting
import { type HistoryItem, MessageType } from '../types.js';
import process from 'node:process';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void; // 添加了 scope
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  loadedSettings: LoadedSettings,
  setThemeError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseThemeCommandReturn => {
  // 确定有效的主题
  const effectiveTheme = loadedSettings.merged.theme;

  // 初始状态：如果用户或工作区设置中均未设置主题，则打开对话框
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(
    effectiveTheme === undefined && !process.env.NO_COLOR,
  );
  // TODO: 重构主题访问方式以避免强制重新渲染。
  const [, setForceRender] = useState(0);

  // 在组件挂载时应用初始主题
  useEffect(() => {
    if (effectiveTheme === undefined) {
      if (process.env.NO_COLOR) {
        addItem(
          {
            type: MessageType.INFO,
            text: '由于设置了 NO_COLOR 环境变量，主题配置不可用。',
          },
          Date.now(),
        );
      }
      // 如果未设置主题且未设置 NO_COLOR，则对话框已打开。
      return;
    }

    if (!themeManager.setActiveTheme(effectiveTheme)) {
      setIsThemeDialogOpen(true);
      setThemeError(`未找到主题 "${effectiveTheme}"。`);
    } else {
      setThemeError(null);
    }
  }, [effectiveTheme, setThemeError, addItem]); // 当 effectiveTheme 或 setThemeError 变化时重新运行

  const openThemeDialog = useCallback(() => {
    if (process.env.NO_COLOR) {
      addItem(
        {
          type: MessageType.INFO,
          text: '由于设置了 NO_COLOR 环境变量，主题配置不可用。',
        },
        Date.now(),
      );
      return;
    }
    setIsThemeDialogOpen(true);
  }, [addItem]);

  const applyTheme = useCallback(
    (themeName: string | undefined) => {
      if (!themeManager.setActiveTheme(themeName)) {
        // 如果未找到主题，则打开主题选择对话框并设置错误信息
        setIsThemeDialogOpen(true);
        setThemeError(`未找到主题 "${themeName}"。`);
      } else {
        setForceRender((v) => v + 1); // 触发潜在的重新渲染
        setThemeError(null); // 成功时清除之前的主题错误
      }
    },
    [setForceRender, setThemeError],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      applyTheme(themeName);
    },
    [applyTheme],
  );

  const handleThemeSelect = useCallback(
    (themeName: string | undefined, scope: SettingScope) => {
      // 添加了 scope 参数
      try {
        loadedSettings.setValue(scope, 'theme', themeName); // 更新合并后的设置
        applyTheme(loadedSettings.merged.theme); // 应用当前主题
      } finally {
        setIsThemeDialogOpen(false); // 关闭对话框
      }
    },
    [applyTheme, loadedSettings],
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};