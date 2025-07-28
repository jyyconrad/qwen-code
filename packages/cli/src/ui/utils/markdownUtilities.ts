/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/*
**背景与目的：**

`findSafeSplitPoint` 函数旨在解决显示或处理大段 Markdown 文本（可能是流式传输）的挑战。当内容（例如来自 Gemini 等 LLM）以块状到达，或者内容太大而无法在单个显示单元（如消息气泡）中完整显示时，就需要进行分割。简单的分割方式（例如按字符限制直接切分）可能会破坏 Markdown 格式，特别是对于代码块、列表或块引用等多行元素，导致渲染错误。

该函数的目标是在提供的 `content` 字符串中找到一个“智能”或“安全”的索引位置进行分割，优先保证 Markdown 结构的完整性。

**关键期望与行为（按优先级排序）：**

1.  **长度足够短则不分割：**
    * 如果 `content.length` 小于或等于 `idealMaxLength`，函数应返回 `content.length`（表示因长度原因无需分割）。

2.  **代码块完整性（安全性的最高优先级）：**
    * 函数必须尽量避免在围栏代码块内（即在 ` ``` ` 和 ` ``` ` 之间）进行分割。
    * 如果 `idealMaxLength` 落在某个代码块内部：
        * 函数将尝试返回一个索引，将内容分割在该代码块*之前*。
        * 如果代码块从 `content` 的开头就开始，而 `idealMaxLength` 落在其中（意味着该代码块本身太长，无法放入第一个块），函数可能会返回 `0`。这实际上会使第一个块为空，将整个超长的代码块推到分割后的第二部分。
    * 在考虑代码块附近的分割点时，函数倾向于将整个代码块保留在其中一个结果块中。

3.  **Markdown 感知的换行分割（在不被代码块逻辑主导时）：**
    * 如果 `idealMaxLength` 不在代码块内（或在考虑完代码块因素后），函数将从 `idealMaxLength` 向前扫描，寻找自然的断点：
        * **段落分隔符：** 优先选择在双换行符 (`\n\n`) 之后分割，因为这通常表示段落或块级元素的结束。
        * **单个换行符：** 如果在合适的范围内找不到双换行符，则会寻找单个换行符 (`\n`)。
    * 任何被选为分割点的换行符都不得位于代码块内。

4.  **回退到 `idealMaxLength`：**
    * 如果在 `idealMaxLength` 之前未找到更“安全”的分割点（即符合代码块规则或找到合适的换行符），且 `idealMaxLength` 本身不是一个不安全的分割点（例如在代码块内），函数可能会返回一个大于 `idealMaxLength` 的长度，但再次强调，它*不能*破坏 Markdown 格式。这种情况可能出现在没有 Markdown 块结构或换行符的超长文本行中。

**本质上，`findSafeSplitPoint` 在被迫分割内容时，会努力成为一个良好的 Markdown 公民，优先选择结构性边界而非任意字符限制，并特别强调不破坏代码块。**
*/

/**
 * 检查字符串中的给定字符索引是否位于围栏（```）代码块内。
 * @param content 完整的字符串内容。
 * @param indexToTest 要测试的字符索引。
 * @returns 如果索引在代码块内容内则返回 true，否则返回 false。
 */
const isIndexInsideCodeBlock = (
  content: string,
  indexToTest: number,
): boolean => {
  let fenceCount = 0;
  let searchPos = 0;
  while (searchPos < content.length) {
    const nextFence = content.indexOf('```', searchPos);
    if (nextFence === -1 || nextFence >= indexToTest) {
      break;
    }
    fenceCount++;
    searchPos = nextFence + 3;
  }
  return fenceCount % 2 === 1;
};

/**
 * 查找包含给定索引的代码块的起始索引。
 * 如果索引不在代码块内，则返回 -1。
 * @param content Markdown 内容。
 * @param index 要检查的索引。
 * @returns 包含代码块的起始索引，或 -1。
 */
const findEnclosingCodeBlockStart = (
  content: string,
  index: number,
): number => {
  if (!isIndexInsideCodeBlock(content, index)) {
    return -1;
  }
  let currentSearchPos = 0;
  while (currentSearchPos < index) {
    const blockStartIndex = content.indexOf('```', currentSearchPos);
    if (blockStartIndex === -1 || blockStartIndex >= index) {
      break;
    }
    const blockEndIndex = content.indexOf('```', blockStartIndex + 3);
    if (blockStartIndex < index) {
      if (blockEndIndex === -1 || index < blockEndIndex + 3) {
        return blockStartIndex;
      }
    }
    if (blockEndIndex === -1) break;
    currentSearchPos = blockEndIndex + 3;
  }
  return -1;
};

export const findLastSafeSplitPoint = (content: string) => {
  const enclosingBlockStart = findEnclosingCodeBlockStart(
    content,
    content.length,
  );
  if (enclosingBlockStart !== -1) {
    // 内容末尾位于代码块中。在代码块前进行分割。
    return enclosingBlockStart;
  }

  // 搜索不在代码块内的最后一个双换行符 (\n\n)。
  let searchStartIndex = content.length;
  while (searchStartIndex >= 0) {
    const dnlIndex = content.lastIndexOf('\n\n', searchStartIndex);
    if (dnlIndex === -1) {
      // 未找到更多双换行符。
      break;
    }

    const potentialSplitPoint = dnlIndex + 2;
    if (!isIndexInsideCodeBlock(content, potentialSplitPoint)) {
      return potentialSplitPoint;
    }

    // 如果 potentialSplitPoint 位于代码块内，
    // 下一次搜索应从刚刚找到的 \n\n *之前* 开始，以确保进度。
    searchStartIndex = dnlIndex - 1;
  }

  // 如果未找到安全的双换行符，则返回 content.length
  // 以将整个内容保持为一个整体。
  return content.length;
};