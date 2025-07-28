/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';
import { RenderInline, getPlainTextLength } from './InlineMarkdownRenderer.js';

interface TableRendererProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

/**
 * 用于 markdown 表格的自定义表格渲染器
 * 我们自己实现而不是使用 ink-table 是因为模块兼容性问题
 */
export const TableRenderer: React.FC<TableRendererProps> = ({
  headers,
  rows,
  terminalWidth,
}) => {
  // 使用 markdown 处理后的实际显示宽度来计算列宽
  const columnWidths = headers.map((header, index) => {
    const headerWidth = getPlainTextLength(header);
    const maxRowWidth = Math.max(
      ...rows.map((row) => getPlainTextLength(row[index] || '')),
    );
    return Math.max(headerWidth, maxRowWidth) + 2; // 添加内边距
  });

  // 确保表格适合终端宽度
  const totalWidth = columnWidths.reduce((sum, width) => sum + width + 1, 1);
  const scaleFactor =
    totalWidth > terminalWidth ? terminalWidth / totalWidth : 1;
  const adjustedWidths = columnWidths.map((width) =>
    Math.floor(width * scaleFactor),
  );

  // 渲染具有适当宽度的单元格的辅助函数
  const renderCell = (
    content: string,
    width: number,
    isHeader = false,
  ): React.ReactNode => {
    const contentWidth = Math.max(0, width - 2);
    const displayWidth = getPlainTextLength(content);

    let cellContent = content;
    if (displayWidth > contentWidth) {
      if (contentWidth <= 3) {
        // 仅按字符数截断
        cellContent = content.substring(
          0,
          Math.min(content.length, contentWidth),
        );
      } else {
        // 使用二分搜索保留 markdown 格式的截断
        let left = 0;
        let right = content.length;
        let bestTruncated = content;

        // 二分搜索找到最佳截断点
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          const candidate = content.substring(0, mid);
          const candidateWidth = getPlainTextLength(candidate);

          if (candidateWidth <= contentWidth - 3) {
            bestTruncated = candidate;
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        }

        cellContent = bestTruncated + '...';
      }
    }

    // 计算所需的确切填充
    const actualDisplayWidth = getPlainTextLength(cellContent);
    const paddingNeeded = Math.max(0, contentWidth - actualDisplayWidth);

    return (
      <Text>
        {isHeader ? (
          <Text bold color={Colors.AccentCyan}>
            <RenderInline text={cellContent} />
          </Text>
        ) : (
          <RenderInline text={cellContent} />
        )}
        {' '.repeat(paddingNeeded)}
      </Text>
    );
  };

  // 渲染边框的辅助函数
  const renderBorder = (type: 'top' | 'middle' | 'bottom'): React.ReactNode => {
    const chars = {
      top: { left: '┌', middle: '┬', right: '┐', horizontal: '─' },
      middle: { left: '├', middle: '┼', right: '┤', horizontal: '─' },
      bottom: { left: '└', middle: '┴', right: '┘', horizontal: '─' },
    };

    const char = chars[type];
    const borderParts = adjustedWidths.map((w) => char.horizontal.repeat(w));
    const border = char.left + borderParts.join(char.middle) + char.right;

    return <Text>{border}</Text>;
  };

  // 渲染表格行的辅助函数
  const renderRow = (cells: string[], isHeader = false): React.ReactNode => {
    const renderedCells = cells.map((cell, index) => {
      const width = adjustedWidths[index] || 0;
      return renderCell(cell || '', width, isHeader);
    });

    return (
      <Text>
        │{' '}
        {renderedCells.map((cell, index) => (
          <React.Fragment key={index}>
            {cell}
            {index < renderedCells.length - 1 ? ' │ ' : ''}
          </React.Fragment>
        ))}{' '}
        │
      </Text>
    );
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {/* 顶边框 */}
      {renderBorder('top')}

      {/* 表头行 */}
      {renderRow(headers, true)}

      {/* 中间边框 */}
      {renderBorder('middle')}

      {/* 数据行 */}
      {rows.map((row, index) => (
        <React.Fragment key={index}>{renderRow(row)}</React.Fragment>
      ))}

      {/* 底边框 */}
      {renderBorder('bottom')}
    </Box>
  );
};