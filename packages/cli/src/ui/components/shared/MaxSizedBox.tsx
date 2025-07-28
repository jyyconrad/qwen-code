/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Fragment, useEffect, useId } from 'react';
import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { Colors } from '../../colors.js';
import { toCodePoints } from '../../utils/textUtils.js';
import { useOverflowActions } from '../../contexts/OverflowContext.js';

let enableDebugLog = false;

/**
 * MaxSizedBox 组件的最小高度。
 * 这确保至少有一行内容的空间以及内容被截断的消息。
 */
export const MINIMUM_MAX_HEIGHT = 2;

export function setMaxSizedBoxDebugging(value: boolean) {
  enableDebugLog = value;
}

function debugReportError(message: string, element: React.ReactNode) {
  if (!enableDebugLog) return;

  if (!React.isValidElement(element)) {
    console.error(
      message,
      `无效元素: '${String(element)}' typeof=${typeof element}`,
    );
    return;
  }

  let sourceMessage = '<未知文件>';
  try {
    const elementWithSource = element as {
      _source?: { fileName?: string; lineNumber?: number };
    };
    const fileName = elementWithSource._source?.fileName;
    const lineNumber = elementWithSource._source?.lineNumber;
    sourceMessage = fileName ? `${fileName}:${lineNumber}` : '<未知文件>';
  } catch (error) {
    console.error('尝试获取文件名时出错:', error);
  }

  console.error(message, `${String(element.type)}. 来源: ${sourceMessage}`);
}
interface MaxSizedBoxProps {
  children?: React.ReactNode;
  maxWidth?: number;
  maxHeight: number | undefined;
  overflowDirection?: 'top' | 'bottom';
  additionalHiddenLinesCount?: number;
}

/**
 * 一个 React 组件，用于限制其子元素的大小，并在内容超出指定的 `maxHeight` 时提供
 * 内容感知的截断。
 *
 * `MaxSizedBox` 需要其子元素具有特定结构以正确测量和渲染内容：
 *
 * 1.  **直接子元素必须是 `<Box>` 元素。** 每个 `<Box>` 代表一行内容。
 * 2.  **行 `<Box>` 元素只能包含 `<Text>` 元素。** 这些 `<Text>` 元素可以嵌套，
 *     除了非换行文本元素必须在换行文本元素之前外，对 Text 元素样式没有其他限制。
 *
 * **约束条件：**
 * - **Box 属性：** 子 `<Box>` 元素上的自定义属性将被忽略。在调试模式下，
 *   运行时检查将报告任何不支持的属性错误。
 * - **文本换行：** 在单行内，无换行的 `<Text>` 元素（例如标题、标签）
 *   必须出现在任何会换行的 `<Text>` 元素之前。
 * - **元素类型：** 如果使用了不支持的元素类型作为子元素，运行时检查将发出警告。
 *
 * @example
 * <MaxSizedBox maxWidth={80} maxHeight={10}>
 *   <Box>
 *     <Text>这是第一行。</Text>
 *   </Box>
 *   <Box>
 *     <Text color="cyan" wrap="truncate">非换行标题: </Text>
 *     <Text>这是行的其余部分，如果太长将会换行。</Text>
 *   </Box>
 *   <Box>
 *     <Text>
 *       第3行包含<Text color="yellow">嵌套的样式文本</Text>。
 *     </Text>
 *   </Box>
 * </MaxSizedBox>
 */
export const MaxSizedBox: React.FC<MaxSizedBoxProps> = ({
  children,
  maxWidth,
  maxHeight,
  overflowDirection = 'top',
  additionalHiddenLinesCount = 0,
}) => {
  const id = useId();
  const { addOverflowingId, removeOverflowingId } = useOverflowActions() || {};

  const laidOutStyledText: StyledText[][] = [];
  const targetMaxHeight = Math.max(
    Math.round(maxHeight ?? Number.MAX_SAFE_INTEGER),
    MINIMUM_MAX_HEIGHT,
  );

  if (maxWidth === undefined) {
    throw new Error('设置 maxHeight 时必须定义 maxWidth。');
  }
  function visitRows(element: React.ReactNode) {
    if (!React.isValidElement<{ children?: React.ReactNode }>(element)) {
      return;
    }

    if (element.type === Fragment) {
      React.Children.forEach(element.props.children, visitRows);
      return;
    }

    if (element.type === Box) {
      layoutInkElementAsStyledText(element, maxWidth!, laidOutStyledText);
      return;
    }

    debugReportError('MaxSizedBox 的子元素必须是 <Box> 元素', element);
  }

  React.Children.forEach(children, visitRows);

  const contentWillOverflow =
    (targetMaxHeight !== undefined &&
      laidOutStyledText.length > targetMaxHeight) ||
    additionalHiddenLinesCount > 0;
  const visibleContentHeight =
    contentWillOverflow && targetMaxHeight !== undefined
      ? targetMaxHeight - 1
      : targetMaxHeight;

  const hiddenLinesCount =
    visibleContentHeight !== undefined
      ? Math.max(0, laidOutStyledText.length - visibleContentHeight)
      : 0;
  const totalHiddenLines = hiddenLinesCount + additionalHiddenLinesCount;

  useEffect(() => {
    if (totalHiddenLines > 0) {
      addOverflowingId?.(id);
    } else {
      removeOverflowingId?.(id);
    }

    return () => {
      removeOverflowingId?.(id);
    };
  }, [id, totalHiddenLines, addOverflowingId, removeOverflowingId]);

  const visibleStyledText =
    hiddenLinesCount > 0
      ? overflowDirection === 'top'
        ? laidOutStyledText.slice(hiddenLinesCount, laidOutStyledText.length)
        : laidOutStyledText.slice(0, visibleContentHeight)
      : laidOutStyledText;

  const visibleLines = visibleStyledText.map((line, index) => (
    <Box key={index}>
      {line.length > 0 ? (
        line.map((segment, segIndex) => (
          <Text key={segIndex} {...segment.props}>
            {segment.text}
          </Text>
        ))
      ) : (
        <Text> </Text>
      )}
    </Box>
  ));

  return (
    <Box flexDirection="column" width={maxWidth} flexShrink={0}>
      {totalHiddenLines > 0 && overflowDirection === 'top' && (
        <Text color={Colors.Gray} wrap="truncate">
          ... 首 {totalHiddenLines} 行已隐藏 ...
        </Text>
      )}
      {visibleLines}
      {totalHiddenLines > 0 && overflowDirection === 'bottom' && (
        <Text color={Colors.Gray} wrap="truncate">
          ... 末 {totalHiddenLines} 行已隐藏 ...
        </Text>
      )}
    </Box>
  );
};

// 为样式文本段定义类型
interface StyledText {
  text: string;
  props: Record<string, unknown>;
}

/**
 * MaxSizedBox 内的单行内容。
 *
 * 一行可以包含未换行的段，后跟换行的段。这是一个最小实现，
 * 仅支持当前所需的功能。
 */
interface Row {
  noWrapSegments: StyledText[];
  segments: StyledText[];
}

/**
 * 将 MaxSizedBox 的子元素展平为 `Row` 对象数组。
 *
 * 此函数期望特定的子结构才能正确运行：
 * 1. `MaxSizedBox` 的顶级子元素应该是单个 `<Box>`。此外部框主要用于结构，
 *    不会直接渲染。
 * 2. 在外部 `<Box>` 内部，应该有一个或多个子元素。每个子元素必须是表示一行的 `<Box>`。
 * 3. 在每个"行" `<Box>` 内部，子元素必须是 `<Text>` 组件。
 *
 * 结构应如下所示：
 * <MaxSizedBox>
 *   <Box> // 第1行
 *     <Text>...</Text>
 *     <Text>...</Text>
 *   </Box>
 *   <Box> // 第2行
 *     <Text>...</Text>
 *   </Box>
 * </MaxSizedBox>
 *
 * 在同一行 Box 内，无换行的 <Text> 子元素出现在有换行的 <Text> 子元素之后是错误的。
 *
 * @param element 要展平的 React 节点。
 * @returns `Row` 对象数组。
 */
function visitBoxRow(element: React.ReactNode): Row {
  if (
    !React.isValidElement<{ children?: React.ReactNode }>(element) ||
    element.type !== Box
  ) {
    debugReportError(
      `MaxSizedBox 的所有子元素必须是 <Box> 元素`,
      element,
    );
    return {
      noWrapSegments: [{ text: '<ERROR>', props: {} }],
      segments: [],
    };
  }

  if (enableDebugLog) {
    const boxProps = element.props as {
      children?: React.ReactNode | undefined;
      readonly flexDirection?:
        | 'row'
        | 'column'
        | 'row-reverse'
        | 'column-reverse'
        | undefined;
    };
    // 确保 Box 没有除默认属性和 key 之外的其他属性。
    let maxExpectedProps = 4;
    if (boxProps.children !== undefined) {
      // 允许 key 属性，该属性由 React 自动添加。
      maxExpectedProps += 1;
    }
    if (
      boxProps.flexDirection !== undefined &&
      boxProps.flexDirection !== 'row'
    ) {
      debugReportError(
        'MaxSizedBox 的子元素必须具有 flexDirection="row"。',
        element,
      );
    }
    if (Object.keys(boxProps).length > maxExpectedProps) {
      debugReportError(
        `MaxSizedBox 内的 Box 不得有额外的属性。${Object.keys(
          boxProps,
        ).join(', ')}`,
        element,
      );
    }
  }

  const row: Row = {
    noWrapSegments: [],
    segments: [],
  };

  let hasSeenWrapped = false;

  function visitRowChild(
    element: React.ReactNode,
    parentProps: Record<string, unknown> | undefined,
  ) {
    if (element === null) {
      return;
    }
    if (typeof element === 'string' || typeof element === 'number') {
      const text = String(element);
      // 忽略空字符串，因为它们不需要渲染。
      if (!text) {
        return;
      }

      const segment: StyledText = { text, props: parentProps ?? {} };

      // 检查合并属性中的 'wrap' 属性以决定段类型。
      if (parentProps === undefined || parentProps.wrap === 'wrap') {
        hasSeenWrapped = true;
        row.segments.push(segment);
      } else {
        if (!hasSeenWrapped) {
          row.noWrapSegments.push(segment);
        } else {
          // 放入换行段，因为行已处于换行模式。
          row.segments.push(segment);
          debugReportError(
            '在同一行中，无换行的文本元素不能出现在有换行的元素之后。',
            element,
          );
        }
      }
      return;
    }

    if (!React.isValidElement<{ children?: React.ReactNode }>(element)) {
      debugReportError('无效元素。', element);
      return;
    }

    if (element.type === Fragment) {
      React.Children.forEach(element.props.children, (child) =>
        visitRowChild(child, parentProps),
      );
      return;
    }

    if (element.type !== Text) {
      debugReportError(
        '行 Box 的子元素必须是 <Text> 元素。',
        element,
      );
      return;
    }

    // 从父 <Text> 元素合并属性。子属性优先。
    const { children, ...currentProps } = element.props;
    const mergedProps =
      parentProps === undefined
        ? currentProps
        : { ...parentProps, ...currentProps };
    React.Children.forEach(children, (child) =>
      visitRowChild(child, mergedProps),
    );
  }

  React.Children.forEach(element.props.children, (child) =>
    visitRowChild(child, undefined),
  );

  return row;
}

function layoutInkElementAsStyledText(
  element: React.ReactElement,
  maxWidth: number,
  output: StyledText[][],
) {
  const row = visitBoxRow(element);
  if (row.segments.length === 0 && row.noWrapSegments.length === 0) {
    // 如果没有要显示的段，则返回单个空行
    output.push([]);
    return;
  }

  const lines: StyledText[][] = [];
  const nonWrappingContent: StyledText[] = [];
  let noWrappingWidth = 0;

  // 首先，布局非换行段
  row.noWrapSegments.forEach((segment) => {
    nonWrappingContent.push(segment);
    noWrappingWidth += stringWidth(segment.text);
  });

  if (row.segments.length === 0) {
    // 当没有允许换行的段时，这是一个特殊情况。理想情况下应该统一。
    const lines: StyledText[][] = [];
    let currentLine: StyledText[] = [];
    nonWrappingContent.forEach((segment) => {
      const textLines = segment.text.split('\n');
      textLines.forEach((text, index) => {
        if (index > 0) {
          lines.push(currentLine);
          currentLine = [];
        }
        if (text) {
          currentLine.push({ text, props: segment.props });
        }
      });
    });
    if (
      currentLine.length > 0 ||
      (nonWrappingContent.length > 0 &&
        nonWrappingContent[nonWrappingContent.length - 1].text.endsWith('\n'))
    ) {
      lines.push(currentLine);
    }
    for (const line of lines) {
      output.push(line);
    }
    return;
  }

  const availableWidth = maxWidth - noWrappingWidth;

  if (availableWidth < 1) {
    // 没有空间渲染换行段。TODO(jacob314): 考虑替代的回退策略。
    output.push(nonWrappingContent);
    return;
  }

  // 现在，布局换行段
  let wrappingPart: StyledText[] = [];
  let wrappingPartWidth = 0;

  function addWrappingPartToLines() {
    if (lines.length === 0) {
      lines.push([...nonWrappingContent, ...wrappingPart]);
    } else {
      if (noWrappingWidth > 0) {
        lines.push([
          ...[{ text: ' '.repeat(noWrappingWidth), props: {} }],
          ...wrappingPart,
        ]);
      } else {
        lines.push(wrappingPart);
      }
    }
    wrappingPart = [];
    wrappingPartWidth = 0;
  }

  function addToWrappingPart(text: string, props: Record<string, unknown>) {
    if (
      wrappingPart.length > 0 &&
      wrappingPart[wrappingPart.length - 1].props === props
    ) {
      wrappingPart[wrappingPart.length - 1].text += text;
    } else {
      wrappingPart.push({ text, props });
    }
  }

  row.segments.forEach((segment) => {
    const linesFromSegment = segment.text.split('\n');

    linesFromSegment.forEach((lineText, lineIndex) => {
      if (lineIndex > 0) {
        addWrappingPartToLines();
      }

      const words = lineText.split(/(\s+)/); // 按空白字符分割

      words.forEach((word) => {
        if (!word) return;
        const wordWidth = stringWidth(word);

        if (
          wrappingPartWidth + wordWidth > availableWidth &&
          wrappingPartWidth > 0
        ) {
          addWrappingPartToLines();
          if (/^\s+$/.test(word)) {
            return;
          }
        }

        if (wordWidth > availableWidth) {
          // 单词太长，需要跨行分割
          const wordAsCodePoints = toCodePoints(word);
          let remainingWordAsCodePoints = wordAsCodePoints;
          while (remainingWordAsCodePoints.length > 0) {
            let splitIndex = 0;
            let currentSplitWidth = 0;
            for (const char of remainingWordAsCodePoints) {
              const charWidth = stringWidth(char);
              if (
                wrappingPartWidth + currentSplitWidth + charWidth >
                availableWidth
              ) {
                break;
              }
              currentSplitWidth += charWidth;
              splitIndex++;
            }

            if (splitIndex > 0) {
              const part = remainingWordAsCodePoints
                .slice(0, splitIndex)
                .join('');
              addToWrappingPart(part, segment.props);
              wrappingPartWidth += stringWidth(part);
              remainingWordAsCodePoints =
                remainingWordAsCodePoints.slice(splitIndex);
            }

            if (remainingWordAsCodePoints.length > 0) {
              addWrappingPartToLines();
            }
          }
        } else {
          addToWrappingPart(word, segment.props);
          wrappingPartWidth += wordWidth;
        }
      });
    });
    // split 会省略尾随换行符，所以我们需要在这里处理
    if (segment.text.endsWith('\n')) {
      addWrappingPartToLines();
    }
  });

  if (wrappingPart.length > 0) {
    addWrappingPartToLines();
  }
  for (const line of lines) {
    output.push(line);
  }
}