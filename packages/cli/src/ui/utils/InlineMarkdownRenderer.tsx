/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import stringWidth from 'string-width';

// Markdown 解析的常量
const BOLD_MARKER_LENGTH = 2; // 对于 "**"
const ITALIC_MARKER_LENGTH = 1; // 对于 "*" 或 "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // 对于 "~~"
const INLINE_CODE_MARKER_LENGTH = 1; // 对于 "`"
const UNDERLINE_TAG_START_LENGTH = 3; // 对于 "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // 对于 "</u>"

interface RenderInlineProps {
  text: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({ text }) => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  const inlineRegex =
    /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>)/g;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`t-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      );
    }

    const fullMatch = match[0];
    let renderedNode: React.ReactNode = null;
    const key = `m-${match.index}`;

    try {
      if (
        fullMatch.startsWith('**') &&
        fullMatch.endsWith('**') &&
        fullMatch.length > BOLD_MARKER_LENGTH * 2
      ) {
        renderedNode = (
          <Text key={key} bold>
            {fullMatch.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH)}
          </Text>
        );
      } else if (
        fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
        ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
          (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
        !/\w/.test(text.substring(match.index - 1, match.index)) &&
        !/\w/.test(
          text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 1),
        ) &&
        !/\S[./\\]/.test(text.substring(match.index - 2, match.index)) &&
        !/[./\\]\S/.test(
          text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 2),
        )
      ) {
        renderedNode = (
          <Text key={key} italic>
            {fullMatch.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH)}
          </Text>
        );
      } else if (
        fullMatch.startsWith('~~') &&
        fullMatch.endsWith('~~') &&
        fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2
      ) {
        renderedNode = (
          <Text key={key} strikethrough>
            {fullMatch.slice(
              STRIKETHROUGH_MARKER_LENGTH,
              -STRIKETHROUGH_MARKER_LENGTH,
            )}
          </Text>
        );
      } else if (
        fullMatch.startsWith('`') &&
        fullMatch.endsWith('`') &&
        fullMatch.length > INLINE_CODE_MARKER_LENGTH
      ) {
        const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
        if (codeMatch && codeMatch[2]) {
          renderedNode = (
            <Text key={key} color={Colors.AccentPurple}>
              {codeMatch[2]}
            </Text>
          );
        }
      } else if (
        fullMatch.startsWith('[') &&
        fullMatch.includes('](') &&
        fullMatch.endsWith(')')
      ) {
        const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          const linkText = linkMatch[1];
          const url = linkMatch[2];
          renderedNode = (
            <Text key={key}>
              {linkText}
              <Text color={Colors.AccentBlue}> ({url})</Text>
            </Text>
          );
        }
      } else if (
        fullMatch.startsWith('<u>') &&
        fullMatch.endsWith('</u>') &&
        fullMatch.length >
          UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1 // -1 因为长度与开始和结束标签的组合长度进行比较
      ) {
        renderedNode = (
          <Text key={key} underline>
            {fullMatch.slice(
              UNDERLINE_TAG_START_LENGTH,
              -UNDERLINE_TAG_END_LENGTH,
            )}
          </Text>
        );
      }
    } catch (e) {
      console.error('解析内联 markdown 部分时出错:', fullMatch, e);
      renderedNode = null;
    }

    nodes.push(renderedNode ?? <Text key={key}>{fullMatch}</Text>);
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(<Text key={`t-${lastIndex}`}>{text.slice(lastIndex)}</Text>);
  }

  return <>{nodes.filter((node) => node !== null)}</>;
};

export const RenderInline = React.memo(RenderInlineInternal);

/**
 * 获取带 markdown 格式的字符串的纯文本长度的工具函数
 * 这对于计算表格中的列宽很有用
 */
export const getPlainTextLength = (text: string): number => {
  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');
  return stringWidth(cleanText);
};