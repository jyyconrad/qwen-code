/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { findLastSafeSplitPoint } from './markdownUtilities.js';

describe('markdownUtilities', () => {
  describe('findLastSafeSplitPoint', () => {
    it('如果不在代码块中，应在最后一个双换行符处拆分', () => {
      const content = 'paragraph1\n\nparagraph2\n\nparagraph3';
      expect(findLastSafeSplitPoint(content)).toBe(24); // 在第二个 \n\n 之后
    });

    it('如果未找到安全拆分点，则返回 content.length', () => {
      const content = 'longstringwithoutanysafesplitpoint';
      expect(findLastSafeSplitPoint(content)).toBe(content.length);
    });

    it('如果结尾不在代码块中，应优先在 \n\n 处拆分，而不是在字符串末尾', () => {
      const content = 'Some text here.\n\nAnd more text here.';
      expect(findLastSafeSplitPoint(content)).toBe(17); // 在 \n\n 之后
    });

    it('如果唯一的 \n\n 在代码块内部且内容结尾不在代码块中，则返回 content.length', () => {
      const content = '```\nignore this\n\nnewline\n```KeepThis';
      expect(findLastSafeSplitPoint(content)).toBe(content.length);
    });

    it('即使后面跟着不在代码块中的文本，也应正确识别最后一个 \n\n', () => {
      const content =
        'First part.\n\nSecond part.\n\nThird part, then some more text.';
      // 应在 "Second part.\n\n" 之后拆分
      // "First part.\n\n" 是 13 个字符。"Second part.\n\n" 是 14 个字符。总计 27。
      expect(findLastSafeSplitPoint(content)).toBe(27);
    });

    it('如果内容为空，则返回 content.length', () => {
      const content = '';
      expect(findLastSafeSplitPoint(content)).toBe(0);
    });

    it('如果内容没有换行符且没有代码块，则返回 content.length', () => {
      const content = 'Single line of text';
      expect(findLastSafeSplitPoint(content)).toBe(content.length);
    });
  });
});