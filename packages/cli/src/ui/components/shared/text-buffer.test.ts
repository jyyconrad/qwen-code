/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTextBuffer,
  Viewport,
  TextBuffer,
  offsetToLogicalPos,
  textBufferReducer,
  TextBufferState,
  TextBufferAction,
} from './text-buffer.js';

const initialState: TextBufferState = {
  lines: [''],
  cursorRow: 0,
  cursorCol: 0,
  preferredCol: null,
  undoStack: [],
  redoStack: [],
  clipboard: null,
  selectionAnchor: null,
};

describe('textBufferReducer', () => {
  it('如果状态未定义，应返回初始状态', () => {
    const action = { type: 'unknown_action' } as unknown as TextBufferAction;
    const state = textBufferReducer(initialState, action);
    expect(state).toEqual(initialState);
  });

  describe('set_text 操作', () => {
    it('应设置新文本并将光标移至末尾', () => {
      const action: TextBufferAction = {
        type: 'set_text',
        payload: 'hello\nworld',
      };
      const state = textBufferReducer(initialState, action);
      expect(state.lines).toEqual(['hello', 'world']);
      expect(state.cursorRow).toBe(1);
      expect(state.cursorCol).toBe(5);
      expect(state.undoStack.length).toBe(1);
    });

    it('如果 pushToUndo 为 false，则不应创建撤销快照', () => {
      const action: TextBufferAction = {
        type: 'set_text',
        payload: 'no undo',
        pushToUndo: false,
      };
      const state = textBufferReducer(initialState, action);
      expect(state.lines).toEqual(['no undo']);
      expect(state.undoStack.length).toBe(0);
    });
  });

  describe('insert 操作', () => {
    it('应插入一个字符', () => {
      const action: TextBufferAction = { type: 'insert', payload: 'a' };
      const state = textBufferReducer(initialState, action);
      expect(state.lines).toEqual(['a']);
      expect(state.cursorCol).toBe(1);
    });

    it('应插入一个换行符', () => {
      const stateWithText = { ...initialState, lines: ['hello'] };
      const action: TextBufferAction = { type: 'insert', payload: '\n' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['', 'hello']);
      expect(state.cursorRow).toBe(1);
      expect(state.cursorCol).toBe(0);
    });
  });

  describe('backspace 操作', () => {
    it('应删除一个字符', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['a'],
        cursorRow: 0,
        cursorCol: 1,
      };
      const action: TextBufferAction = { type: 'backspace' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['']);
      expect(state.cursorCol).toBe(0);
    });

    it('如果在行首，则应连接行', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello', 'world'],
        cursorRow: 1,
        cursorCol: 0,
      };
      const action: TextBufferAction = { type: 'backspace' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['helloworld']);
      expect(state.cursorRow).toBe(0);
      expect(state.cursorCol).toBe(5);
    });
  });

  describe('撤销/重做操作', () => {
    it('应撤销并重做一个更改', () => {
      // 1. 插入文本
      const insertAction: TextBufferAction = {
        type: 'insert',
        payload: 'test',
      };
      const stateAfterInsert = textBufferReducer(initialState, insertAction);
      expect(stateAfterInsert.lines).toEqual(['test']);
      expect(stateAfterInsert.undoStack.length).toBe(1);

      // 2. 撤销
      const undoAction: TextBufferAction = { type: 'undo' };
      const stateAfterUndo = textBufferReducer(stateAfterInsert, undoAction);
      expect(stateAfterUndo.lines).toEqual(['']);
      expect(stateAfterUndo.undoStack.length).toBe(0);
      expect(stateAfterUndo.redoStack.length).toBe(1);

      // 3. 重做
      const redoAction: TextBufferAction = { type: 'redo' };
      const stateAfterRedo = textBufferReducer(stateAfterUndo, redoAction);
      expect(stateAfterRedo.lines).toEqual(['test']);
      expect(stateAfterRedo.undoStack.length).toBe(1);
      expect(stateAfterRedo.redoStack.length).toBe(0);
    });
  });

  describe('create_undo_snapshot 操作', () => {
    it('应创建快照而不更改状态', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello'],
        cursorRow: 0,
        cursorCol: 5,
      };
      const action: TextBufferAction = { type: 'create_undo_snapshot' };
      const state = textBufferReducer(stateWithText, action);

      expect(state.lines).toEqual(['hello']);
      expect(state.cursorRow).toBe(0);
      expect(state.cursorCol).toBe(5);
      expect(state.undoStack.length).toBe(1);
      expect(state.undoStack[0].lines).toEqual(['hello']);
      expect(state.undoStack[0].cursorRow).toBe(0);
      expect(state.undoStack[0].cursorCol).toBe(5);
    });
  });
});

// 从钩子获取状态的辅助函数
const getBufferState = (result: { current: TextBuffer }) => ({
  text: result.current.text,
  lines: [...result.current.lines], // 克隆以确保安全
  cursor: [...result.current.cursor] as [number, number],
  allVisualLines: [...result.current.allVisualLines],
  viewportVisualLines: [...result.current.viewportVisualLines],
  visualCursor: [...result.current.visualCursor] as [number, number],
  visualScrollRow: result.current.visualScrollRow,
  preferredCol: result.current.preferredCol,
});

describe('useTextBuffer', () => {
  let viewport: Viewport;

  beforeEach(() => {
    viewport = { width: 10, height: 3 }; // 测试的默认视口
  });

  describe('初始化', () => {
    it('应默认使用空文本和光标位置 (0,0) 初始化', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('');
      expect(state.lines).toEqual(['']);
      expect(state.cursor).toEqual([0, 0]);
      expect(state.allVisualLines).toEqual(['']);
      expect(state.viewportVisualLines).toEqual(['']);
      expect(state.visualCursor).toEqual([0, 0]);
      expect(state.visualScrollRow).toBe(0);
    });

    it('应使用提供的 initialText 初始化', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello',
          viewport,
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('hello');
      expect(state.lines).toEqual(['hello']);
      expect(state.cursor).toEqual([0, 0]); // 如果未提供偏移量，则为默认光标
      expect(state.allVisualLines).toEqual(['hello']);
      expect(state.viewportVisualLines).toEqual(['hello']);
      expect(state.visualCursor).toEqual([0, 0]);
    });

    it('应使用 initialText 和 initialCursorOffset 初始化', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello\nworld',
          initialCursorOffset: 7, // 应该在 "world" 中的 'o'
          viewport,
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('hello\nworld');
      expect(state.lines).toEqual(['hello', 'world']);
      expect(state.cursor).toEqual([1, 1]); // "world" 中 'o' 的逻辑光标
      expect(state.allVisualLines).toEqual(['hello', 'world']);
      expect(state.viewportVisualLines).toEqual(['hello', 'world']);
      expect(state.visualCursor[0]).toBe(1); // 在第二行视觉行上
      expect(state.visualCursor[1]).toBe(1); // 在 "world" 中的 'o'
    });

    it('应换行视觉行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'The quick brown fox jumps over the lazy dog.',
          initialCursorOffset: 2, // 在 '好' 之后
          viewport: { width: 15, height: 4 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.allVisualLines).toEqual([
        'The quick',
        'brown fox',
        'jumps over the',
        'lazy dog.',
      ]);
    });

    it('应换行包含多个空格的视觉行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'The  quick  brown fox    jumps over the lazy dog.',
          viewport: { width: 15, height: 4 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      // 像这样在行尾包含多个空格与 Google 文档的行为一致，
      // 并使编辑空格变得直观。
      expect(state.allVisualLines).toEqual([
        'The  quick ',
        'brown fox   ',
        'jumps over the',
        'lazy dog.',
      ]);
    });

    it('即使没有空格也应换行视觉行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '123456789012345ABCDEFG', // 4 个字符，12 个字节
          viewport: { width: 15, height: 2 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      // 像这样在行尾包含多个空格与 Google 文档的行为一致，
      // 并使编辑空格变得直观。
      expect(state.allVisualLines).toEqual(['123456789012345', 'ABCDEFG']);
    });

    it('应使用多字节 Unicode 字符和正确的光标偏移初始化', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '你好世界', // 4 个字符，12 个字节
          initialCursorOffset: 2, // 在 '好' 之后
          viewport: { width: 5, height: 2 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('你好世界');
      expect(state.lines).toEqual(['你好世界']);
      expect(state.cursor).toEqual([0, 2]);
      // 视觉： "你好" (宽度 4), "世"界" (宽度 4) 与视口宽度 5
      expect(state.allVisualLines).toEqual(['你好', '世界']);
      expect(state.visualCursor).toEqual([1, 0]);
    });
  });

  describe('基本编辑', () => {
    it('insert: 应插入一个字符并更新光标', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() => result.current.insert('a'));
      let state = getBufferState(result);
      expect(state.text).toBe('a');
      expect(state.cursor).toEqual([0, 1]);
      expect(state.visualCursor).toEqual([0, 1]);

      act(() => result.current.insert('b'));
      state = getBufferState(result);
      expect(state.text).toBe('ab');
      expect(state.cursor).toEqual([0, 2]);
      expect(state.visualCursor).toEqual([0, 2]);
    });

    it('insert: 应在行中间插入文本', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abc',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('right'));
      act(() => result.current.insert('-NEW-'));
      const state = getBufferState(result);
      expect(state.text).toBe('a-NEW-bc');
      expect(state.cursor).toEqual([0, 6]);
    });

    it('newline: 应创建新行并移动光标', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'ab',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // 光标在 [0,2]
      act(() => result.current.newline());
      const state = getBufferState(result);
      expect(state.text).toBe('ab\n');
      expect(state.lines).toEqual(['ab', '']);
      expect(state.cursor).toEqual([1, 0]);
      expect(state.allVisualLines).toEqual(['ab', '']);
      expect(state.viewportVisualLines).toEqual(['ab', '']); // 视口高度 3
      expect(state.visualCursor).toEqual([1, 0]); // 在新的视觉行上
    });

    it('backspace: 应删除左侧字符或合并行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'a\nb',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => {
        result.current.move('down');
      });
      act(() => {
        result.current.move('end'); // 光标到 [1,1] ('b' 的末尾)
      });
      act(() => result.current.backspace()); // 删除 'b'
      let state = getBufferState(result);
      expect(state.text).toBe('a\n');
      expect(state.cursor).toEqual([1, 0]);

      act(() => result.current.backspace()); // 合并行
      state = getBufferState(result);
      expect(state.text).toBe('a');
      expect(state.cursor).toEqual([0, 1]); // 光标在 'a' 之后
      expect(state.allVisualLines).toEqual(['a']);
      expect(state.viewportVisualLines).toEqual(['a']);
      expect(state.visualCursor).toEqual([0, 1]);
    });

    it('del: 应删除右侧字符或合并行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'a\nb',
          viewport,
          isValidPath: () => false,
        }),
      );
      // 光标在 [0,0]
      act(() => result.current.del()); // 删除 'a'
      let state = getBufferState(result);
      expect(state.text).toBe('\nb');
      expect(state.cursor).toEqual([0, 0]);

      act(() => result.current.del()); // 合并行（删除换行符）
      state = getBufferState(result);
      expect(state.text).toBe('b');
      expect(state.cursor).toEqual([0, 0]);
      expect(state.allVisualLines).toEqual(['b']);
      expect(state.viewportVisualLines).toEqual(['b']);
      expect(state.visualCursor).toEqual([0, 0]);
    });
  });

  describe('拖放文件路径', () => {
    it('应在插入时为有效文件路径添加前缀 @', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => true }),
      );
      const filePath = '/path/to/a/valid/file.txt';
      act(() => result.current.insert(filePath));
      expect(getBufferState(result).text).toBe(`@${filePath}`);
    });

    it('不应在插入无效文件路径时添加前缀 @', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const notAPath = 'this is just some long text';
      act(() => result.current.insert(notAPath));
      expect(getBufferState(result).text).toBe(notAPath);
    });

    it('应处理带引号的路径', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => true }),
      );
      const filePath = "'/path/to/a/valid/file.txt'";
      act(() => result.current.insert(filePath));
      expect(getBufferState(result).text).toBe(`@/path/to/a/valid/file.txt`);
    });

    it('不应为不是路径的短文本添加前缀 @', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => true }),
      );
      const shortText = 'ab';
      act(() => result.current.insert(shortText));
      expect(getBufferState(result).text).toBe(shortText);
    });
  });

  describe('Shell 模式行为', () => {
    it('当 shellModeActive 为 true 时，不应为有效文件路径添加前缀 @', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => true,
          shellModeActive: true,
        }),
      );
      const filePath = '/path/to/a/valid/file.txt';
      act(() => result.current.insert(filePath));
      expect(getBufferState(result).text).toBe(filePath); // 无 @ 前缀
    });

    it('当 shellModeActive 为 true 时，不应为带引号的路径添加前缀 @', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => true,
          shellModeActive: true,
        }),
      );
      const quotedFilePath = "'/path/to/a/valid/file.txt'";
      act(() => result.current.insert(quotedFilePath));
      expect(getBufferState(result).text).toBe(quotedFilePath); // 无 @ 前缀，保留引号
    });

    it('当 shellModeActive 为 true 时，无效路径应正常处理', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => false,
          shellModeActive: true,
        }),
      );
      const notAPath = 'this is just some text';
      act(() => result.current.insert(notAPath));
      expect(getBufferState(result).text).toBe(notAPath);
    });

    it('当 shellModeActive 为 true 时，短文本应正常处理', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => true,
          shellModeActive: true,
        }),
      );
      const shortText = 'ls';
      act(() => result.current.insert(shortText));
      expect(getBufferState(result).text).toBe(shortText); // 短文本无 @ 前缀
    });
  });

  describe('光标移动', () => {
    it('move: 左/右应在视觉行内和跨行（由于换行）工作', () => {
      // 文本: "long line1next line2" (20 个字符)
      // 视口宽度 5。换行应产生:
      // "long " (5)
      // "line1" (5)
      // "next " (5)
      // "line2" (5)
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'long line1next line2', // 修正: 原为 'long line1next line2'
          viewport: { width: 5, height: 4 },
          isValidPath: () => false,
        }),
      );
      // 初始光标 [0,0] 逻辑，视觉 [0,0] ("long " 的 "l")

      act(() => result.current.move('right')); // 视觉 [0,1] ("o")
      expect(getBufferState(result).visualCursor).toEqual([0, 1]);
      act(() => result.current.move('right')); // 视觉 [0,2] ("n")
      act(() => result.current.move('right')); // 视觉 [0,3] ("g")
      act(() => result.current.move('right')); // 视觉 [0,4] (" ")
      expect(getBufferState(result).visualCursor).toEqual([0, 4]);

      act(() => result.current.move('right')); // 视觉 [1,0] ("line1" 的 "l")
      expect(getBufferState(result).visualCursor).toEqual([1, 0]);
      expect(getBufferState(result).cursor).toEqual([0, 5]); // 逻辑光标

      act(() => result.current.move('left')); // 视觉 [0,4] ("long " 的 " ")
      expect(getBufferState(result).visualCursor).toEqual([0, 4]);
      expect(getBufferState(result).cursor).toEqual([0, 4]); // 逻辑光标
    });

    it('move: 上/下应保持首选视觉列', () => {
      const text = 'abcde\nxy\n12345';
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: text,
          viewport,
          isValidPath: () => false,
        }),
      );
      expect(result.current.allVisualLines).toEqual(['abcde', 'xy', '12345']);
      // 将光标放置在 "abcde" 的末尾 -> 逻辑 [0,5]
      act(() => {
        result.current.move('home'); // 到 [0,0]
      });
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.move('right'); // 到 [0,5]
        });
      }
      expect(getBufferState(result).cursor).toEqual([0, 5]);
      expect(getBufferState(result).visualCursor).toEqual([0, 5]);

      // 通过向上再向下移动到同一位置来设置 preferredCol，然后测试。
      act(() => {
        result.current.move('down'); // 到 xy，逻辑 [1,2]，视觉 [1,2]，preferredCol 应为 5
      });
      let state = getBufferState(result);
      expect(state.cursor).toEqual([1, 2]); // 逻辑光标在 'xy' 的末尾
      expect(state.visualCursor).toEqual([1, 2]); // 视觉光标在 'xy' 的末尾
      expect(state.preferredCol).toBe(5);

      act(() => result.current.move('down')); // 到 '12345'，preferredCol=5.
      state = getBufferState(result);
      expect(state.cursor).toEqual([2, 5]); // 逻辑光标在 '12345' 的末尾
      expect(state.visualCursor).toEqual([2, 5]); // 视觉光标在 '12345' 的末尾
      expect(state.preferredCol).toBe(5); // 保持首选列

      act(() => result.current.move('left')); // preferredCol 应重置
      state = getBufferState(result);
      expect(state.preferredCol).toBe(null);
    });

    it('move: home/end 应转到视觉行的开始/结束', () => {
      const initialText = 'line one\nsecond line';
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText,
          viewport: { width: 5, height: 5 },
          isValidPath: () => false,
        }),
      );
      expect(result.current.allVisualLines).toEqual([
        'line',
        'one',
        'secon',
        'd',
        'line',
      ]);
      // 初始光标 [0,0] ("line" 的开始)
      act(() => result.current.move('down')); // 视觉光标从 [0,0] 到 [1,0] ("one" 的 "o")
      act(() => result.current.move('right')); // 视觉光标到 [1,1] ("one" 的 "n")
      expect(getBufferState(result).visualCursor).toEqual([1, 1]);

      act(() => result.current.move('home')); // 视觉光标到 [1,0] ("one" 的开始)
      expect(getBufferState(result).visualCursor).toEqual([1, 0]);

      act(() => result.current.move('end')); // 视觉光标到 [1,3] ("one" 的结束)
      expect(getBufferState(result).visualCursor).toEqual([1, 3]); // "one" 是 3 个字符
    });
  });

  describe('视觉布局与视口', () => {
    it('应正确将长行换行到 visualLines', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'This is a very long line of text.', // 33 个字符
          viewport: { width: 10, height: 5 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      // 预期的视觉行与换行 (视口宽度 10):
      // "This is a"
      // "very long"
      // "line of"
      // "text."
      expect(state.allVisualLines.length).toBe(4);
      expect(state.allVisualLines[0]).toBe('This is a');
      expect(state.allVisualLines[1]).toBe('very long');
      expect(state.allVisualLines[2]).toBe('line of');
      expect(state.allVisualLines[3]).toBe('text.');
    });

    it('当 visualCursor 移出视口时应更新 visualScrollRow', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'l1\nl2\nl3\nl4\nl5',
          viewport: { width: 5, height: 3 }, // 可显示 3 行视觉行
          isValidPath: () => false,
        }),
      );
      // 初始: l1, l2, l3 可见。visualScrollRow = 0。visualCursor = [0,0]
      expect(getBufferState(result).visualScrollRow).toBe(0);
      expect(getBufferState(result).allVisualLines).toEqual([
        'l1',
        'l2',
        'l3',
        'l4',
        'l5',
      ]);
      expect(getBufferState(result).viewportVisualLines).toEqual([
        'l1',
        'l2',
        'l3',
      ]);

      act(() => result.current.move('down')); // vc=[1,0]
      act(() => result.current.move('down')); // vc=[2,0] (l3)
      expect(getBufferState(result).visualScrollRow).toBe(0);

      act(() => result.current.move('down')); // vc=[3,0] (l4) - 应发生滚动
      // 现在: l2, l3, l4 可见。visualScrollRow = 1。
      let state = getBufferState(result);
      expect(state.visualScrollRow).toBe(1);
      expect(state.allVisualLines).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
      expect(state.viewportVisualLines).toEqual(['l2', 'l3', 'l4']);
      expect(state.visualCursor).toEqual([3, 0]);

      act(() => result.current.move('up')); // vc=[2,0] (l3)
      act(() => result.current.move('up')); // vc=[1,0] (l2)
      expect(getBufferState(result).visualScrollRow).toBe(1);

      act(() => result.current.move('up')); // vc=[0,0] (l1) - 向上滚动
      // 现在: l1, l2, l3 可见。visualScrollRow = 0
      state = getBufferState(result); // 分配给现有的 `state` 变量
      expect(state.visualScrollRow).toBe(0);
      expect(state.allVisualLines).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
      expect(state.viewportVisualLines).toEqual(['l1', 'l2', 'l3']);
      expect(state.visualCursor).toEqual([0, 0]);
    });
  });

  describe('撤销/重做', () => {
    it('应撤销并重做插入操作', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() => result.current.insert('a'));
      expect(getBufferState(result).text).toBe('a');

      act(() => result.current.undo());
      expect(getBufferState(result).text).toBe('');
      expect(getBufferState(result).cursor).toEqual([0, 0]);

      act(() => result.current.redo());
      expect(getBufferState(result).text).toBe('a');
      expect(getBufferState(result).cursor).toEqual([0, 1]);
    });

    it('应撤销并重做换行操作', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'test',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end'));
      act(() => result.current.newline());
      expect(getBufferState(result).text).toBe('test\n');

      act(() => result.current.undo());
      expect(getBufferState(result).text).toBe('test');
      expect(getBufferState(result).cursor).toEqual([0, 4]);

      act(() => result.current.redo());
      expect(getBufferState(result).text).toBe('test\n');
      expect(getBufferState(result).cursor).toEqual([1, 0]);
    });
  });

  describe('Unicode 处理', () => {
    it('insert: 应正确处理多字节 Unicode 字符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() => result.current.insert('你好'));
      const state = getBufferState(result);
      expect(state.text).toBe('你好');
      expect(state.cursor).toEqual([0, 2]); // 光标是 2 (字符数)
      expect(state.visualCursor).toEqual([0, 2]);
    });

    it('backspace: 应正确删除多字节 Unicode 字符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '你好',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // 光标在 [0,2]
      act(() => result.current.backspace()); // 删除 '好'
      let state = getBufferState(result);
      expect(state.text).toBe('你');
      expect(state.cursor).toEqual([0, 1]);

      act(() => result.current.backspace()); // 删除 '你'
      state = getBufferState(result);
      expect(state.text).toBe('');
      expect(state.cursor).toEqual([0, 0]);
    });

    it('move: 左/右应将多字节字符视为单个单位进行视觉光标处理', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '🐶🐱',
          viewport: { width: 5, height: 1 },
          isValidPath: () => false,
        }),
      );
      // 初始: visualCursor [0,0]
      act(() => result.current.move('right')); // visualCursor [0,1] (在 🐶 之后)
      let state = getBufferState(result);
      expect(state.cursor).toEqual([0, 1]);
      expect(state.visualCursor).toEqual([0, 1]);

      act(() => result.current.move('right')); // visualCursor [0,2] (在 🐱 之后)
      state = getBufferState(result);
      expect(state.cursor).toEqual([0, 2]);
      expect(state.visualCursor).toEqual([0, 2]);

      act(() => result.current.move('left')); // visualCursor [0,1] (在 🐱 之前 / 在 🐶 之后)
      state = getBufferState(result);
      expect(state.cursor).toEqual([0, 1]);
      expect(state.visualCursor).toEqual([0, 1]);
    });
  });

  describe('handleInput', () => {
    it('应插入可打印字符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() =>
        result.current.handleInput({
          name: 'h',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'h',
        }),
      );
      act(() =>
        result.current.handleInput({
          name: 'i',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'i',
        }),
      );
      expect(getBufferState(result).text).toBe('hi');
    });

    it('应将 "Enter" 键处理为换行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() =>
        result.current.handleInput({
          name: 'return',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\r',
        }),
      );
      expect(getBufferState(result).lines).toEqual(['', '']);
    });

    it('应处理 "Backspace" 键', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'a',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end'));
      act(() =>
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x7f',
        }),
      );
      expect(getBufferState(result).text).toBe('');
    });

    it('应处理一次输入中的多个删除字符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abcde',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // 光标在末尾
      expect(getBufferState(result).cursor).toEqual([0, 5]);

      act(() => {
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x7f',
        });
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x7f',
        });
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x7f',
        });
      });
      expect(getBufferState(result).text).toBe('ab');
      expect(getBufferState(result).cursor).toEqual([0, 2]);
    });

    it('应处理包含删除字符的插入', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abcde',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // 光标在末尾
      expect(getBufferState(result).cursor).toEqual([0, 5]);

      act(() => {
        result.current.insert('\x7f\x7f\x7f');
      });
      expect(getBufferState(result).text).toBe('ab');
      expect(getBufferState(result).cursor).toEqual([0, 2]);
    });

    it('应处理包含常规字符和删除字符混合的插入', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abcde',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // 光标在末尾
      expect(getBufferState(result).cursor).toEqual([0, 5]);

      act(() => {
        result.current.insert('\x7fI\x7f\x7fNEW');
      });
      expect(getBufferState(result).text).toBe('abcNEW');
      expect(getBufferState(result).cursor).toEqual([0, 6]);
    });

    it('应处理箭头键进行移动', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'ab',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // 光标 [0,2]
      act(() =>
        result.current.handleInput({
          name: 'left',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x1b[D',
        }),
      ); // 光标 [0,1]
      expect(getBufferState(result).cursor).toEqual([0, 1]);
      act(() =>
        result.current.handleInput({
          name: 'right',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x1b[C',
        }),
      ); // 光标 [0,2]
      expect(getBufferState(result).cursor).toEqual([0, 2]);
    });

    it('粘贴文本时应去除 ANSI 转义码', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithAnsi = '\x1B[31mHello\x1B[0m \x1B[32mWorld\x1B[0m';
      // 通过调用 handleInput 并传入长度大于 1 的字符串来模拟粘贴
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithAnsi,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello World');
    });

    it('应将 VSCode 终端 Shift+Enter 处理为换行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() =>
        result.current.handleInput({
          name: 'return',
          ctrl: false,
          meta: false,
          shift: true,
          paste: false,
          sequence: '\r',
        }),
      ); // 模拟 VSCode 终端中的 Shift+Enter
      expect(getBufferState(result).lines).toEqual(['', '']);
    });

    it('应正确处理重复粘贴长文本', () => {
      const longText = `not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.

Why do we use it?
It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using 'Content here, content here', making it look like readable English. Many desktop publishing packages and web page editors now use Lorem Ipsum as their default model text, and a search for 'lorem ipsum' will uncover many web sites still in their infancy. Various versions have evolved over the years, sometimes by accident, sometimes on purpose (injected humour and the like).

Where does it come from?
Contrary to popular belief, Lorem Ipsum is not simply random text. It has roots in a piece of classical Latin literature from 45 BC, making it over 2000 years old. Richard McClintock, a Latin professor at Hampden-Sydney College in Virginia, looked up one of the more obscure Latin words, consectetur, from a Lore
`;
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );

      // 模拟多次粘贴长文本
      act(() => {
        result.current.insert(longText);
        result.current.insert(longText);
        result.current.insert(longText);
      });

      const state = getBufferState(result);
      // 检查文本是否是三次连接的结果。
      expect(state.lines).toStrictEqual(
        (longText + longText + longText).split('\n'),
      );
      const expectedCursorPos = offsetToLogicalPos(
        state.text,
        state.text.length,
      );
      expect(state.cursor).toEqual(expectedCursorPos);
    });
  });

  // 还需要更多测试:
  // - setText, replaceRange
  // - deleteWordLeft, deleteWordRight
  // - 更复杂的撤销/重做场景
  // - 选择和剪贴板 (复制/粘贴) - 可能需要剪贴板 API 模拟或内部状态检查
  // - openInExternalEditor (需要大量模拟 fs, child_process, os)
  // - 不同视口大小和文本内容的视觉滚动和换行的所有边缘情况。

  describe('replaceRange', () => {
    it('应将单行范围替换为单行文本', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '@pac',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 1, 0, 4, 'packages'));
      const state = getBufferState(result);
      expect(state.text).toBe('@packages');
      expect(state.cursor).toEqual([0, 9]); // 光标在 'typescript' 之后
    });

    it('应将多行范围替换为单行文本', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello\nworld\nagain',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 2, 1, 3, ' new ')); // 将 'llo\nwor' 替换为 ' new '
      const state = getBufferState(result);
      expect(state.text).toBe('he new ld\nagain');
      expect(state.cursor).toEqual([0, 7]); // 光标在 ' new ' 之后
    });

    it('当替换为空字符串时应删除范围', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello world',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 5, 0, 11, '')); // 删除 ' world'
      const state = getBufferState(result);
      expect(state.text).toBe('hello');
      expect(state.cursor).toEqual([0, 5]);
    });

    it('应处理在文本开头替换', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'world',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 0, 0, 0, 'hello '));
      const state = getBufferState(result);
      expect(state.text).toBe('hello world');
      expect(state.cursor).toEqual([0, 6]);
    });

    it('应处理在文本末尾替换', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 5, 0, 5, ' world'));
      const state = getBufferState(result);
      expect(state.text).toBe('hello world');
      expect(state.cursor).toEqual([0, 11]);
    });

    it('应处理替换整个缓冲区内容', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'old text',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 0, 0, 8, 'new text'));
      const state = getBufferState(result);
      expect(state.text).toBe('new text');
      expect(state.cursor).toEqual([0, 8]);
    });

    it('应正确替换 Unicode 字符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello *** world',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 6, 0, 9, '你好'));
      const state = getBufferState(result);
      expect(state.text).toBe('hello 你好 world');
      expect(state.cursor).toEqual([0, 8]); // 在 '你好' 之后
    });

    it('应通过返回 false 并不更改文本来处理无效范围', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'test',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => {
        result.current.replaceRange(0, 5, 0, 3, 'fail'); // 同一行中 startCol > endCol
      });

      expect(getBufferState(result).text).toBe('test');

      act(() => {
        result.current.replaceRange(1, 0, 0, 0, 'fail'); // startRow > endRow
      });
      expect(getBufferState(result).text).toBe('test');
    });

    it('replaceRange: 用单个字符替换多行', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'first\nsecond\nthird',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 2, 2, 3, 'X')); // 替换 'rst\nsecond\nthi'
      const state = getBufferState(result);
      expect(state.text).toBe('fiXrd');
      expect(state.cursor).toEqual([0, 3]); // 在 'X' 之后
    });
  });

  describe('输入清理', () => {
    it('应从输入中去除 ANSI 转义码', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithAnsi = '\x1B[31mHello\x1B[0m';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithAnsi,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello');
    });

    it('应从输入中去除控制字符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithControlChars = 'H\x07e\x08l\x0Bl\x0Co'; // BELL, BACKSPACE, VT, FF
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithControlChars,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello');
    });

    it('应从输入中去除混合的 ANSI 和控制字符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithMixed = '\u001B[4mH\u001B[0mello';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithMixed,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello');
    });

    it('不应去除标准字符或换行符', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const validText = 'Hello World\nThis is a test.';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: validText,
        }),
      );
      expect(getBufferState(result).text).toBe(validText);
    });

    it('应通过 handleInput 清理粘贴的文本', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const pastedText = '\u001B[4mPasted\u001B[4m Text';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: pastedText,
        }),
      );
      expect(getBufferState(result).text).toBe('Pasted Text');
    });
  });
});

describe('offsetToLogicalPos', () => {
  it('偏移量 0 应返回 [0,0]', () => {
    expect(offsetToLogicalPos('any text', 0)).toEqual([0, 0]);
  });

  it('应处理单行文本', () => {
    const text = 'hello';
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // 开始
    expect(offsetToLogicalPos(text, 2)).toEqual([0, 2]); // 中间的 'l'
    expect(offsetToLogicalPos(text, 5)).toEqual([0, 5]); // 结束
    expect(offsetToLogicalPos(text, 10)).toEqual([0, 5]); // 超出结束
  });

  it('应处理多行文本', () => {
    const text = 'hello\nworld\n123';
    // "hello" (5) + \n (1) + "world" (5) + \n (1) + "123" (3)
    // h e l l o \n w o r l d \n 1 2 3
    // 0 1 2 3 4  5  6 7 8 9 0  1  2 3 4
    // 第 0 行: "hello" (长度 5)
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // 'hello' 的开始
    expect(offsetToLogicalPos(text, 3)).toEqual([0, 3]); // 'hello' 中的 'l'
    expect(offsetToLogicalPos(text, 5)).toEqual([0, 5]); // 'hello' 的结束 (在 \n 之前)

    // 第 1 行: "world" (长度 5)
    expect(offsetToLogicalPos(text, 6)).toEqual([1, 0]); // 'world' 的开始 (在 \n 之后)
    expect(offsetToLogicalPos(text, 8)).toEqual([1, 2]); // 'world' 中的 'r'
    expect(offsetToLogicalPos(text, 11)).toEqual([1, 5]); // 'world' 的结束 (在 \n 之前)

    // 第 2 行: "123" (长度 3)
    expect(offsetToLogicalPos(text, 12)).toEqual([2, 0]); // '123' 的开始 (在 \n 之后)
    expect(offsetToLogicalPos(text, 13)).toEqual([2, 1]); // '123' 中的 '2'
    expect(offsetToLogicalPos(text, 15)).toEqual([2, 3]); // '123' 的结束
    expect(offsetToLogicalPos(text, 20)).toEqual([2, 3]); // 超出文本结束
  });

  it('应处理空行', () => {
    const text = 'a\n\nc'; // "a" (1) + \n (1) + "" (0) + \n (1) + "c" (1)
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // 'a'
    expect(offsetToLogicalPos(text, 1)).toEqual([0, 1]); // 'a' 的结束
    expect(offsetToLogicalPos(text, 2)).toEqual([1, 0]); // 空行的开始
    expect(offsetToLogicalPos(text, 3)).toEqual([2, 0]); // 'c' 的开始
    expect(offsetToLogicalPos(text, 4)).toEqual([2, 1]); // 'c' 的结束
  });

  it('应处理以换行符结尾的文本', () => {
    const text = 'hello\n'; // "hello" (5) + \n (1)
    expect(offsetToLogicalPos(text, 5)).toEqual([0, 5]); // 'hello' 的结束
    expect(offsetToLogicalPos(text, 6)).toEqual([1, 0]); // 新空行上的位置

    expect(offsetToLogicalPos(text, 7)).toEqual([1, 0]); // 仍在新空行上
  });

  it('应处理以换行符开头的文本', () => {
    const text = '\nhello'; // "" (0) + \n (1) + "hello" (5)
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // 第一个空行的开始
    expect(offsetToLogicalPos(text, 1)).toEqual([1, 0]); // 'hello' 的开始
    expect(offsetToLogicalPos(text, 3)).toEqual([1, 2]); // 'hello' 中的 'l'
  });

  it('应处理空字符串输入', () => {
    expect(offsetToLogicalPos('', 0)).toEqual([0, 0]);
    expect(offsetToLogicalPos('', 5)).toEqual([0, 0]);
  });

  it('应正确处理多字节 Unicode 字符', () => {
    const text = '你好\n世界'; // "你好" (2 个字符) + \n (1) + "世界" (2 个字符)
    // 总 "代码点" 用于偏移计算: 2 + 1 + 2 = 5
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // '你好' 的开始
    expect(offsetToLogicalPos(text, 1)).toEqual([0, 1]); // 在 '你' 之后，在 '好' 之前
    expect(offsetToLogicalPos(text, 2)).toEqual([0, 2]); // '你好' 的结束
    expect(offsetToLogicalPos(text, 3)).toEqual([1, 0]); // '世界' 的开始
    expect(offsetToLogicalPos(text, 4)).toEqual([1, 1]); // 在 '世' 之后，在 '界' 之前
    expect(offsetToLogicalPos(text, 5)).toEqual([1, 2]); // '世界' 的结束
    expect(offsetToLogicalPos(text, 6)).toEqual([1, 2]); // 超出结束
  });

  it('应处理恰好在换行符上的偏移量', () => {
    const text = 'abc\ndef';
    // a b c \n d e f
    // 0 1 2  3  4 5 6
    expect(offsetToLogicalPos(text, 3)).toEqual([0, 3]); // 'abc' 的结束
    // 下一个字符是换行符，所以偏移量 4 意味着下一行的开始。
    expect(offsetToLogicalPos(text, 4)).toEqual([1, 0]); // 'def' 的开始
  });

  it('应处理在多字节字符中间的偏移量 (应放置在该字符的开始)', () => {
    // 此场景很棘手，因为 "偏移量" 通常是基于字符的。
    // 假设 cpLen 和相关逻辑通过将多字节视为一个单元来处理此问题。
    // offsetToLogicalPos 的当前实现使用 cpLen，因此它应该是代码点感知的。
    const text = '🐶🐱'; // 2 个代码点
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]);
    expect(offsetToLogicalPos(text, 1)).toEqual([0, 1]); // 在 🐶 之后
    expect(offsetToLogicalPos(text, 2)).toEqual([0, 2]); // 在 🐱 之后
  });
});