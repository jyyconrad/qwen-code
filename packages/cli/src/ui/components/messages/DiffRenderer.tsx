/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import crypto from 'crypto';
import { colorizeCode } from '../../utils/CodeColorizer.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'other';
  oldLine?: number;
  newLine?: number;
  content: string;
}

function parseDiffWithLineNumbers(diffContent: string): DiffLine[] {
  const lines = diffContent.split('\n');
  const result: DiffLine[] = [];
  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;
  const hunkHeaderRegex = /^@@ -(\d+),?\d* \+(\d+),?\d* @@/;

  for (const line of lines) {
    const hunkMatch = line.match(hunkHeaderRegex);
    if (hunkMatch) {
      currentOldLine = parseInt(hunkMatch[1], 10);
      currentNewLine = parseInt(hunkMatch[2], 10);
      inHunk = true;
      result.push({ type: 'hunk', content: line });
      // 我们需要调整起始点，因为第一个行号适用于第一个实际的行更改/上下文，
      // 但我们是在推送该行之前进行递增。所以这里先递减。
      currentOldLine--;
      currentNewLine--;
      continue;
    }
    if (!inHunk) {
      // 更健壮地跳过标准 Git 头部行
      if (
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('similarity index') ||
        line.startsWith('rename from') ||
        line.startsWith('rename to') ||
        line.startsWith('new file mode') ||
        line.startsWith('deleted file mode')
      )
        continue;
      // 如果不是区块或头部，则跳过（或根据需要处理为 'other'）
      continue;
    }
    if (line.startsWith('+')) {
      currentNewLine++; // 推送前递增
      result.push({
        type: 'add',
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('-')) {
      currentOldLine++; // 推送前递增
      result.push({
        type: 'del',
        oldLine: currentOldLine,
        content: line.substring(1),
      });
    } else if (line.startsWith(' ')) {
      currentOldLine++; // 推送前递增
      currentNewLine++;
      result.push({
        type: 'context',
        oldLine: currentOldLine,
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('\\')) {
      // 处理 "\ No newline at end of file"
      result.push({ type: 'other', content: line });
    }
  }
  return result;
}

interface DiffRendererProps {
  diffContent: string;
  filename?: string;
  tabWidth?: number;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

const DEFAULT_TAB_WIDTH = 4; // 每个制表符规范化为空格数

export const DiffRenderer: React.FC<DiffRendererProps> = ({
  diffContent,
  filename,
  tabWidth = DEFAULT_TAB_WIDTH,
  availableTerminalHeight,
  terminalWidth,
}) => {
  if (!diffContent || typeof diffContent !== 'string') {
    return <Text color={Colors.AccentYellow}>无差异内容。</Text>;
  }

  const parsedLines = parseDiffWithLineNumbers(diffContent);

  if (parsedLines.length === 0) {
    return (
      <Box borderStyle="round" borderColor={Colors.Gray} padding={1}>
        <Text dimColor>未检测到更改。</Text>
      </Box>
    );
  }

  // 检查差异是否表示新文件（仅包含添加和头部行）
  const isNewFile = parsedLines.every(
    (line) =>
      line.type === 'add' ||
      line.type === 'hunk' ||
      line.type === 'other' ||
      line.content.startsWith('diff --git') ||
      line.content.startsWith('new file mode'),
  );

  let renderedOutput;

  if (isNewFile) {
    // 仅提取添加行的内容
    const addedContent = parsedLines
      .filter((line) => line.type === 'add')
      .map((line) => line.content)
      .join('\n');
    // 尝试从文件名推断语言，如果没有文件名则默认为纯文本
    const fileExtension = filename?.split('.').pop() || null;
    const language = fileExtension
      ? getLanguageFromExtension(fileExtension)
      : null;
    renderedOutput = colorizeCode(
      addedContent,
      language,
      availableTerminalHeight,
      terminalWidth,
    );
  } else {
    renderedOutput = renderDiffContent(
      parsedLines,
      filename,
      tabWidth,
      availableTerminalHeight,
      terminalWidth,
    );
  }

  return renderedOutput;
};

const renderDiffContent = (
  parsedLines: DiffLine[],
  filename: string | undefined,
  tabWidth = DEFAULT_TAB_WIDTH,
  availableTerminalHeight: number | undefined,
  terminalWidth: number,
) => {
  // 1. 规范化空白字符（将制表符替换为空格）在进一步处理之前
  const normalizedLines = parsedLines.map((line) => ({
    ...line,
    content: line.content.replace(/\t/g, ' '.repeat(tabWidth)),
  }));

  // 使用规范化列表过滤掉不可显示的行（区块，可能的 'other'）
  const displayableLines = normalizedLines.filter(
    (l) => l.type !== 'hunk' && l.type !== 'other',
  );

  if (displayableLines.length === 0) {
    return (
      <Box borderStyle="round" borderColor={Colors.Gray} padding={1}>
        <Text dimColor>未检测到更改。</Text>
      </Box>
    );
  }

  // 计算所有可显示行的最小缩进
  let baseIndentation = Infinity; // 从高值开始以找到最小值
  for (const line of displayableLines) {
    // 仅考虑有实际内容的行来计算缩进
    if (line.content.trim() === '') continue;

    const firstCharIndex = line.content.search(/\S/); // 查找第一个非空白字符的索引
    const currentIndent = firstCharIndex === -1 ? 0 : firstCharIndex; // 如果没有找到非空白字符则缩进为 0
    baseIndentation = Math.min(baseIndentation, currentIndent);
  }
  // 如果 baseIndentation 仍为 Infinity（例如，没有有内容的可显示行），则默认为 0
  if (!isFinite(baseIndentation)) {
    baseIndentation = 0;
  }

  const key = filename
    ? `diff-box-${filename}`
    : `diff-box-${crypto.createHash('sha1').update(JSON.stringify(parsedLines)).digest('hex')}`;

  let lastLineNumber: number | null = null;
  const MAX_CONTEXT_LINES_WITHOUT_GAP = 5;

  return (
    <MaxSizedBox
      maxHeight={availableTerminalHeight}
      maxWidth={terminalWidth}
      key={key}
    >
      {displayableLines.reduce<React.ReactNode[]>((acc, line, index) => {
        // 根据类型确定用于间隙计算的相关行号
        let relevantLineNumberForGapCalc: number | null = null;
        if (line.type === 'add' || line.type === 'context') {
          relevantLineNumberForGapCalc = line.newLine ?? null;
        } else if (line.type === 'del') {
          // 对于删除，间隙通常与原始文件的行号相关
          relevantLineNumberForGapCalc = line.oldLine ?? null;
        }

        if (
          lastLineNumber !== null &&
          relevantLineNumberForGapCalc !== null &&
          relevantLineNumberForGapCalc >
            lastLineNumber + MAX_CONTEXT_LINES_WITHOUT_GAP + 1
        ) {
          acc.push(
            <Box key={`gap-${index}`}>
              <Text wrap="truncate">{'═'.repeat(terminalWidth)}</Text>
            </Box>,
          );
        }

        const lineKey = `diff-line-${index}`;
        let gutterNumStr = '';
        let color: string | undefined = undefined;
        let prefixSymbol = ' ';
        let dim = false;

        switch (line.type) {
          case 'add':
            gutterNumStr = (line.newLine ?? '').toString();
            color = 'green';
            prefixSymbol = '+';
            lastLineNumber = line.newLine ?? null;
            break;
          case 'del':
            gutterNumStr = (line.oldLine ?? '').toString();
            color = 'red';
            prefixSymbol = '-';
            // 对于删除，如果行号在递增，则基于 oldLine 更新 lastLineNumber。
            // 这有助于正确管理间隙，如果有多行连续删除
            // 或删除后跟着原始文件中相距很远的上下文行。
            if (line.oldLine !== undefined) {
              lastLineNumber = line.oldLine;
            }
            break;
          case 'context':
            gutterNumStr = (line.newLine ?? '').toString();
            dim = true;
            prefixSymbol = ' ';
            lastLineNumber = line.newLine ?? null;
            break;
          default:
            return acc;
        }

        const displayContent = line.content.substring(baseIndentation);

        acc.push(
          <Box key={lineKey} flexDirection="row">
            <Text color={Colors.Gray}>{gutterNumStr.padEnd(4)} </Text>
            <Text color={color} dimColor={dim}>
              {prefixSymbol}{' '}
            </Text>
            <Text color={color} dimColor={dim} wrap="wrap">
              {displayContent}
            </Text>
          </Box>,
        );
        return acc;
      }, [])}
    </MaxSizedBox>
  );
};

const getLanguageFromExtension = (extension: string): string | null => {
  const languageMap: { [key: string]: string } = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    json: 'json',
    css: 'css',
    html: 'html',
    sh: 'bash',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    txt: 'plaintext',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    rb: 'ruby',
  };
  return languageMap[extension] || null; // 如果未找到扩展名则返回 null
};