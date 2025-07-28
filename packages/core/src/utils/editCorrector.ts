/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentConfig,
  SchemaUnion,
  Type,
} from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { EditToolParams, EditTool } from '../tools/edit.js';
import { WriteFileTool } from '../tools/write-file.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { GrepTool } from '../tools/grep.js';
import { LruCache } from './LruCache.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import {
  isFunctionResponse,
  isFunctionCall,
} from '../utils/messageInspectors.js';
import * as fs from 'fs';

const EditModel = DEFAULT_GEMINI_FLASH_MODEL;
const EditConfig: GenerateContentConfig = {
  thinkingConfig: {
    thinkingBudget: 0,
  },
};

const MAX_CACHE_SIZE = 50;

// ensureCorrectEdit 结果的缓存
const editCorrectionCache = new LruCache<string, CorrectedEditResult>(
  MAX_CACHE_SIZE,
);

// ensureCorrectFileContent 结果的缓存
const fileContentCorrectionCache = new LruCache<string, string>(MAX_CACHE_SIZE);

/**
 * 定义 CorrectedEditResult 中参数的结构
 */
interface CorrectedEditParams {
  file_path: string;
  old_string: string;
  new_string: string;
}

/**
 * 定义 ensureCorrectEdit 的结果结构。
 */
export interface CorrectedEditResult {
  params: CorrectedEditParams;
  occurrences: number;
}

/**
 * 从 .id 值中提取时间戳，格式为
 * <tool.name>-<timestamp>-<uuid>
 * @param fcnId 函数调用或函数响应对象的 ID 值
 * @returns 如果无法提取时间戳则返回 -1，否则返回时间戳（数字）
 */
function getTimestampFromFunctionId(fcnId: string): number {
  const idParts = fcnId.split('-');
  if (idParts.length > 2) {
    const timestamp = parseInt(idParts[1], 10);
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }
  return -1;
}

/**
 * 将查看 gemini 客户端历史记录并确定对目标文件的最近一次编辑何时发生。
 * 如果没有发生编辑，将返回 -1
 * @param filePath 文件路径
 * @param client geminiClient，用于获取历史记录
 * @returns 上次编辑发生的时间（数字形式的 DateTime），如果未找到编辑则返回 -1。
 */
async function findLastEditTimestamp(
  filePath: string,
  client: GeminiClient,
): Promise<number> {
  const history = (await client.getHistory()) ?? [];

  // 可能在其 FunctionResponse `output` 中引用文件路径的工具。
  const toolsInResp = new Set([
    WriteFileTool.Name,
    EditTool.Name,
    ReadManyFilesTool.Name,
    GrepTool.Name,
  ]);
  // 可能在其 FunctionCall `args` 中引用文件路径的工具。
  const toolsInCall = new Set([...toolsInResp, ReadFileTool.Name]);

  // 反向迭代以找到最近的相关操作。
  for (const entry of history.slice().reverse()) {
    if (!entry.parts) continue;

    for (const part of entry.parts) {
      let id: string | undefined;
      let content: unknown;

      // 检查带有文件路径参数的相关 FunctionCall。
      if (
        isFunctionCall(entry) &&
        part.functionCall?.name &&
        toolsInCall.has(part.functionCall.name)
      ) {
        id = part.functionCall.id;
        content = part.functionCall.args;
      }
      // 检查带有文件路径输出的相关 FunctionResponse。
      else if (
        isFunctionResponse(entry) &&
        part.functionResponse?.name &&
        toolsInResp.has(part.functionResponse.name)
      ) {
        const { response } = part.functionResponse;
        if (response && !('error' in response) && 'output' in response) {
          id = part.functionResponse.id;
          content = response.output;
        }
      }

      if (!id || content === undefined) continue;

      // 使用“钝锤”方法在内容中查找文件路径。
      // 注意，工具响应数据在成功和错误情况下的格式不一致 - 所以我们只是检查是否存在，
      // 作为对响应是否发生错误/失败的最佳猜测。
      const stringified = JSON.stringify(content);
      if (
        !stringified.includes('Error') && // 仅适用于 functionResponse
        !stringified.includes('Failed') && // 仅适用于 functionResponse
        stringified.includes(filePath)
      ) {
        return getTimestampFromFunctionId(id);
      }
    }
  }

  return -1;
}

/**
 * 如果原始 old_string 未找到，则尝试纠正编辑参数。
 * 它会尝试取消转义，然后基于 LLM 进行纠正。
 * 结果会被缓存以避免重复处理。
 *
 * @param currentContent 文件的当前内容。
 * @param originalParams 原始 EditToolParams
 * @param client 用于 LLM 调用的 GeminiClient。
 * @returns 解析为包含（可能已纠正的）EditToolParams（作为 CorrectedEditParams）和最终出现次数的对象的 Promise。
 */
export async function ensureCorrectEdit(
  filePath: string,
  currentContent: string,
  originalParams: EditToolParams, // 这是来自 edit.ts 的 EditToolParams，不包含 'corrected'
  client: GeminiClient,
  abortSignal: AbortSignal,
): Promise<CorrectedEditResult> {
  const cacheKey = `${currentContent}---${originalParams.old_string}---${originalParams.new_string}`;
  const cachedResult = editCorrectionCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  let finalNewString = originalParams.new_string;
  const newStringPotentiallyEscaped =
    unescapeStringForGeminiBug(originalParams.new_string) !==
    originalParams.new_string;

  const expectedReplacements = originalParams.expected_replacements ?? 1;

  let finalOldString = originalParams.old_string;
  let occurrences = countOccurrences(currentContent, finalOldString);

  if (occurrences === expectedReplacements) {
    if (newStringPotentiallyEscaped) {
      finalNewString = await correctNewStringEscaping(
        client,
        finalOldString,
        originalParams.new_string,
        abortSignal,
      );
    }
  } else if (occurrences > expectedReplacements) {
    const expectedReplacements = originalParams.expected_replacements ?? 1;

    // 如果用户期望多次替换，按原样返回
    if (occurrences === expectedReplacements) {
      const result: CorrectedEditResult = {
        params: { ...originalParams },
        occurrences,
      };
      editCorrectionCache.set(cacheKey, result);
      return result;
    }

    // 如果用户期望 1 次但找到多次，尝试纠正（现有行为）
    if (expectedReplacements === 1) {
      const result: CorrectedEditResult = {
        params: { ...originalParams },
        occurrences,
      };
      editCorrectionCache.set(cacheKey, result);
      return result;
    }

    // 如果出现次数与预期不符，按原样返回（稍后将失败验证）
    const result: CorrectedEditResult = {
      params: { ...originalParams },
      occurrences,
    };
    editCorrectionCache.set(cacheKey, result);
    return result;
  } else {
    // 出现次数最初为 0 或其他意外状态
    const unescapedOldStringAttempt = unescapeStringForGeminiBug(
      originalParams.old_string,
    );
    occurrences = countOccurrences(currentContent, unescapedOldStringAttempt);

    if (occurrences === expectedReplacements) {
      finalOldString = unescapedOldStringAttempt;
      if (newStringPotentiallyEscaped) {
        finalNewString = await correctNewString(
          client,
          originalParams.old_string, // 原始旧值
          unescapedOldStringAttempt, // 纠正后的旧值
          originalParams.new_string, // 原始新值（可能是转义的）
          abortSignal,
        );
      }
    } else if (occurrences === 0) {
      if (filePath) {
        // 为了避免覆盖系统外的编辑，
        // 让我们检查文件是否有比我们系统更近期的编辑
        const lastEditedByUsTime = await findLastEditTimestamp(
          filePath,
          client,
        );

        // 添加 1 秒缓冲区以考虑时间不准确。如果文件
        // 在上次编辑工具运行后超过一秒被修改，我们可以假设它被其他东西修改了。
        if (lastEditedByUsTime > 0) {
          const stats = fs.statSync(filePath);
          const diff = stats.mtimeMs - lastEditedByUsTime;
          if (diff > 2000) {
            // 硬编码为 2 秒
            // 此文件被更早编辑
            const result: CorrectedEditResult = {
              params: { ...originalParams },
              occurrences: 0, // 明确为 0，因为 LLM 失败
            };
            editCorrectionCache.set(cacheKey, result);
            return result;
          }
        }
      }

      const llmCorrectedOldString = await correctOldStringMismatch(
        client,
        currentContent,
        unescapedOldStringAttempt,
        abortSignal,
      );
      const llmOldOccurrences = countOccurrences(
        currentContent,
        llmCorrectedOldString,
      );

      if (llmOldOccurrences === expectedReplacements) {
        finalOldString = llmCorrectedOldString;
        occurrences = llmOldOccurrences;

        if (newStringPotentiallyEscaped) {
          const baseNewStringForLLMCorrection = unescapeStringForGeminiBug(
            originalParams.new_string,
          );
          finalNewString = await correctNewString(
            client,
            originalParams.old_string, // 原始旧值
            llmCorrectedOldString, // 纠正后的旧值
            baseNewStringForLLMCorrection, // 用于纠正的基础新值
            abortSignal,
          );
        }
      } else {
        // LLM 对 old_string 的纠正也失败了
        const result: CorrectedEditResult = {
          params: { ...originalParams },
          occurrences: 0, // 明确为 0，因为 LLM 失败
        };
        editCorrectionCache.set(cacheKey, result);
        return result;
      }
    } else {
      // 取消转义 old_string 导致 > 1 次出现
      const result: CorrectedEditResult = {
        params: { ...originalParams },
        occurrences, // 这将 > 1
      };
      editCorrectionCache.set(cacheKey, result);
      return result;
    }
  }

  const { targetString, pair } = trimPairIfPossible(
    finalOldString,
    finalNewString,
    currentContent,
    expectedReplacements,
  );
  finalOldString = targetString;
  finalNewString = pair;

  // 最终结果构建
  const result: CorrectedEditResult = {
    params: {
      file_path: originalParams.file_path,
      old_string: finalOldString,
      new_string: finalNewString,
    },
    occurrences: countOccurrences(currentContent, finalOldString), // 使用最终的 old_string 重新计算出现次数
  };
  editCorrectionCache.set(cacheKey, result);
  return result;
}

export async function ensureCorrectFileContent(
  content: string,
  client: GeminiClient,
  abortSignal: AbortSignal,
): Promise<string> {
  const cachedResult = fileContentCorrectionCache.get(content);
  if (cachedResult) {
    return cachedResult;
  }

  const contentPotentiallyEscaped =
    unescapeStringForGeminiBug(content) !== content;
  if (!contentPotentiallyEscaped) {
    fileContentCorrectionCache.set(content, content);
    return content;
  }

  const correctedContent = await correctStringEscaping(
    content,
    client,
    abortSignal,
  );
  fileContentCorrectionCache.set(content, correctedContent);
  return correctedContent;
}

// 为 old_string 纠正定义 LLM 响应的预期 JSON 模式
const OLD_STRING_CORRECTION_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    corrected_target_snippet: {
      type: Type.STRING,
      description:
        '目标片段的纠正版本，与提供的文件内容中的段落完全且唯一匹配。',
    },
  },
  required: ['corrected_target_snippet'],
};

export async function correctOldStringMismatch(
  geminiClient: GeminiClient,
  fileContent: string,
  problematicSnippet: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const prompt = `
上下文：一个进程需要在文件内容中找到特定文本片段的完全字面、唯一匹配。提供的片段未能完全匹配。这很可能是因为它被过度转义了。

任务：分析提供的文件内容和有问题的目标片段。识别文件内容中最可能与该片段匹配的段落。输出该段落的完全字面文本。仅专注于移除多余的转义字符和纠正格式、空白或微小差异，以实现完美的字面匹配。输出必须是文件中出现的完全字面文本。

有问题的目标片段：
\`\`\`
${problematicSnippet}
\`\`\`

文件内容：
\`\`\`
${fileContent}
\`\`\`

例如，如果问题目标片段是 "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" 而文件内容中有类似 "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;" 的内容，那么 corrected_target_snippet 应该可能是 "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;" 以修复不正确的转义以匹配原始文件内容。
如果差异仅在于空白或格式，请对 corrected_target_snippet 应用类似的空白/格式更改。

仅以指定的 JSON 格式返回纠正后的目标片段，键为 'corrected_target_snippet'。如果找不到明确、唯一的匹配，请为 'corrected_target_snippet' 返回空字符串。
`.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await geminiClient.generateJson(
      contents,
      OLD_STRING_CORRECTION_SCHEMA,
      abortSignal,
      EditModel,
      EditConfig,
    );

    if (
      result &&
      typeof result.corrected_target_snippet === 'string' &&
      result.corrected_target_snippet.length > 0
    ) {
      return result.corrected_target_snippet;
    } else {
      return problematicSnippet;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    console.error(
      '旧字符串片段纠正期间的 LLM 调用错误：',
      error,
    );

    return problematicSnippet;
  }
}

// 为 new_string 纠正定义 LLM 响应的预期 JSON 模式
const NEW_STRING_CORRECTION_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    corrected_new_string: {
      type: Type.STRING,
      description:
        '根据纠正后的 old_string 调整的 original_new_string，在保持原始更改意图的同时。',
    },
  },
  required: ['corrected_new_string'],
};

/**
 * 调整 new_string 以与纠正后的 old_string 对齐，同时保持原始意图。
 */
export async function correctNewString(
  geminiClient: GeminiClient,
  originalOldString: string,
  correctedOldString: string,
  originalNewString: string,
  abortSignal: AbortSignal,
): Promise<string> {
  if (originalOldString === correctedOldString) {
    return originalNewString;
  }

  const prompt = `
上下文：计划进行文本替换操作。要替换的原始文本（original_old_string）与文件中的实际文本（corrected_old_string）略有不同。现在 original_old_string 已被纠正以匹配文件内容。
我们现在需要调整替换文本（original_new_string），使其作为 corrected_old_string 的替换有意义，同时保持原始更改的精神。

original_old_string（最初打算找到的内容）：
\`\`\`
${originalOldString}
\`\`\`

corrected_old_string（实际在文件中找到并将被替换的内容）：
\`\`\`
${correctedOldString}
\`\`\`

original_new_string（打算替换 original_old_string 的内容）：
\`\`\`
${originalNewString}
\`\`\`

任务：基于 original_old_string 和 corrected_old_string 之间的差异以及 original_new_string 的内容，生成 corrected_new_string。这个 corrected_new_string 应该是如果 original_new_string 是直接设计来替换 corrected_old_string 时的样子，同时保持原始转换的精神。

例如，如果 original_old_string 是 "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" 而 corrected_old_string 是 "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;"，并且 original_new_string 是 "\\\\\\nconst greeting = \`Hello \\\\\`\${name} \${lastName}\\\\\`\`;"，那么 corrected_new_string 应该可能是 "\nconst greeting = \`Hello ${'\\`'}\${name} \${lastName}${'\\`'}\`;" 以修复不正确的转义。
如果差异仅在于空白或格式，请对 corrected_new_string 应用类似的空白/格式更改。

仅以指定的 JSON 格式返回纠正后的字符串，键为 'corrected_new_string'。如果认为不需要或不可能进行调整，请返回 original_new_string。
  `.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await geminiClient.generateJson(
      contents,
      NEW_STRING_CORRECTION_SCHEMA,
      abortSignal,
      EditModel,
      EditConfig,
    );

    if (
      result &&
      typeof result.corrected_new_string === 'string' &&
      result.corrected_new_string.length > 0
    ) {
      return result.corrected_new_string;
    } else {
      return originalNewString;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    console.error('new_string 纠正期间的 LLM 调用错误：', error);
    return originalNewString;
  }
}

const CORRECT_NEW_STRING_ESCAPING_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    corrected_new_string_escaping: {
      type: Type.STRING,
      description:
        '具有纠正转义的新字符串，确保它是 old_string 的适当替换，特别是考虑到之前 LLM 生成可能存在的过度转义问题。',
    },
  },
  required: ['corrected_new_string_escaping'],
};

export async function correctNewStringEscaping(
  geminiClient: GeminiClient,
  oldString: string,
  potentiallyProblematicNewString: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const prompt = `
上下文：计划进行文本替换操作。要替换的文本（old_string）已在文件中正确识别。然而，替换文本（new_string）可能被之前的 LLM 生成不当地转义了（例如，换行符 \n 的反斜杠太多，如 \\n 而不是 \n，或不必要的引号如 \\"Hello\\" 而不是 "Hello"）。

old_string（这是将被替换的确切文本）：
\`\`\`
${oldString}
\`\`\`

potentially_problematic_new_string（这是应该替换 old_string 的文本，但可能有错误的转义，或者完全正确）：
\`\`\`
${potentiallyProblematicNewString}
\`\`\`

任务：分析 potentially_problematic_new_string。如果由于不正确的转义（例如，"\n", "\t", "\\", "\\'", "\\"）导致语法无效，请纠正无效的语法。目标是确保 new_string 插入代码时是有效且正确解释的。

例如，如果 old_string 是 "foo" 而 potentially_problematic_new_string 是 "bar\\nbaz"，那么 corrected_new_string_escaping 应该是 "bar\nbaz"。
如果 potentially_problematic_new_string 是 console.log(\\"Hello World\\")，它应该是 console.log("Hello World")。

仅以指定的 JSON 格式返回纠正后的字符串，键为 'corrected_new_string_escaping'。如果不需要转义纠正，请返回原始的 potentially_problematic_new_string。
  `.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await geminiClient.generateJson(
      contents,
      CORRECT_NEW_STRING_ESCAPING_SCHEMA,
      abortSignal,
      EditModel,
      EditConfig,
    );

    if (
      result &&
      typeof result.corrected_new_string_escaping === 'string' &&
      result.corrected_new_string_escaping.length > 0
    ) {
      return result.corrected_new_string_escaping;
    } else {
      return potentiallyProblematicNewString;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    console.error(
      'new_string 转义纠正期间的 LLM 调用错误：',
      error,
    );
    return potentiallyProblematicNewString;
  }
}

const CORRECT_STRING_ESCAPING_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    corrected_string_escaping: {
      type: Type.STRING,
      description:
        '具有纠正转义的字符串，确保它是有效的，特别考虑到之前 LLM 生成可能存在的过度转义问题。',
    },
  },
  required: ['corrected_string_escaping'],
};

export async function correctStringEscaping(
  potentiallyProblematicString: string,
  client: GeminiClient,
  abortSignal: AbortSignal,
): Promise<string> {
  const prompt = `
上下文：LLM 刚刚生成了 potentially_problematic_string，文本可能被不当地转义了（例如，换行符 \n 的反斜杠太多，如 \\n 而不是 \n，或不必要的引号如 \\"Hello\\" 而不是 "Hello"）。

potentially_problematic_string（此文本可能有错误的转义，或者完全正确）：
\`\`\`
${potentiallyProblematicString}
\`\`\`

任务：分析 potentially_problematic_string。如果由于不正确的转义（例如，"\n", "\t", "\\", "\\'", "\\"）导致语法无效，请纠正无效的语法。目标是确保文本是有效且正确解释的。

例如，如果 potentially_problematic_string 是 "bar\\nbaz"，那么 corrected_new_string_escaping 应该是 "bar\nbaz"。
如果 potentially_problematic_string 是 console.log(\\"Hello World\\")，它应该是 console.log("Hello World")。

仅以指定的 JSON 格式返回纠正后的字符串，键为 'corrected_string_escaping'。如果不需要转义纠正，请返回原始的 potentially_problematic_string。
  `.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await client.generateJson(
      contents,
      CORRECT_STRING_ESCAPING_SCHEMA,
      abortSignal,
      EditModel,
      EditConfig,
    );

    if (
      result &&
      typeof result.corrected_string_escaping === 'string' &&
      result.corrected_string_escaping.length > 0
    ) {
      return result.corrected_string_escaping;
    } else {
      return potentiallyProblematicString;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    console.error(
      '字符串转义纠正期间的 LLM 调用错误：',
      error,
    );
    return potentiallyProblematicString;
  }
}

function trimPairIfPossible(
  target: string,
  trimIfTargetTrims: string,
  currentContent: string,
  expectedReplacements: number,
) {
  const trimmedTargetString = target.trim();
  if (target.length !== trimmedTargetString.length) {
    const trimmedTargetOccurrences = countOccurrences(
      currentContent,
      trimmedTargetString,
    );

    if (trimmedTargetOccurrences === expectedReplacements) {
      const trimmedReactiveString = trimIfTargetTrims.trim();
      return {
        targetString: trimmedTargetString,
        pair: trimmedReactiveString,
      };
    }
  }

  return {
    targetString: target,
    pair: trimIfTargetTrims,
  };
}

/**
 * 取消可能被 LLM 过度转义的字符串。
 */
export function unescapeStringForGeminiBug(inputString: string): string {
  // 正则表达式解释：
  // \\ : 匹配恰好一个字面反斜杠字符。
  // (n|t|r|'|"|`|\\|\n) : 这是一个捕获组。它匹配以下之一：
  //   n, t, r, ', ", ` : 这些匹配字面字符 'n', 't', 'r', 单引号, 双引号, 或反引号。
  //                       这处理像 "\\n", "\\`" 等情况。
  //   \\ : 这匹配一个字面反斜杠。这处理像 "\\\\"（转义反斜杠）的情况。
  //   \n : 这匹配一个实际的换行符。这处理输入字符串中可能有像 "\\\n"（字面反斜杠后跟换行符）的情况。
  // g : 全局标志，替换所有出现的情况。

  return inputString.replace(
    /\\+(n|t|r|'|"|`|\\|\n)/g,
    (match, capturedChar) => {
      // 'match' 是整个错误序列，例如，如果输入（在内存中）是 "\\\\`"，match 是 "\\\\`"。
      // 'capturedChar' 是决定真正含义的字符，例如，'`'。

      switch (capturedChar) {
        case 'n':
          return '\n'; // 正确转义：\n（换行符）
        case 't':
          return '\t'; // 正确转义：\t（制表符）
        case 'r':
          return '\r'; // 正确转义：\r（回车符）
        case "'":
          return "'"; // 正确转义：'（撇号字符）
        case '"':
          return '"'; // 正确转义："（引号字符）
        case '`':
          return '`'; // 正确转义：`（反引号字符）
        case '\\': // 这处理 'capturedChar' 是字面反斜杠的情况
          return '\\'; // 用单个反斜杠替换转义反斜杠（例如，"\\\\"）
        case '\n': // 这处理 'capturedChar' 是实际换行符的情况
          return '\n'; // 用干净的换行符替换整个错误序列（例如，内存中的 "\\\n"）
        default:
          // 如果正则表达式正确捕获，这个后备方案理想情况下不应该到达。
          // 如果捕获了意外字符，它将返回原始匹配序列。
          return match;
      }
    },
  );
}

/**
 * 计算字符串中子字符串的出现次数
 */
export function countOccurrences(str: string, substr: string): number {
  if (substr === '') {
    return 0;
  }
  let count = 0;
  let pos = str.indexOf(substr);
  while (pos !== -1) {
    count++;
    pos = str.indexOf(substr, pos + substr.length); // 从当前匹配后开始搜索
  }
  return count;
}

export function resetEditCorrectorCaches_TEST_ONLY() {
  editCorrectionCache.clear();
  fileContentCorrectionCache.clear();
}