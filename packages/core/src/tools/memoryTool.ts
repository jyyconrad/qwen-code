/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { FunctionDeclaration, Type } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const memoryToolSchemaData: FunctionDeclaration = {
  name: 'save_memory',
  description:
    '将特定信息或事实保存到你的长期记忆中。当用户明确要求你记住某些内容，或当他们陈述一个清晰、简洁且似乎对将来互动很重要的事实时，请使用此工具。',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: {
        type: Type.STRING,
        description:
          '需要记住的特定事实或信息。应该是一个清晰、独立的陈述。',
      },
    },
    required: ['fact'],
  },
};

const memoryToolDescription = `
将特定信息或事实保存到你的长期记忆中。

使用此工具：

- 当用户明确要求你记住某些内容时（例如，"记住我喜欢菠萝披萨"，"请保存这个：我猫的名字叫Whiskers"）。
- 当用户陈述一个关于他们自己、他们的偏好或环境的清晰、简洁的事实，并且这些信息对将来提供更个性化和有效的帮助很重要时。

不要使用此工具：

- 记住仅与当前会话相关的对话上下文。
- 保存长篇、复杂或冗长的文本。事实应该是相对简短和切题的。
- 如果你不确定信息是否是值得长期记住的事实。如有疑问，可以询问用户："我应该为你记住这个吗？"

## 参数

- \`fact\` (string, 必需): 需要记住的特定事实或信息。这应该是一个清晰、独立的陈述。例如，如果用户说"My favorite color is blue"，那么事实就是"My favorite color is blue"。
`;

export const GEMINI_CONFIG_DIR = '.iflycode';
export const DEFAULT_CONTEXT_FILENAME = 'IFLYCODE.md';
export const MEMORY_SECTION_HEADER = '## iFlyCode 添加的记忆';

// 此变量将保存当前配置的GEMINI.md上下文文件名。
// 它默认为DEFAULT_CONTEXT_FILENAME，但可以通过setGeminiMdFilename覆盖。
let currentGeminiMdFilename: string | string[] = DEFAULT_CONTEXT_FILENAME;

export function setGeminiMdFilename(newFilename: string | string[]): void {
  if (Array.isArray(newFilename)) {
    if (newFilename.length > 0) {
      currentGeminiMdFilename = newFilename.map((name) => name.trim());
    }
  } else if (newFilename && newFilename.trim() !== '') {
    currentGeminiMdFilename = newFilename.trim();
  }
}

export function getCurrentGeminiMdFilename(): string {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename[0];
  }
  return currentGeminiMdFilename;
}

export function getAllGeminiMdFilenames(): string[] {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename;
  }
  return [currentGeminiMdFilename];
}

interface SaveMemoryParams {
  fact: string;
}

function getGlobalMemoryFilePath(): string {
  return path.join(homedir(), GEMINI_CONFIG_DIR, getCurrentGeminiMdFilename());
}

/**
 * 确保在追加内容前有适当的换行分隔。
 */
function ensureNewlineSeparation(currentContent: string): string {
  if (currentContent.length === 0) return '';
  if (currentContent.endsWith('\n\n') || currentContent.endsWith('\r\n\r\n'))
    return '';
  if (currentContent.endsWith('\n') || currentContent.endsWith('\r\n'))
    return '\n';
  return '\n\n';
}

export class MemoryTool extends BaseTool<SaveMemoryParams, ToolResult> {
  static readonly Name: string = memoryToolSchemaData.name!;
  constructor() {
    super(
      MemoryTool.Name,
      '保存记忆',
      memoryToolDescription,
      memoryToolSchemaData.parameters as Record<string, unknown>,
    );
  }

  static async performAddMemoryEntry(
    text: string,
    memoryFilePath: string,
    fsAdapter: {
      readFile: (path: string, encoding: 'utf-8') => Promise<string>;
      writeFile: (
        path: string,
        data: string,
        encoding: 'utf-8',
      ) => Promise<void>;
      mkdir: (
        path: string,
        options: { recursive: boolean },
      ) => Promise<string | undefined>;
    },
  ): Promise<void> {
    let processedText = text.trim();
    // 移除可能被误解为markdown列表项的前导连字符和空格
    processedText = processedText.replace(/^(-+\s*)+/, '').trim();
    const newMemoryItem = `- ${processedText}`;

    try {
      await fsAdapter.mkdir(path.dirname(memoryFilePath), { recursive: true });
      let content = '';
      try {
        content = await fsAdapter.readFile(memoryFilePath, 'utf-8');
      } catch (_e) {
        // 文件不存在，将使用标题和条目创建。
      }

      const headerIndex = content.indexOf(MEMORY_SECTION_HEADER);

      if (headerIndex === -1) {
        // 未找到标题，追加标题然后是条目
        const separator = ensureNewlineSeparation(content);
        content += `${separator}${MEMORY_SECTION_HEADER}\n${newMemoryItem}\n`;
      } else {
        // 找到标题，确定在哪里插入新的记忆条目
        const startOfSectionContent =
          headerIndex + MEMORY_SECTION_HEADER.length;
        let endOfSectionIndex = content.indexOf('\n## ', startOfSectionContent);
        if (endOfSectionIndex === -1) {
          endOfSectionIndex = content.length; // 文件结尾
        }

        const beforeSectionMarker = content
          .substring(0, startOfSectionContent)
          .trimEnd();
        let sectionContent = content
          .substring(startOfSectionContent, endOfSectionIndex)
          .trimEnd();
        const afterSectionMarker = content.substring(endOfSectionIndex);

        sectionContent += `\n${newMemoryItem}`;
        content =
          `${beforeSectionMarker}\n${sectionContent.trimStart()}\n${afterSectionMarker}`.trimEnd() +
          '\n';
      }
      await fsAdapter.writeFile(memoryFilePath, content, 'utf-8');
    } catch (error) {
      console.error(
        `[MemoryTool] 向 ${memoryFilePath} 添加记忆条目时出错:`,
        error,
      );
      throw new Error(
        `[MemoryTool] 添加记忆条目失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async execute(
    params: SaveMemoryParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const { fact } = params;

    if (!fact || typeof fact !== 'string' || fact.trim() === '') {
      const errorMessage = '参数 "fact" 必须是非空字符串。';
      return {
        llmContent: JSON.stringify({ success: false, error: errorMessage }),
        returnDisplay: `错误: ${errorMessage}`,
      };
    }

    try {
      // 使用静态方法和实际的fs promises
      await MemoryTool.performAddMemoryEntry(fact, getGlobalMemoryFilePath(), {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      });
      const successMessage = `好的，我已经记住了："${fact}"`;
      return {
        llmContent: JSON.stringify({ success: true, message: successMessage }),
        returnDisplay: successMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[MemoryTool] 执行保存记忆操作时出错，事实 "${fact}": ${errorMessage}`,
      );
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `保存记忆失败。详情: ${errorMessage}`,
        }),
        returnDisplay: `保存记忆时出错: ${errorMessage}`,
      };
    }
  }
}