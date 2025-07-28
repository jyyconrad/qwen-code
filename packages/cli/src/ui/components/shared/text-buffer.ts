/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import pathMod from 'path';
import { useState, useCallback, useEffect, useMemo, useReducer } from 'react';
import stringWidth from 'string-width';
import { unescapePath } from '@iflytek/iflycode-core';
import { toCodePoints, cpLen, cpSlice } from '../../utils/textUtils.js';

export type Direction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'wordLeft'
  | 'wordRight'
  | 'home'
  | 'end';

// 简单的辅助函数用于词级操作。
function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) {
    return false;
  }
  return !/[\s,.;!?]/.test(ch);
}

/**
 * 去除可能破坏终端渲染的字符。
 *
 * 去除 ANSI 转义码和控制字符，但保留换行符。
 * 控制字符如删除符会破坏终端 UI 渲染。
 */
function stripUnsafeCharacters(str: string): string {
  const stripped = stripAnsi(str);
  return toCodePoints(stripAnsi(stripped))
    .filter((char) => {
      if (char.length > 1) return false;
      const code = char.codePointAt(0);
      if (code === undefined) {
        return false;
      }
      const isUnsafe =
        code === 127 || (code <= 31 && code !== 13 && code !== 10);
      return !isUnsafe;
    })
    .join('');
}

export interface Viewport {
  height: number;
  width: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}


interface UseTextBufferProps {
  initialText?: string;
  initialCursorOffset?: number;
  viewport: Viewport; // 视口尺寸，用于滚动
  stdin?: NodeJS.ReadStream | null; // 外部编辑器使用
  setRawMode?: (mode: boolean) => void; // 外部编辑器使用
  onChange?: (text: string) => void; // 文本变化时的回调
  isValidPath: (path: string) => boolean;
  shellModeActive?: boolean; // 文本缓冲区是否处于 shell 模式
}

interface UndoHistoryEntry {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
}

function calculateInitialCursorPosition(
  initialLines: string[],
  offset: number,
): [number, number] {
  let remainingChars = offset;
  let row = 0;
  while (row < initialLines.length) {
    const lineLength = cpLen(initialLines[row]);
    // 为换行符加 1（最后一行除外）
    const totalCharsInLineAndNewline =
      lineLength + (row < initialLines.length - 1 ? 1 : 0);

    if (remainingChars <= lineLength) {
      // 光标在此行上
      return [row, remainingChars];
    }
    remainingChars -= totalCharsInLineAndNewline;
    row++;
  }
  // 偏移量超出文本范围，将光标放置在最后一行的末尾
  if (initialLines.length > 0) {
    const lastRow = initialLines.length - 1;
    return [lastRow, cpLen(initialLines[lastRow])];
  }
  return [0, 0]; // 空文本的默认值
}

export function offsetToLogicalPos(
  text: string,
  offset: number,
): [number, number] {
  let row = 0;
  let col = 0;
  let currentOffset = 0;

  if (offset === 0) return [0, 0];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = cpLen(line);
    const lineLengthWithNewline = lineLength + (i < lines.length - 1 ? 1 : 0);

    if (offset <= currentOffset + lineLength) {
      // 首先检查是否在行长度内
      row = i;
      col = offset - currentOffset;
      return [row, col];
    } else if (offset <= currentOffset + lineLengthWithNewline) {
      // 检查偏移量是否是换行符本身
      row = i;
      col = lineLength; // 将光标放置在当前行内容的末尾
      // 如果偏移量就是换行符，并且不是最后一行，则前进到下一行，列号为 0
      if (
        offset === currentOffset + lineLengthWithNewline &&
        i < lines.length - 1
      ) {
        return [i + 1, 0];
      }
      return [row, col]; // 否则，它在当前行内容的末尾
    }
    currentOffset += lineLengthWithNewline;
  }

  // 如果偏移量超出文本长度，将光标放置在最后一行的末尾
  // 或者如果文本为空，则为 [0,0]
  if (lines.length > 0) {
    row = lines.length - 1;
    col = cpLen(lines[row]);
  } else {
    row = 0;
    col = 0;
  }
  return [row, col];
}

// 辅助函数计算视觉行并映射光标位置
function calculateVisualLayout(
  logicalLines: string[],
  logicalCursor: [number, number],
  viewportWidth: number,
): {
  visualLines: string[];
  visualCursor: [number, number];
  logicalToVisualMap: Array<Array<[number, number]>>; // 对于每个逻辑行，一个 [visualLineIndex, startColInLogical] 数组
  visualToLogicalMap: Array<[number, number]>; // 对于每个视觉行，其 [logicalLineIndex, startColInLogical]
} {
  const visualLines: string[] = [];
  const logicalToVisualMap: Array<Array<[number, number]>> = [];
  const visualToLogicalMap: Array<[number, number]> = [];
  let currentVisualCursor: [number, number] = [0, 0];

  logicalLines.forEach((logLine, logIndex) => {
    logicalToVisualMap[logIndex] = [];
    if (logLine.length === 0) {
      // 处理空逻辑行
      logicalToVisualMap[logIndex].push([visualLines.length, 0]);
      visualToLogicalMap.push([logIndex, 0]);
      visualLines.push('');
      if (logIndex === logicalCursor[0] && logicalCursor[1] === 0) {
        currentVisualCursor = [visualLines.length - 1, 0];
      }
    } else {
      // 非空逻辑行
      let currentPosInLogLine = 0; // 跟踪当前逻辑行内的位置（代码点索引）
      const codePointsInLogLine = toCodePoints(logLine);

      while (currentPosInLogLine < codePointsInLogLine.length) {
        let currentChunk = '';
        let currentChunkVisualWidth = 0;
        let numCodePointsInChunk = 0;
        let lastWordBreakPoint = -1; // 代码点索引中的单词断点
        let numCodePointsAtLastWordBreak = 0;

        // 遍历代码点以构建当前视觉行（块）
        for (let i = currentPosInLogLine; i < codePointsInLogLine.length; i++) {
          const char = codePointsInLogLine[i];
          const charVisualWidth = stringWidth(char);

          if (currentChunkVisualWidth + charVisualWidth > viewportWidth) {
            // 字符将超出视口宽度
            if (
              lastWordBreakPoint !== -1 &&
              numCodePointsAtLastWordBreak > 0 &&
              currentPosInLogLine + numCodePointsAtLastWordBreak < i
            ) {
              // 我们有一个有效的单词断点可以使用，并且它不是当前段的开始
              currentChunk = codePointsInLogLine
                .slice(
                  currentPosInLogLine,
                  currentPosInLogLine + numCodePointsAtLastWordBreak,
                )
                .join('');
              numCodePointsInChunk = numCodePointsAtLastWordBreak;
            } else {
              // 没有单词断点，或者单词断点在当前潜在块的开始，或者单词断点导致空块。
              // 强制断行：取达到视口宽度的字符，或者如果单个字符太宽则取该字符。
              if (
                numCodePointsInChunk === 0 &&
                charVisualWidth > viewportWidth
              ) {
                // 单个字符比视口宽，无论如何都要取它
                currentChunk = char;
                numCodePointsInChunk = 1;
              } else if (
                numCodePointsInChunk === 0 &&
                charVisualWidth <= viewportWidth
              ) {
                // 这种情况理想情况下应该由下一次迭代捕获（如果字符合适）。
                // 如果不合适（因为 currentChunkVisualWidth 已经大于 0，来自一个填满行的前一个字符），
                // 那么 numCodePointsInChunk 不会是 0。
                // 这个分支意味着当前字符本身不适合空行，这由上面处理。
                // 如果我们在这里，意味着循环应该中断，当前块（它是空的）被最终确定。
              }
            }
            break; // 从中断循环以最终确定此块
          }

          currentChunk += char;
          currentChunkVisualWidth += charVisualWidth;
          numCodePointsInChunk++;

          // 检查单词断点机会（空格）
          if (char === ' ') {
            lastWordBreakPoint = i; // 存储空格的代码点索引
            // 存储添加空格之前的状态，如果我们决定在这里断行。
            numCodePointsAtLastWordBreak = numCodePointsInChunk - 1; // 空格之前的字符
          }
        }

        // 如果内部循环完成而没有中断（即剩余文本适合）
        // 或者如果循环中断但 numCodePointsInChunk 仍然是 0（例如第一个字符对于空行来说太宽）
        if (
          numCodePointsInChunk === 0 &&
          currentPosInLogLine < codePointsInLogLine.length
        ) {
          // 当新视觉行的第一个字符比视口更宽时可能发生这种情况。
          // 在这种情况下，我们取那个单个字符。
          const firstChar = codePointsInLogLine[currentPosInLogLine];
          currentChunk = firstChar;
          numCodePointsInChunk = 1; // 确保我们前进
        }

        // 如果在一切之后，numCodePointsInChunk 仍然是 0 但我们还没有处理完整个逻辑行，
        // 这意味着有问题，比如 viewportWidth 为 0 或更小。避免无限循环。
        if (
          numCodePointsInChunk === 0 &&
          currentPosInLogLine < codePointsInLogLine.length
        ) {
          // 强制前进一个字符以防止出错时的无限循环
          currentChunk = codePointsInLogLine[currentPosInLogLine];
          numCodePointsInChunk = 1;
        }

        logicalToVisualMap[logIndex].push([
          visualLines.length,
          currentPosInLogLine,
        ]);
        visualToLogicalMap.push([logIndex, currentPosInLogLine]);
        visualLines.push(currentChunk);

        // 光标映射逻辑
        // 注意：这里的 currentPosInLogLine 是当前块在逻辑行中的开始。
        if (logIndex === logicalCursor[0]) {
          const cursorLogCol = logicalCursor[1]; // 这是一个代码点索引
          if (
            cursorLogCol >= currentPosInLogLine &&
            cursorLogCol < currentPosInLogLine + numCodePointsInChunk // 光标在此块内
          ) {
            currentVisualCursor = [
              visualLines.length - 1,
              cursorLogCol - currentPosInLogLine, // 视觉列也是视觉行内的代码点索引
            ];
          } else if (
            cursorLogCol === currentPosInLogLine + numCodePointsInChunk &&
            numCodePointsInChunk > 0
          ) {
            // 光标正好在此非空块的末尾
            currentVisualCursor = [
              visualLines.length - 1,
              numCodePointsInChunk,
            ];
          }
        }

        const logicalStartOfThisChunk = currentPosInLogLine;
        currentPosInLogLine += numCodePointsInChunk;

        // 如果处理的块没有消耗整个逻辑行，
        // 并且紧跟在块后面的字符是空格，
        // 则跳过此空格，因为它作为单词换行的分隔符。
        if (
          logicalStartOfThisChunk + numCodePointsInChunk <
            codePointsInLogLine.length &&
          currentPosInLogLine < codePointsInLogLine.length && // 如果前面为真则冗余，但安全
          codePointsInLogLine[currentPosInLogLine] === ' '
        ) {
          currentPosInLogLine++;
        }
      }
      // 在处理完非空逻辑行的所有块后，
      // 如果光标正好在此逻辑行的末尾，则更新视觉光标。
      if (
        logIndex === logicalCursor[0] &&
        logicalCursor[1] === codePointsInLogLine.length // 光标在逻辑行末尾
      ) {
        const lastVisualLineIdx = visualLines.length - 1;
        if (
          lastVisualLineIdx >= 0 &&
          visualLines[lastVisualLineIdx] !== undefined
        ) {
          currentVisualCursor = [
            lastVisualLineIdx,
            cpLen(visualLines[lastVisualLineIdx]), // 光标在此逻辑行的最后一个视觉行末尾
          ];
        }
      }
    }
  });

  // 如果整个逻辑文本为空，确保有一个空的视觉行。
  if (
    logicalLines.length === 0 ||
    (logicalLines.length === 1 && logicalLines[0] === '')
  ) {
    if (visualLines.length === 0) {
      visualLines.push('');
      if (!logicalToVisualMap[0]) logicalToVisualMap[0] = [];
      logicalToVisualMap[0].push([0, 0]);
      visualToLogicalMap.push([0, 0]);
    }
    currentVisualCursor = [0, 0];
  }
  // 处理光标在文本末尾的情况（在所有处理之后）
  // 这种情况现在可能已被循环结束条件覆盖，但为了安全起见保留。
  else if (
    logicalCursor[0] === logicalLines.length - 1 &&
    logicalCursor[1] === cpLen(logicalLines[logicalLines.length - 1]) &&
    visualLines.length > 0
  ) {
    const lastVisLineIdx = visualLines.length - 1;
    currentVisualCursor = [lastVisLineIdx, cpLen(visualLines[lastVisLineIdx])];
  }

  return {
    visualLines,
    visualCursor: currentVisualCursor,
    logicalToVisualMap,
    visualToLogicalMap,
  };
}

// --- 开始 reducer 逻辑 ---

interface TextBufferState {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  preferredCol: number | null; // 这是视觉首选列
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];
  clipboard: string | null;
  selectionAnchor: [number, number] | null;
  viewportWidth: number;
}

const historyLimit = 100;

type TextBufferAction =
  | { type: 'set_text'; payload: string; pushToUndo?: boolean }
  | { type: 'insert'; payload: string }
  | { type: 'backspace' }
  | {
      type: 'move';
      payload: {
        dir: Direction;
      };
    }
  | { type: 'delete' }
  | { type: 'delete_word_left' }
  | { type: 'delete_word_right' }
  | { type: 'kill_line_right' }
  | { type: 'kill_line_left' }
  | { type: 'undo' }
  | { type: 'redo' }
  | {
      type: 'replace_range';
      payload: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
        text: string;
      };
    }
  | { type: 'move_to_offset'; payload: { offset: number } }
  | { type: 'create_undo_snapshot' }
  | { type: 'set_viewport_width'; payload: number };

export function textBufferReducer(
  state: TextBufferState,
  action: TextBufferAction,
): TextBufferState {
  const pushUndo = (currentState: TextBufferState): TextBufferState => {
    const snapshot = {
      lines: [...currentState.lines],
      cursorRow: currentState.cursorRow,
      cursorCol: currentState.cursorCol,
    };
    const newStack = [...currentState.undoStack, snapshot];
    if (newStack.length > historyLimit) {
      newStack.shift();
    }
    return { ...currentState, undoStack: newStack, redoStack: [] };
  };

  const currentLine = (r: number): string => state.lines[r] ?? '';
  const currentLineLen = (r: number): number => cpLen(currentLine(r));

  switch (action.type) {
    case 'set_text': {
      let nextState = state;
      if (action.pushToUndo !== false) {
        nextState = pushUndo(state);
      }
      const newContentLines = action.payload
        .replace(/\r\n?/g, '\n')
        .split('\n');
      const lines = newContentLines.length === 0 ? [''] : newContentLines;
      const lastNewLineIndex = lines.length - 1;
      return {
        ...nextState,
        lines,
        cursorRow: lastNewLineIndex,
        cursorCol: cpLen(lines[lastNewLineIndex] ?? ''),
        preferredCol: null,
      };
    }

    case 'insert': {
      const nextState = pushUndo(state);
      const newLines = [...nextState.lines];
      let newCursorRow = nextState.cursorRow;
      let newCursorCol = nextState.cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      const str = stripUnsafeCharacters(
        action.payload.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      );
      const parts = str.split('\n');
      const lineContent = currentLine(newCursorRow);
      const before = cpSlice(lineContent, 0, newCursorCol);
      const after = cpSlice(lineContent, newCursorCol);

      if (parts.length > 1) {
        newLines[newCursorRow] = before + parts[0];
        const remainingParts = parts.slice(1);
        const lastPartOriginal = remainingParts.pop() ?? '';
        newLines.splice(newCursorRow + 1, 0, ...remainingParts);
        newLines.splice(
          newCursorRow + parts.length - 1,
          0,
          lastPartOriginal + after,
        );
        newCursorRow = newCursorRow + parts.length - 1;
        newCursorCol = cpLen(lastPartOriginal);
      } else {
        newLines[newCursorRow] = before + parts[0] + after;
        newCursorCol = cpLen(before) + cpLen(parts[0]);
      }

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
      };
    }

    case 'backspace': {
      const nextState = pushUndo(state);
      const newLines = [...nextState.lines];
      let newCursorRow = nextState.cursorRow;
      let newCursorCol = nextState.cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      if (newCursorCol === 0 && newCursorRow === 0) return state;

      if (newCursorCol > 0) {
        const lineContent = currentLine(newCursorRow);
        newLines[newCursorRow] =
          cpSlice(lineContent, 0, newCursorCol - 1) +
          cpSlice(lineContent, newCursorCol);
        newCursorCol--;
      } else if (newCursorRow > 0) {
        const prevLineContent = currentLine(newCursorRow - 1);
        const currentLineContentVal = currentLine(newCursorRow);
        const newCol = cpLen(prevLineContent);
        newLines[newCursorRow - 1] = prevLineContent + currentLineContentVal;
        newLines.splice(newCursorRow, 1);
        newCursorRow--;
        newCursorCol = newCol;
      }

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
      };
    }

    case 'set_viewport_width': {
      if (action.payload === state.viewportWidth) {
        return state;
      }
      return { ...state, viewportWidth: action.payload };
    }

    case 'move': {
      const { dir } = action.payload;
      const { lines, cursorRow, cursorCol, viewportWidth } = state;
      const visualLayout = calculateVisualLayout(
        lines,
        [cursorRow, cursorCol],
        viewportWidth,
      );
      const { visualLines, visualCursor, visualToLogicalMap } = visualLayout;

      let newVisualRow = visualCursor[0];
      let newVisualCol = visualCursor[1];
      let newPreferredCol = state.preferredCol;

      const currentVisLineLen = cpLen(visualLines[newVisualRow] ?? '');

      switch (dir) {
        case 'left':
          newPreferredCol = null;
          if (newVisualCol > 0) {
            newVisualCol--;
          } else if (newVisualRow > 0) {
            newVisualRow--;
            newVisualCol = cpLen(visualLines[newVisualRow] ?? '');
          }
          break;
        case 'right':
          newPreferredCol = null;
          if (newVisualCol < currentVisLineLen) {
            newVisualCol++;
          } else if (newVisualRow < visualLines.length - 1) {
            newVisualRow++;
            newVisualCol = 0;
          }
          break;
        case 'up':
          if (newVisualRow > 0) {
            if (newPreferredCol === null) newPreferredCol = newVisualCol;
            newVisualRow--;
            newVisualCol = clamp(
              newPreferredCol,
              0,
              cpLen(visualLines[newVisualRow] ?? ''),
            );
          }
          break;
        case 'down':
          if (newVisualRow < visualLines.length - 1) {
            if (newPreferredCol === null) newPreferredCol = newVisualCol;
            newVisualRow++;
            newVisualCol = clamp(
              newPreferredCol,
              0,
              cpLen(visualLines[newVisualRow] ?? ''),
            );
          }
          break;
        case 'home':
          newPreferredCol = null;
          newVisualCol = 0;
          break;
        case 'end':
          newPreferredCol = null;
          newVisualCol = currentVisLineLen;
          break;
        case 'wordLeft': {
          const { cursorRow, cursorCol, lines } = state;
          if (cursorCol === 0 && cursorRow === 0) return state;

          let newCursorRow = cursorRow;
          let newCursorCol = cursorCol;

          if (cursorCol === 0) {
            newCursorRow--;
            newCursorCol = cpLen(lines[newCursorRow] ?? '');
          } else {
            const lineContent = lines[cursorRow];
            const arr = toCodePoints(lineContent);
            let start = cursorCol;
            let onlySpaces = true;
            for (let i = 0; i < start; i++) {
              if (isWordChar(arr[i])) {
                onlySpaces = false;
                break;
              }
            }
            if (onlySpaces && start > 0) {
              start--;
            } else {
              while (start > 0 && !isWordChar(arr[start - 1])) start--;
              while (start > 0 && isWordChar(arr[start - 1])) start--;
            }
            newCursorCol = start;
          }
          return {
            ...state,
            cursorRow: newCursorRow,
            cursorCol: newCursorCol,
            preferredCol: null,
          };
        }
        case 'wordRight': {
          const { cursorRow, cursorCol, lines } = state;
          if (
            cursorRow === lines.length - 1 &&
            cursorCol === cpLen(lines[cursorRow] ?? '')
          ) {
            return state;
          }

          let newCursorRow = cursorRow;
          let newCursorCol = cursorCol;
          const lineContent = lines[cursorRow] ?? '';
          const arr = toCodePoints(lineContent);

          if (cursorCol >= arr.length) {
            newCursorRow++;
            newCursorCol = 0;
          } else {
            let end = cursorCol;
            while (end < arr.length && !isWordChar(arr[end])) end++;
            while (end < arr.length && isWordChar(arr[end])) end++;
            newCursorCol = end;
          }
          return {
            ...state,
            cursorRow: newCursorRow,
            cursorCol: newCursorCol,
            preferredCol: null,
          };
        }
        default:
          break;
      }

      if (visualToLogicalMap[newVisualRow]) {
        const [logRow, logStartCol] = visualToLogicalMap[newVisualRow];
        return {
          ...state,
          cursorRow: logRow,
          cursorCol: clamp(
            logStartCol + newVisualCol,
            0,
            cpLen(state.lines[logRow] ?? ''),
          ),
          preferredCol: newPreferredCol,
        };
      }
      return state;
    }

    case 'delete': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      if (cursorCol < currentLineLen(cursorRow)) {
        const nextState = pushUndo(state);
        const newLines = [...nextState.lines];
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) +
          cpSlice(lineContent, cursorCol + 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      } else if (cursorRow < lines.length - 1) {
        const nextState = pushUndo(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      return state;
    }

    case 'delete_word_left': {
      const { cursorRow, cursorCol } = state;
      if (cursorCol === 0 && cursorRow === 0) return state;
      if (cursorCol === 0) {
        // 作为退格键操作
        const nextState = pushUndo(state);
        const prevLineContent = currentLine(cursorRow - 1);
        const currentLineContentVal = currentLine(cursorRow);
        const newCol = cpLen(prevLineContent);
        const newLines = [...nextState.lines];
        newLines[cursorRow - 1] = prevLineContent + currentLineContentVal;
        newLines.splice(cursorRow, 1);
        return {
          ...nextState,
          lines: newLines,
          cursorRow: cursorRow - 1,
          cursorCol: newCol,
          preferredCol: null,
        };
      }
      const nextState = pushUndo(state);
      const lineContent = currentLine(cursorRow);
      const arr = toCodePoints(lineContent);
      let start = cursorCol;
      let onlySpaces = true;
      for (let i = 0; i < start; i++) {
        if (isWordChar(arr[i])) {
          onlySpaces = false;
          break;
        }
      }
      if (onlySpaces && start > 0) {
        start--;
      } else {
        while (start > 0 && !isWordChar(arr[start - 1])) start--;
        while (start > 0 && isWordChar(arr[start - 1])) start--;
      }
      const newLines = [...nextState.lines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, start) + cpSlice(lineContent, cursorCol);
      return {
        ...nextState,
        lines: newLines,
        cursorCol: start,
        preferredCol: null,
      };
    }

    case 'delete_word_right': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      const arr = toCodePoints(lineContent);
      if (cursorCol >= arr.length && cursorRow === lines.length - 1)
        return state;
      if (cursorCol >= arr.length) {
        // 作为删除键操作
        const nextState = pushUndo(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      const nextState = pushUndo(state);
      let end = cursorCol;
      while (end < arr.length && !isWordChar(arr[end])) end++;
      while (end < arr.length && isWordChar(arr[end])) end++;
      const newLines = [...nextState.lines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, cursorCol) + cpSlice(lineContent, end);
      return { ...nextState, lines: newLines, preferredCol: null };
    }

    case 'kill_line_right': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      if (cursorCol < currentLineLen(cursorRow)) {
        const nextState = pushUndo(state);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = cpSlice(lineContent, 0, cursorCol);
        return { ...nextState, lines: newLines };
      } else if (cursorRow < lines.length - 1) {
        // 作为删除键操作
        const nextState = pushUndo(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      return state;
    }

    case 'kill_line_left': {
      const { cursorRow, cursorCol } = state;
      if (cursorCol > 0) {
        const nextState = pushUndo(state);
        const lineContent = currentLine(cursorRow);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = cpSlice(lineContent, cursorCol);
        return {
          ...nextState,
          lines: newLines,
          cursorCol: 0,
          preferredCol: null,
        };
      }
      return state;
    }

    case 'undo': {
      const stateToRestore = state.undoStack[state.undoStack.length - 1];
      if (!stateToRestore) return state;

      const currentSnapshot = {
        lines: [...state.lines],
        cursorRow: state.cursorRow,
        cursorCol: state.cursorCol,
      };
      return {
        ...state,
        ...stateToRestore,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, currentSnapshot],
      };
    }

    case 'redo': {
      const stateToRestore = state.redoStack[state.redoStack.length - 1];
      if (!stateToRestore) return state;

      const currentSnapshot = {
        lines: [...state.lines],
        cursorRow: state.cursorRow,
        cursorCol: state.cursorCol,
      };
      return {
        ...state,
        ...stateToRestore,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, currentSnapshot],
      };
    }

    case 'replace_range': {
      const { startRow, startCol, endRow, endCol, text } = action.payload;
      if (
        startRow > endRow ||
        (startRow === endRow && startCol > endCol) ||
        startRow < 0 ||
        startCol < 0 ||
        endRow >= state.lines.length ||
        (endRow < state.lines.length && endCol > currentLineLen(endRow))
      ) {
        return state; // 无效范围
      }

      const nextState = pushUndo(state);
      const newLines = [...nextState.lines];

      const sCol = clamp(startCol, 0, currentLineLen(startRow));
      const eCol = clamp(endCol, 0, currentLineLen(endRow));

      const prefix = cpSlice(currentLine(startRow), 0, sCol);
      const suffix = cpSlice(currentLine(endRow), eCol);

      const normalisedReplacement = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      const replacementParts = normalisedReplacement.split('\n');

      // 替换内容
      if (startRow === endRow) {
        newLines[startRow] = prefix + normalisedReplacement + suffix;
      } else {
        const firstLine = prefix + replacementParts[0];
        if (replacementParts.length === 1) {
          // 单行替换文本，但跨越多个原始行
          newLines.splice(startRow, endRow - startRow + 1, firstLine + suffix);
        } else {
          // 多行替换文本
          const lastLine =
            replacementParts[replacementParts.length - 1] + suffix;
          const middleLines = replacementParts.slice(1, -1);
          newLines.splice(
            startRow,
            endRow - startRow + 1,
            firstLine,
            ...middleLines,
            lastLine,
          );
        }
      }

      const finalCursorRow = startRow + replacementParts.length - 1;
      const finalCursorCol =
        (replacementParts.length > 1 ? 0 : sCol) +
        cpLen(replacementParts[replacementParts.length - 1]);

      return {
        ...nextState,
        lines: newLines,
        cursorRow: finalCursorRow,
        cursorCol: finalCursorCol,
        preferredCol: null,
      };
    }

    case 'move_to_offset': {
      const { offset } = action.payload;
      const [newRow, newCol] = offsetToLogicalPos(
        state.lines.join('\n'),
        offset,
      );
      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'create_undo_snapshot': {
      return pushUndo(state);
    }

    default: {
      const exhaustiveCheck: never = action;
      console.error(`遇到未知操作: ${exhaustiveCheck}`);
      return state;
    }
  }
}

// --- 结束 reducer 逻辑 ---

export function useTextBuffer({
  initialText = '',
  initialCursorOffset = 0,
  viewport,
  stdin,
  setRawMode,
  onChange,
  isValidPath,
  shellModeActive = false,
}: UseTextBufferProps): TextBuffer {
  const initialState = useMemo((): TextBufferState => {
    const lines = initialText.split('\n');
    const [initialCursorRow, initialCursorCol] = calculateInitialCursorPosition(
      lines.length === 0 ? [''] : lines,
      initialCursorOffset,
    );
    return {
      lines: lines.length === 0 ? [''] : lines,
      cursorRow: initialCursorRow,
      cursorCol: initialCursorCol,
      preferredCol: null,
      undoStack: [],
      redoStack: [],
      clipboard: null,
      selectionAnchor: null,
      viewportWidth: viewport.width,
    };
  }, [initialText, initialCursorOffset, viewport.width]);

  const [state, dispatch] = useReducer(textBufferReducer, initialState);
  const { lines, cursorRow, cursorCol, preferredCol, selectionAnchor } = state;

  const text = useMemo(() => lines.join('\n'), [lines]);

  const visualLayout = useMemo(
    () =>
      calculateVisualLayout(lines, [cursorRow, cursorCol], state.viewportWidth),
    [lines, cursorRow, cursorCol, state.viewportWidth],
  );

  const { visualLines, visualCursor } = visualLayout;

  const [visualScrollRow, setVisualScrollRow] = useState<number>(0);

  useEffect(() => {
    if (onChange) {
      onChange(text);
    }
  }, [text, onChange]);

  useEffect(() => {
    dispatch({ type: 'set_viewport_width', payload: viewport.width });
  }, [viewport.width]);

  // 更新视觉滚动（垂直）
  useEffect(() => {
    const { height } = viewport;
    let newVisualScrollRow = visualScrollRow;

    if (visualCursor[0] < visualScrollRow) {
      newVisualScrollRow = visualCursor[0];
    } else if (visualCursor[0] >= visualScrollRow + height) {
      newVisualScrollRow = visualCursor[0] - height + 1;
    }
    if (newVisualScrollRow !== visualScrollRow) {
      setVisualScrollRow(newVisualScrollRow);
    }
  }, [visualCursor, visualScrollRow, viewport]);

  const insert = useCallback(
    (ch: string): void => {
      if (/[\n\r]/.test(ch)) {
        dispatch({ type: 'insert', payload: ch });
        return;
      }

      const minLengthToInferAsDragDrop = 3;
      if (ch.length >= minLengthToInferAsDragDrop && !shellModeActive) {
        let potentialPath = ch;
        if (
          potentialPath.length > 2 &&
          potentialPath.startsWith("'") &&
          potentialPath.endsWith("'")
        ) {
          potentialPath = ch.slice(1, -1);
        }

        potentialPath = potentialPath.trim();
        if (isValidPath(unescapePath(potentialPath))) {
          ch = `@${potentialPath}`;
        }
      }

      let currentText = '';
      for (const char of toCodePoints(ch)) {
        if (char.codePointAt(0) === 127) {
          if (currentText.length > 0) {
            dispatch({ type: 'insert', payload: currentText });
            currentText = '';
          }
          dispatch({ type: 'backspace' });
        } else {
          currentText += char;
        }
      }
      if (currentText.length > 0) {
        dispatch({ type: 'insert', payload: currentText });
      }
    },
    [isValidPath, shellModeActive],
  );

  const newline = useCallback((): void => {
    dispatch({ type: 'insert', payload: '\n' });
  }, []);

  const backspace = useCallback((): void => {
    dispatch({ type: 'backspace' });
  }, []);

  const del = useCallback((): void => {
    dispatch({ type: 'delete' });
  }, []);

  const move = useCallback((dir: Direction): void => {
    dispatch({ type: 'move', payload: { dir } });
  }, []);

  const undo = useCallback((): void => {
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback((): void => {
    dispatch({ type: 'redo' });
  }, []);

  const setText = useCallback((newText: string): void => {
    dispatch({ type: 'set_text', payload: newText });
  }, []);

  const deleteWordLeft = useCallback((): void => {
    dispatch({ type: 'delete_word_left' });
  }, []);

  const deleteWordRight = useCallback((): void => {
    dispatch({ type: 'delete_word_right' });
  }, []);

  const killLineRight = useCallback((): void => {
    dispatch({ type: 'kill_line_right' });
  }, []);

  const killLineLeft = useCallback((): void => {
    dispatch({ type: 'kill_line_left' });
  }, []);

  const openInExternalEditor = useCallback(
    async (opts: { editor?: string } = {}): Promise<void> => {
      const editor =
        opts.editor ??
        process.env['VISUAL'] ??
        process.env['EDITOR'] ??
        (process.platform === 'win32' ? 'notepad' : 'vi');
      const tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'gemini-edit-'));
      const filePath = pathMod.join(tmpDir, 'buffer.txt');
      fs.writeFileSync(filePath, text, 'utf8');

      dispatch({ type: 'create_undo_snapshot' });

      const wasRaw = stdin?.isRaw ?? false;
      try {
        setRawMode?.(false);
        const { status, error } = spawnSync(editor, [filePath], {
          stdio: 'inherit',
        });
        if (error) throw error;
        if (typeof status === 'number' && status !== 0)
          throw new Error(`外部编辑器退出状态为 ${status}`);

        let newText = fs.readFileSync(filePath, 'utf8');
        newText = newText.replace(/\r\n?/g, '\n');
        dispatch({ type: 'set_text', payload: newText, pushToUndo: false });
      } catch (err) {
        console.error('[useTextBuffer] 外部编辑器错误', err);
      } finally {
        if (wasRaw) setRawMode?.(true);
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* 忽略 */
        }
        try {
          fs.rmdirSync(tmpDir);
        } catch {
          /* 忽略 */
        }
      }
    },
    [text, stdin, setRawMode],
  );

  const handleInput = useCallback(
    (key: {
      name: string;
      ctrl: boolean;
      meta: boolean;
      shift: boolean;
      paste: boolean;
      sequence: string;
    }): void => {
      const { sequence: input } = key;

      if (
        key.name === 'return' ||
        input === '\r' ||
        input === '\n' ||
        input === '\\\r' // VSCode 终端以这种方式表示 shift + enter
      )
        newline();
      else if (key.name === 'left' && !key.meta && !key.ctrl) move('left');
      else if (key.ctrl && key.name === 'b') move('left');
      else if (key.name === 'right' && !key.meta && !key.ctrl) move('right');
      else if (key.ctrl && key.name === 'f') move('right');
      else if (key.name === 'up') move('up');
      else if (key.name === 'down') move('down');
      else if ((key.ctrl || key.meta) && key.name === 'left') move('wordLeft');
      else if (key.meta && key.name === 'b') move('wordLeft');
      else if ((key.ctrl || key.meta) && key.name === 'right')
        move('wordRight');
      else if (key.meta && key.name === 'f') move('wordRight');
      else if (key.name === 'home') move('home');
      else if (key.ctrl && key.name === 'a') move('home');
      else if (key.name === 'end') move('end');
      else if (key.ctrl && key.name === 'e') move('end');
      else if (key.ctrl && key.name === 'w') deleteWordLeft();
      else if (
        (key.meta || key.ctrl) &&
        (key.name === 'backspace' || input === '\x7f')
      )
        deleteWordLeft();
      else if ((key.meta || key.ctrl) && key.name === 'delete')
        deleteWordRight();
      else if (
        key.name === 'backspace' ||
        input === '\x7f' ||
        (key.ctrl && key.name === 'h')
      )
        backspace();
      else if (key.name === 'delete' || (key.ctrl && key.name === 'd')) del();
      else if (input && !key.ctrl && !key.meta) {
        insert(input);
      }
    },
    [newline, move, deleteWordLeft, deleteWordRight, backspace, del, insert],
  );

  const renderedVisualLines = useMemo(
    () => visualLines.slice(visualScrollRow, visualScrollRow + viewport.height),
    [visualLines, visualScrollRow, viewport.height],
  );

  const replaceRange = useCallback(
    (
      startRow: number,
      startCol: number,
      endRow: number,
      endCol: number,
      text: string,
    ): void => {
      dispatch({
        type: 'replace_range',
        payload: { startRow, startCol, endRow, endCol, text },
      });
    },
    [],
  );

  const replaceRangeByOffset = useCallback(
    (startOffset: number, endOffset: number, replacementText: string): void => {
      const [startRow, startCol] = offsetToLogicalPos(text, startOffset);
      const [endRow, endCol] = offsetToLogicalPos(text, endOffset);
      replaceRange(startRow, startCol, endRow, endCol, replacementText);
    },
    [text, replaceRange],
  );

  const moveToOffset = useCallback((offset: number): void => {
    dispatch({ type: 'move_to_offset', payload: { offset } });
  }, []);

  const returnValue: TextBuffer = {
    lines,
    text,
    cursor: [cursorRow, cursorCol],
    preferredCol,
    selectionAnchor,

    allVisualLines: visualLines,
    viewportVisualLines: renderedVisualLines,
    visualCursor,
    visualScrollRow,

    setText,
    insert,
    newline,
    backspace,
    del,
    move,
    undo,
    redo,
    replaceRange,
    replaceRangeByOffset,
    moveToOffset,
    deleteWordLeft,
    deleteWordRight,
    killLineRight,
    killLineLeft,
    handleInput,
    openInExternalEditor,
  };
  return returnValue;
}

export interface TextBuffer {
  // 状态
  lines: string[]; // 逻辑行
  text: string;
  cursor: [number, number]; // 逻辑光标 [行, 列]
  /**
   * 当用户垂直移动光标时，我们尝试保持他们的原始
   * 水平列，即使通过较短的行。我们在用户仍在垂直移动时
   * 记住该*首选*列。任何显式的水平移动都会重置首选项。
   */
  preferredCol: number | null; // 首选视觉列
  selectionAnchor: [number, number] | null; // 逻辑选择锚点

  // 视觉状态（处理换行）
  allVisualLines: string[]; // 当前文本和视口宽度的所有视觉行。
  viewportVisualLines: string[]; // 基于 visualScrollRow 和 viewport.height 要渲染的视觉行子集
  visualCursor: [number, number]; // 相对于所有视觉行开始的视觉光标 [行, 列]
  visualScrollRow: number; // 视觉行的滚动位置（第一个可见视觉行的索引）

  // 操作

  /**
   * 用提供的文本替换整个缓冲区内容。
   * 该操作可撤销。
   */
  setText: (text: string) => void;
  /**
   * 插入单个字符或不包含换行符的字符串。
   */
  insert: (ch: string) => void;
  newline: () => void;
  backspace: () => void;
  del: () => void;
  move: (dir: Direction) => void;
  undo: () => void;
  redo: () => void;
  /**
   * 用新文本替换指定范围内的文本。
   * 处理单行和多行范围。
   *
   * @param startRow 起始行索引（包含）。
   * @param startCol 起始列索引（包含，基于代码点）。
   * @param endRow 结束行索引（包含）。
   * @param endCol 结束列索引（排除，基于代码点）。
   * @param text 要插入的新文本。
   * @returns 如果缓冲区被修改则返回 true，否则返回 false。
   */
  replaceRange: (
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string,
  ) => void;
  /**
   * 删除光标*左侧*的单词，模拟编辑器和终端中常见的
   * Ctrl/Alt+Backspace 行为。删除紧邻光标前的空白字符
   * 和单词字符。如果光标已经在第 0 列，则此操作无效。
   */
  deleteWordLeft: () => void;
  /**
   * 删除光标*右侧*的单词，类似于许多编辑器的
   * Ctrl/Alt+Delete 快捷方式。删除光标后跟随的任何空白/标点符号
   * 和下一个连续的单词字符。
   */
  deleteWordRight: () => void;
  /**
   * 删除从光标到当前行末尾的文本。
   */
  killLineRight: () => void;
  /**
   * 删除从当前行开始到光标的文本。
   */
  killLineLeft: () => void;
  /**
   * 高级 "handleInput" – 接收 Ink 提供给我们的内容。
   */
  handleInput: (key: {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    paste: boolean;
    sequence: string;
  }) => void;
  /**
   * 在用户的首选终端文本编辑器中打开当前缓冲区内容
   * （$VISUAL 或 $EDITOR，回退到 "vi"）。该方法阻塞
   * 直到编辑器退出，然后重新加载文件并用用户保存的内容
   * 替换内存中的缓冲区。
   *
   * 该操作被视为单个可撤销编辑 – 我们在启动编辑器之前
   * *一次*快照前一个状态，因此一次 `undo()` 将
   * 撤销整个变更集。
   *
   * 注意：我们故意依赖*同步* spawn API，以便
   * 调用进程在继续之前真正等待编辑器关闭。
   * 这模仿了 Git 的行为并简化了下游
   * 控制流（调用者可以简单地 `await` Promise）。
   */
  openInExternalEditor: (opts?: { editor?: string }) => Promise<void>;

  replaceRangeByOffset: (
    startOffset: number,
    endOffset: number,
    replacementText: string,
  ) => void;
  moveToOffset(offset: number): void;
}