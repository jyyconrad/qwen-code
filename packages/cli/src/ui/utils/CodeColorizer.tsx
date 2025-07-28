/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { common, createLowlight } from 'lowlight';
import type {
  Root,
  Element,
  Text as HastText,
  ElementContent,
  RootContent,
} from 'hast';
import { themeManager } from '../themes/theme-manager.js';
import { Theme } from '../themes/theme.js';
import {
  MaxSizedBox,
  MINIMUM_MAX_HEIGHT,
} from '../components/shared/MaxSizedBox.js';

// 配置主题和解析工具。
const lowlight = createLowlight(common);

function renderHastNode(
  node: Root | Element | HastText | RootContent,
  theme: Theme,
  inheritedColor: string | undefined,
): React.ReactNode {
  if (node.type === 'text') {
    // 使用从父元素继承的颜色（如果有的话）
    return <Text color={inheritedColor}>{node.value}</Text>;
  }

  // 处理元素节点：确定颜色并向下传递，不进行包装
  if (node.type === 'element') {
    const nodeClasses: string[] =
      (node.properties?.className as string[]) || [];
    let elementColor: string | undefined = undefined;

    // 查找为此元素类专门定义的颜色
    for (let i = nodeClasses.length - 1; i >= 0; i--) {
      const color = theme.getInkColor(nodeClasses[i]);
      if (color) {
        elementColor = color;
        break;
      }
    }

    // 确定要传递下去的颜色：如果找到此元素的特定颜色则使用它，
    // 否则继续传递已继承的颜色。
    const colorToPassDown = elementColor || inheritedColor;

    // 递归渲染子元素，将确定的颜色传递下去
    // 确保子类型匹配预期的HAST结构（ElementContent是常见的）
    const children = node.children?.map(
      (child: ElementContent, index: number) => (
        <React.Fragment key={index}>
          {renderHastNode(child, theme, colorToPassDown)}
        </React.Fragment>
      ),
    );

    // 元素节点现在只对子元素进行分组；颜色由Text节点应用。
    // 使用React Fragment以避免添加不必要的元素。
    return <React.Fragment>{children}</React.Fragment>;
  }

  // 处理根节点：使用初始继承颜色开始递归
  if (node.type === 'root') {
    // 检查子数组是否为空 - 当lowlight无法检测语言时会发生这种情况 – 回退到纯文本
    if (!node.children || node.children.length === 0) {
      return null;
    }

    // 传递初始继承颜色（可能来自顶层调用的undefined）
    // 确保子类型匹配预期的HAST结构（RootContent是常见的）
    return node.children?.map((child: RootContent, index: number) => (
      <React.Fragment key={index}>
        {renderHastNode(child, theme, inheritedColor)}
      </React.Fragment>
    ));
  }

  // 处理未知或不支持的节点类型
  return null;
}

/**
 * 为Ink应用程序渲染使用选定主题的语法高亮代码。
 *
 * @param code 要高亮的代码字符串。
 * @param language 语言标识符（例如，'javascript', 'css', 'html'）
 * @returns 包含高亮代码的Ink <Text> 元素的React.ReactNode。
 */
export function colorizeCode(
  code: string,
  language: string | null,
  availableHeight?: number,
  maxWidth?: number,
): React.ReactNode {
  const codeToHighlight = code.replace(/\n$/, '');
  const activeTheme = themeManager.getActiveTheme();

  try {
    // 使用适配的主题渲染HAST树
    // 将主题的默认前景色应用到顶层Text元素
    let lines = codeToHighlight.split('\n');
    const padWidth = String(lines.length).length; // 根据行数计算填充宽度

    let hiddenLinesCount = 0;

    // 优化以避免高亮不可能显示的行。
    if (availableHeight !== undefined) {
      availableHeight = Math.max(availableHeight, MINIMUM_MAX_HEIGHT);
      if (lines.length > availableHeight) {
        const sliceIndex = lines.length - availableHeight;
        hiddenLinesCount = sliceIndex;
        lines = lines.slice(sliceIndex);
      }
    }

    const getHighlightedLines = (line: string) =>
      !language || !lowlight.registered(language)
        ? lowlight.highlightAuto(line)
        : lowlight.highlight(language, line);

    return (
      <MaxSizedBox
        maxHeight={availableHeight}
        maxWidth={maxWidth}
        additionalHiddenLinesCount={hiddenLinesCount}
        overflowDirection="top"
      >
        {lines.map((line, index) => {
          const renderedNode = renderHastNode(
            getHighlightedLines(line),
            activeTheme,
            undefined,
          );

          const contentToRender = renderedNode !== null ? renderedNode : line;
          return (
            <Box key={index}>
              <Text color={activeTheme.colors.Gray}>
                {`${String(index + 1 + hiddenLinesCount).padStart(padWidth, ' ')} `}
              </Text>
              <Text color={activeTheme.defaultColor} wrap="wrap">
                {contentToRender}
              </Text>
            </Box>
          );
        })}
      </MaxSizedBox>
    );
  } catch (error) {
    console.error(
      `[colorizeCode] Error highlighting code for language "${language}":`,
      error,
    );
    // 出错时回退到带默认颜色的纯文本
    // 回退时也显示行号
    const lines = codeToHighlight.split('\n');
    const padWidth = String(lines.length).length; // 根据行数计算填充宽度
    return (
      <MaxSizedBox
        maxHeight={availableHeight}
        maxWidth={maxWidth}
        overflowDirection="top"
      >
        {lines.map((line, index) => (
          <Box key={index}>
            <Text color={activeTheme.defaultColor}>
              {`${String(index + 1).padStart(padWidth, ' ')} `}
            </Text>
            <Text color={activeTheme.colors.Gray}>{line}</Text>
          </Box>
        ))}
      </MaxSizedBox>
    );
  }
}