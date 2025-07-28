/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { TextBuffer } from './shared/text-buffer.js';
import { cpSlice, cpLen } from '../utils/textUtils.js';
import chalk from 'chalk';
import stringWidth from 'string-width';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { useKeypress, Key } from '../hooks/useKeypress.js';
import { isAtCommand, isSlashCommand } from '../utils/commandUtils.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config } from '@iflytek/iflycode-core';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from '../utils/clipboardUtils.js';
import * as path from 'path';

export interface InputPromptProps {
  buffer: TextBuffer;
  onSubmit: (value: string) => void;
  userMessages: readonly string[];
  onClearScreen: () => void;
  config: Config;
  slashCommands: SlashCommand[];
  commandContext: CommandContext;
  placeholder?: string;
  focus?: boolean;
  inputWidth: number;
  suggestionsWidth: number;
  shellModeActive: boolean;
  setShellModeActive: (value: boolean) => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  buffer,
  onSubmit,
  userMessages,
  onClearScreen,
  config,
  slashCommands,
  commandContext,
  placeholder = '  输入您的消息或 @路径/到/文件',
  focus = true,
  inputWidth,
  suggestionsWidth,
  shellModeActive,
  setShellModeActive,
}) => {
  const [justNavigatedHistory, setJustNavigatedHistory] = useState(false);
  const completion = useCompletion(
    buffer.text,
    config.getTargetDir(),
    isAtCommand(buffer.text) || isSlashCommand(buffer.text),
    slashCommands,
    commandContext,
    config,
  );

  const resetCompletionState = completion.resetCompletionState;
  const shellHistory = useShellHistory(config.getProjectRoot());

  const handleSubmitAndClear = useCallback(
    (submittedValue: string) => {
      if (shellModeActive) {
        shellHistory.addCommandToHistory(submittedValue);
      }
      // 在调用 onSubmit 之前清除缓冲区，以防止在缓冲区仍持有旧值时，
      // onSubmit 触发重新渲染而导致的重复提交。
      buffer.setText('');
      onSubmit(submittedValue);
      resetCompletionState();
    },
    [onSubmit, buffer, resetCompletionState, shellModeActive, shellHistory],
  );

  const customSetTextAndResetCompletionSignal = useCallback(
    (newText: string) => {
      buffer.setText(newText);
      setJustNavigatedHistory(true);
    },
    [buffer, setJustNavigatedHistory],
  );

  const inputHistory = useInputHistory({
    userMessages,
    onSubmit: handleSubmitAndClear,
    isActive: !completion.showSuggestions && !shellModeActive,
    currentQuery: buffer.text,
    onChange: customSetTextAndResetCompletionSignal,
  });

  // 效果：如果刚刚发生了历史导航，则重置补全状态并设置文本
  useEffect(() => {
    if (justNavigatedHistory) {
      resetCompletionState();
      setJustNavigatedHistory(false);
    }
  }, [
    justNavigatedHistory,
    buffer.text,
    resetCompletionState,
    setJustNavigatedHistory,
  ]);

  const completionSuggestions = completion.suggestions;
  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= completionSuggestions.length) {
        return;
      }
      const query = buffer.text;
      const suggestion = completionSuggestions[indexToUse].value;

      if (query.trimStart().startsWith('/')) {
        const hasTrailingSpace = query.endsWith(' ');
        const parts = query
          .trimStart()
          .substring(1)
          .split(/\s+/)
          .filter(Boolean);

        let isParentPath = false;
        // 如果没有尾随空格，我们需要检查当前查询
        // 是否已经是父命令的完整路径。
        if (!hasTrailingSpace) {
          let currentLevel: SlashCommand[] | undefined = slashCommands;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const found: SlashCommand | undefined = currentLevel?.find(
              (cmd) => cmd.name === part || cmd.altName === part,
            );

            if (found) {
              if (i === parts.length - 1 && found.subCommands) {
                isParentPath = true;
              }
              currentLevel = found.subCommands;
            } else {
              // 路径无效，因此不能是父路径。
              currentLevel = undefined;
              break;
            }
          }
        }

        // 确定命令的基本路径。
        // - 如果有尾随空格，则整个命令就是基本路径。
        // - 如果是已知的父路径，则整个命令就是基本路径。
        // - 否则，基本路径是除了最后一个部分之外的所有内容。
        const basePath =
          hasTrailingSpace || isParentPath ? parts : parts.slice(0, -1);
        const newValue = `/${[...basePath, suggestion].join(' ')} `;

        buffer.setText(newValue);
      } else {
        const atIndex = query.lastIndexOf('@');
        if (atIndex === -1) return;
        const pathPart = query.substring(atIndex + 1);
        const lastSlashIndexInPath = pathPart.lastIndexOf('/');
        let autoCompleteStartIndex = atIndex + 1;
        if (lastSlashIndexInPath !== -1) {
          autoCompleteStartIndex += lastSlashIndexInPath + 1;
        }
        buffer.replaceRangeByOffset(
          autoCompleteStartIndex,
          buffer.text.length,
          suggestion,
        );
      }
      resetCompletionState();
    },
    [resetCompletionState, buffer, completionSuggestions, slashCommands],
  );

  // 使用 Ctrl+V 处理剪贴板图像粘贴
  const handleClipboardImage = useCallback(async () => {
    try {
      if (await clipboardHasImage()) {
        const imagePath = await saveClipboardImage(config.getTargetDir());
        if (imagePath) {
          // 清理旧图像
          cleanupOldClipboardImages(config.getTargetDir()).catch(() => {
            // 忽略清理错误
          });

          // 获取相对于当前目录的路径
          const relativePath = path.relative(config.getTargetDir(), imagePath);

          // 在光标位置插入 @path 引用
          const insertText = `@${relativePath}`;
          const currentText = buffer.text;
          const [row, col] = buffer.cursor;

          // 根据行列计算偏移量
          let offset = 0;
          for (let i = 0; i < row; i++) {
            offset += buffer.lines[i].length + 1; // +1 表示换行符
          }
          offset += col;

          // 如需要，在路径前后添加空格
          let textToInsert = insertText;
          const charBefore = offset > 0 ? currentText[offset - 1] : '';
          const charAfter =
            offset < currentText.length ? currentText[offset] : '';

          if (charBefore && charBefore !== ' ' && charBefore !== '\n') {
            textToInsert = ' ' + textToInsert;
          }
          if (!charAfter || (charAfter !== ' ' && charAfter !== '\n')) {
            textToInsert = textToInsert + ' ';
          }

          // 在光标位置插入
          buffer.replaceRangeByOffset(offset, offset, textToInsert);
        }
      }
    } catch (error) {
      console.error('处理剪贴板图像时出错:', error);
    }
  }, [buffer, config]);

  const handleInput = useCallback(
    (key: Key) => {
      if (!focus) {
        return;
      }

      if (
        key.sequence === '!' &&
        buffer.text === '' &&
        !completion.showSuggestions
      ) {
        setShellModeActive(!shellModeActive);
        buffer.setText(''); // 清除输入中的 '!'
        return;
      }

      if (key.name === 'escape') {
        if (shellModeActive) {
          setShellModeActive(false);
          return;
        }

        if (completion.showSuggestions) {
          completion.resetCompletionState();
          return;
        }
      }

      if (key.ctrl && key.name === 'l') {
        onClearScreen();
        return;
      }

      if (completion.showSuggestions) {
        if (key.name === 'up') {
          completion.navigateUp();
          return;
        }
        if (key.name === 'down') {
          completion.navigateDown();
          return;
        }

        if (key.name === 'tab' || (key.name === 'return' && !key.ctrl)) {
          if (completion.suggestions.length > 0) {
            const targetIndex =
              completion.activeSuggestionIndex === -1
                ? 0 // 如果没有激活的项，则默认为第一个
                : completion.activeSuggestionIndex;
            if (targetIndex < completion.suggestions.length) {
              handleAutocomplete(targetIndex);
            }
          }
          return;
        }
      } else {
        if (!shellModeActive) {
          if (key.ctrl && key.name === 'p') {
            inputHistory.navigateUp();
            return;
          }
          if (key.ctrl && key.name === 'n') {
            inputHistory.navigateDown();
            return;
          }
          // 处理单行或边缘处的历史记录上下箭头
          if (
            key.name === 'up' &&
            (buffer.allVisualLines.length === 1 ||
              (buffer.visualCursor[0] === 0 && buffer.visualScrollRow === 0))
          ) {
            inputHistory.navigateUp();
            return;
          }
          if (
            key.name === 'down' &&
            (buffer.allVisualLines.length === 1 ||
              buffer.visualCursor[0] === buffer.allVisualLines.length - 1)
          ) {
            inputHistory.navigateDown();
            return;
          }
        } else {
          // Shell 历史导航
          if (key.name === 'up') {
            const prevCommand = shellHistory.getPreviousCommand();
            if (prevCommand !== null) buffer.setText(prevCommand);
            return;
          }
          if (key.name === 'down') {
            const nextCommand = shellHistory.getNextCommand();
            if (nextCommand !== null) buffer.setText(nextCommand);
            return;
          }
        }

        if (key.name === 'return' && !key.ctrl && !key.meta && !key.paste) {
          if (buffer.text.trim()) {
            const [row, col] = buffer.cursor;
            const line = buffer.lines[row];
            const charBefore = col > 0 ? cpSlice(line, col - 1, col) : '';
            if (charBefore === '\\') {
              buffer.backspace();
              buffer.newline();
            } else {
              handleSubmitAndClear(buffer.text);
            }
          }
          return;
        }
      }

      // 插入新行
      if (key.name === 'return' && (key.ctrl || key.meta || key.paste)) {
        buffer.newline();
        return;
      }

      // Ctrl+A (Home) / Ctrl+E (End)
      if (key.ctrl && key.name === 'a') {
        buffer.move('home');
        return;
      }
      if (key.ctrl && key.name === 'e') {
        buffer.move('end');
        return;
      }

      // 删除行命令
      if (key.ctrl && key.name === 'k') {
        buffer.killLineRight();
        return;
      }
      if (key.ctrl && key.name === 'u') {
        buffer.killLineLeft();
        return;
      }

      // 外部编辑器
      const isCtrlX = key.ctrl && (key.name === 'x' || key.sequence === '\x18');
      if (isCtrlX) {
        buffer.openInExternalEditor();
        return;
      }

      // Ctrl+V 用于剪贴板图像粘贴
      if (key.ctrl && key.name === 'v') {
        handleClipboardImage();
        return;
      }

      // 对于所有其他按键，回退到文本缓冲区的默认输入处理
      buffer.handleInput(key);
    },
    [
      focus,
      buffer,
      completion,
      shellModeActive,
      setShellModeActive,
      onClearScreen,
      inputHistory,
      handleAutocomplete,
      handleSubmitAndClear,
      shellHistory,
      handleClipboardImage,
    ],
  );

  useKeypress(handleInput, { isActive: focus });

  const linesToRender = buffer.viewportVisualLines;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] =
    buffer.visualCursor;
  const scrollVisualRow = buffer.visualScrollRow;

  return (
    <>
      <Box
        borderStyle="round"
        borderColor={shellModeActive ? Colors.AccentYellow : Colors.AccentBlue}
        paddingX={1}
      >
        <Text
          color={shellModeActive ? Colors.AccentYellow : Colors.AccentPurple}
        >
          {shellModeActive ? '! ' : '> '}
        </Text>
        <Box flexGrow={1} flexDirection="column">
          {buffer.text.length === 0 && placeholder ? (
            focus ? (
              <Text>
                {chalk.inverse(placeholder.slice(0, 1))}
                <Text color={Colors.Gray}>{placeholder.slice(1)}</Text>
              </Text>
            ) : (
              <Text color={Colors.Gray}>{placeholder}</Text>
            )
          ) : (
            linesToRender.map((lineText, visualIdxInRenderedSet) => {
              const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;
              let display = cpSlice(lineText, 0, inputWidth);
              const currentVisualWidth = stringWidth(display);
              if (currentVisualWidth < inputWidth) {
                display = display + ' '.repeat(inputWidth - currentVisualWidth);
              }

              if (visualIdxInRenderedSet === cursorVisualRow) {
                const relativeVisualColForHighlight = cursorVisualColAbsolute;

                if (relativeVisualColForHighlight >= 0) {
                  if (relativeVisualColForHighlight < cpLen(display)) {
                    const charToHighlight =
                      cpSlice(
                        display,
                        relativeVisualColForHighlight,
                        relativeVisualColForHighlight + 1,
                      ) || ' ';
                    const highlighted = chalk.inverse(charToHighlight);
                    display =
                      cpSlice(display, 0, relativeVisualColForHighlight) +
                      highlighted +
                      cpSlice(display, relativeVisualColForHighlight + 1);
                  } else if (
                    relativeVisualColForHighlight === cpLen(display) &&
                    cpLen(display) === inputWidth
                  ) {
                    display = display + chalk.inverse(' ');
                  }
                }
              }
              return (
                <Text key={`line-${visualIdxInRenderedSet}`}>{display}</Text>
              );
            })
          )}
        </Box>
      </Box>
      {completion.showSuggestions && (
        <Box>
          <SuggestionsDisplay
            suggestions={completion.suggestions}
            activeIndex={completion.activeSuggestionIndex}
            isLoading={completion.isLoadingSuggestions}
            width={suggestionsWidth}
            scrollOffset={completion.visibleStartIndex}
            userInput={buffer.text}
          />
        </Box>
      )}
    </>
  );
};