/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { MaxSizedBox, setMaxSizedBoxDebugging } from './MaxSizedBox.js';
import { Box, Text } from 'ink';
import { describe, it, expect } from 'vitest';

describe('<MaxSizedBox />', () => {
  // 确保 MaxSizedBox 在配置无效时记录错误。
  // 这对于调试组件问题很有用。
  // 在生产环境中应设为 false 以提高性能，并避免
  // 如果有可忽略的问题时控制台被杂乱信息充斥。
  setMaxSizedBoxDebugging(true);

  it('renders children without truncation when they fit', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10}>
          <Box>
            <Text>Hello, World!</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).equals('Hello, World!');
  });

  it('hides lines when content exceeds maxHeight', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2}>
          <Box>
            <Text>Line 1</Text>
          </Box>
          <Box>
            <Text>Line 2</Text>
          </Box>
          <Box>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).equals(`... first 2 lines hidden ...
Line 3`);
  });

  it('hides lines at the end when content exceeds maxHeight and overflowDirection is bottom', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2} overflowDirection="bottom">
          <Box>
            <Text>Line 1</Text>
          </Box>
          <Box>
            <Text>Line 2</Text>
          </Box>
          <Box>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).equals(`Line 1
... last 2 lines hidden ...`);
  });

  it('wraps text that exceeds maxWidth', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={10} maxHeight={5}>
          <Box>
            <Text wrap="wrap">This is a long line of text</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    expect(lastFrame()).equals(`This is a
long line
of text`);
  });

  it('handles mixed wrapping and non-wrapping segments', () => {
    const multilineText = `This part will wrap around.
And has a line break.
  Leading spaces preserved.`;
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={20} maxHeight={20}>
          <Box>
            <Text>Example</Text>
          </Box>
          <Box>
            <Text>No Wrap: </Text>
            <Text wrap="wrap">{multilineText}</Text>
          </Box>
          <Box>
            <Text>Longer No Wrap: </Text>
            <Text wrap="wrap">This part will wrap around.</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    expect(lastFrame()).equals(
      `Example
No Wrap: This part
         will wrap
         around.
         And has a
         line break.
           Leading
         spaces
         preserved.
Longer No Wrap: This
                part
                will
                wrap
                arou
                nd.`,
    );
  });

  it('handles words longer than maxWidth by splitting them', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={5} maxHeight={5}>
          <Box>
            <Text wrap="wrap">Supercalifragilisticexpialidocious</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    expect(lastFrame()).equals(`... …
istic
expia
lidoc
ious`);
  });

  it('does not truncate when maxHeight is undefined', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={undefined}>
          <Box>
            <Text>Line 1</Text>
          </Box>
          <Box>
            <Text>Line 2</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).equals(`Line 1
Line 2`);
  });

  it('shows plural "lines" when more than one line is hidden', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2}>
          <Box>
            <Text>Line 1</Text>
          </Box>
          <Box>
            <Text>Line 2</Text>
          </Box>
          <Box>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).equals(`... first 2 lines hidden ...
Line 3`);
  });

  it('shows plural "lines" when more than one line is hidden and overflowDirection is bottom', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2} overflowDirection="bottom">
          <Box>
            <Text>Line 1</Text>
          </Box>
          <Box>
            <Text>Line 2</Text>
          </Box>
          <Box>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).equals(`Line 1
... last 2 lines hidden ...`);
  });

  it('renders an empty box for empty children', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10}></MaxSizedBox>
      </OverflowProvider>,
    );
    // Expect an empty string or a box with nothing in it.
    // Ink renders an empty box as an empty string.
    expect(lastFrame()).equals('');
  });

  it('wraps text with multi-byte unicode characters correctly', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={5} maxHeight={5}>
          <Box>
            <Text wrap="wrap">你好世界</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    // "你好" 的视觉宽度为 4。"世界" 的视觉宽度为 4。
    // 当 maxWidth=5 时，应在第二个字符后换行。
    expect(lastFrame()).equals(`你好
世界`);
  });

  it('wraps text with multi-byte emoji characters correctly', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={5} maxHeight={5}>
          <Box>
            <Text wrap="wrap">🐶🐶🐶🐶🐶</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    // 每个 "🐶" 的视觉宽度为 2。
    // 当 maxWidth=5 时，应每 2 个表情符号换行一次。
    expect(lastFrame()).equals(`🐶🐶
🐶🐶
🐶`);
  });

  it('accounts for additionalHiddenLinesCount', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2} additionalHiddenLinesCount={5}>
          <Box>
            <Text>Line 1</Text>
          </Box>
          <Box>
            <Text>Line 2</Text>
          </Box>
          <Box>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    // 1 行被溢出隐藏，5 行额外隐藏。
    expect(lastFrame()).equals(`... first 7 lines hidden ...
Line 3`);
  });

  it('handles React.Fragment as a child', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10}>
          <>
            <Box>
              <Text>Line 1 from Fragment</Text>
            </Box>
            <Box>
              <Text>Line 2 from Fragment</Text>
            </Box>
          </>
          <Box>
            <Text>Line 3 direct child</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).equals(`Line 1 from Fragment
Line 2 from Fragment
Line 3 direct child`);
  });

  it('clips a long single text child from the top', () => {
    const THIRTY_LINES = Array.from(
      { length: 30 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n');

    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10}>
          <Box>
            <Text>{THIRTY_LINES}</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    const expected = [
      '... first 21 lines hidden ...',
      ...Array.from({ length: 9 }, (_, i) => `Line ${22 + i}`),
    ].join('\n');

    expect(lastFrame()).equals(expected);
  });

  it('clips a long single text child from the bottom', () => {
    const THIRTY_LINES = Array.from(
      { length: 30 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n');

    const { lastFrame } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10} overflowDirection="bottom">
          <Box>
            <Text>{THIRTY_LINES}</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    const expected = [
      ...Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`),
      '... last 21 lines hidden ...',
    ].join('\n');

    expect(lastFrame()).equals(expected);
  });
});