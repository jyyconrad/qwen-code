/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';

interface ThemeDialogProps {
  /** 当选择一个主题时的回调函数 */
  onSelect: (themeName: string | undefined, scope: SettingScope) => void;

  /** 当高亮一个主题时的回调函数 */
  onHighlight: (themeName: string | undefined) => void;
  /** 设置对象 */
  settings: LoadedSettings;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export function ThemeDialog({
  onSelect,
  onHighlight,
  settings,
  availableTerminalHeight,
  terminalWidth,
}: ThemeDialogProps): React.JSX.Element {
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );

  // 生成主题项
  const themeItems = themeManager.getAvailableThemes().map((theme) => {
    const typeString = theme.type.charAt(0).toUpperCase() + theme.type.slice(1);
    return {
      label: theme.name,
      value: theme.name,
      themeNameDisplay: theme.name,
      themeTypeDisplay: typeString,
    };
  });
  const [selectInputKey, setSelectInputKey] = useState(Date.now());

  // 确定主题列表中哪个单选按钮应该被初始选中
  // 这应该反映为所选作用域*保存*的主题，或默认主题
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === (settings.merged.theme || DEFAULT_THEME.name),
  );

  const scopeItems = [
    { label: '用户设置', value: SettingScope.User },
    { label: '工作区设置', value: SettingScope.Workspace },
    { label: '系统设置', value: SettingScope.System },
  ];

  const handleThemeSelect = useCallback(
    (themeName: string) => {
      onSelect(themeName, selectedScope);
    },
    [onSelect, selectedScope],
  );

  const handleScopeHighlight = useCallback((scope: SettingScope) => {
    setSelectedScope(scope);
    setSelectInputKey(Date.now());
  }, []);

  const handleScopeSelect = useCallback(
    (scope: SettingScope) => {
      handleScopeHighlight(scope);
      setFocusedSection('theme'); // 重置焦点到主题部分
    },
    [handleScopeHighlight],
  );

  const [focusedSection, setFocusedSection] = useState<'theme' | 'scope'>(
    'theme',
  );

  useInput((input, key) => {
    if (key.tab) {
      setFocusedSection((prev) => (prev === 'theme' ? 'scope' : 'theme'));
    }
    if (key.escape) {
      onSelect(undefined, selectedScope);
    }
  });

  const otherScopes = Object.values(SettingScope).filter(
    (scope) => scope !== selectedScope,
  );

  const modifiedInOtherScopes = otherScopes.filter(
    (scope) => settings.forScope(scope).settings.theme !== undefined,
  );

  let otherScopeModifiedMessage = '';
  if (modifiedInOtherScopes.length > 0) {
    const modifiedScopesStr = modifiedInOtherScopes.join(', ');
    otherScopeModifiedMessage =
      settings.forScope(selectedScope).settings.theme !== undefined
        ? `(也在 ${modifiedScopesStr} 中修改)`
        : `(${modifiedScopesStr} 中已修改)`;
  }

  // 用于计算预览窗格布局的常量。
  // 这些值基于下面的 JSX 结构。
  const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
  // 安全边距以防止文本触及边框。
  // 这是一个与 App.tsx 中使用的 0.9 无关的完全 hack 值
  const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
  // 对话框和预览窗格的总水平内边距。
  const TOTAL_HORIZONTAL_PADDING = 4;
  const colorizeCodeWidth = Math.max(
    Math.floor(
      (terminalWidth - TOTAL_HORIZONTAL_PADDING) *
        PREVIEW_PANE_WIDTH_PERCENTAGE *
        PREVIEW_PANE_WIDTH_SAFETY_MARGIN,
    ),
    1,
  );

  const DIALOG_PADDING = 2;
  const selectThemeHeight = themeItems.length + 1;
  const SCOPE_SELECTION_HEIGHT = 4; // 作用域选择部分的高度 + 边距。
  const SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO = 1;
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // 顶部和底部边框。
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight =
    DIALOG_PADDING +
    selectThemeHeight +
    SCOPE_SELECTION_HEIGHT +
    SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO;

  let showScopeSelection = true;
  let includePadding = true;

  // 如果超出可用高度，则从左侧移除可以省略的内容。
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DIALOG_PADDING;
  }

  if (totalLeftHandSideHeight > availableTerminalHeight) {
    // 首先，尝试隐藏作用域选择
    totalLeftHandSideHeight -= SCOPE_SELECTION_HEIGHT;
    showScopeSelection = false;
  }

  // 如果由于高度限制而隐藏了作用域选择，则不要聚焦它。
  const currenFocusedSection = !showScopeSelection ? 'theme' : focusedSection;

  // 预览窗格中除两个代码块外的其他元素所占用的垂直空间。
  // 包括"Preview"标题、边框和块之间的边距。
  const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

  // 右列不需要比左列更短。
  availableTerminalHeight = Math.max(
    availableTerminalHeight,
    totalLeftHandSideHeight,
  );
  const availableTerminalHeightCodeBlock =
    availableTerminalHeight -
    PREVIEW_PANE_FIXED_VERTICAL_SPACE -
    (includePadding ? 2 : 0) * 2;
  // 给代码块稍微多一点空间，因为它有 3 行更长。
  const diffHeight = Math.floor(availableTerminalHeightCodeBlock / 2) - 1;
  const codeBlockHeight = Math.ceil(availableTerminalHeightCodeBlock / 2) + 1;

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={includePadding ? 1 : 0}
      paddingBottom={includePadding ? 1 : 0}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Box flexDirection="row">
        {/* 左列: 选择 */}
        <Box flexDirection="column" width="45%" paddingRight={2}>
          <Text bold={currenFocusedSection === 'theme'} wrap="truncate">
            {currenFocusedSection === 'theme' ? '> ' : '  '}选择主题{' '}
            <Text color={Colors.Gray}>{otherScopeModifiedMessage}</Text>
          </Text>
          <RadioButtonSelect
            key={selectInputKey}
            items={themeItems}
            initialIndex={initialThemeIndex}
            onSelect={handleThemeSelect}
            onHighlight={onHighlight}
            isFocused={currenFocusedSection === 'theme'}
            maxItemsToShow={8}
            showScrollArrows={true}
          />

          {/* 作用域选择 */}
          {showScopeSelection && (
            <Box marginTop={1} flexDirection="column">
              <Text bold={currenFocusedSection === 'scope'} wrap="truncate">
                {currenFocusedSection === 'scope' ? '> ' : '  '}应用到
              </Text>
              <RadioButtonSelect
                items={scopeItems}
                initialIndex={0} // 默认为用户设置
                onSelect={handleScopeSelect}
                onHighlight={handleScopeHighlight}
                isFocused={currenFocusedSection === 'scope'}
              />
            </Box>
          )}
        </Box>

        {/* 右列: 预览 */}
        <Box flexDirection="column" width="55%" paddingLeft={2}>
          <Text bold>预览</Text>
          <Box
            borderStyle="single"
            borderColor={Colors.Gray}
            paddingTop={includePadding ? 1 : 0}
            paddingBottom={includePadding ? 1 : 0}
            paddingLeft={1}
            paddingRight={1}
            flexDirection="column"
          >
            {colorizeCode(
              `# function
-def fibonacci(n):
-    a, b = 0, 1
-    for _ in range(n):
-        a, b = b, a + b
-    return a`,
              'python',
              codeBlockHeight,
              colorizeCodeWidth,
            )}
            <Box marginTop={1} />
            <DiffRenderer
              diffContent={`--- a/old_file.txt
-+++ b/new_file.txt
-@@ -1,4 +1,5 @@
- This is a context line.
--This line was deleted.
-+This line was added.
-`}
              availableTerminalHeight={diffHeight}
              terminalWidth={colorizeCodeWidth}
            />
          </Box>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray} wrap="truncate">
          (使用 Enter 选择
          {showScopeSelection ? '，Tab 切换焦点' : ''})
        </Text>
      </Box>
    </Box>
  );
}