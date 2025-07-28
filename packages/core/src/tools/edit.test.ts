/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockEnsureCorrectEdit = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());
const mockOpenDiff = vi.hoisted(() => vi.fn());

vi.mock('../utils/editCorrector.js', () => ({
  ensureCorrectEdit: mockEnsureCorrectEdit,
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateJson: mockGenerateJson,
  })),
}));

vi.mock('../utils/editor.js', () => ({
  openDiff: mockOpenDiff,
}));

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { EditTool, EditToolParams } from './edit.js';
import { FileDiff } from './tools.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ApprovalMode, Config } from '../config/config.js';
import { Content, Part, SchemaUnion } from '@google/genai';

describe('EditTool', () => {
  let tool: EditTool;
  let tempDir: string;
  let rootDir: string;
  let mockConfig: Config;
  let geminiClient: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-tool-test-'));
    rootDir = path.join(tempDir, 'root');
    fs.mkdirSync(rootDir);

    geminiClient = {
      generateJson: mockGenerateJson, // mockGenerateJson 已定义并提升
    };

    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue(geminiClient),
      getTargetDir: () => rootDir,
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      // getGeminiConfig: () => ({ apiKey: 'test-api-key' }), // 这不是真正的 Config 方法
      // 如果 EditTool 使用它们，请添加 Config 的其他属性/方法
      // 如果 EditTool 构造函数或其他直接使用需要，添加最小的其他方法以满足 Config 类型：
      getApiKey: () => 'test-api-key',
      getModel: () => 'test-model',
      getSandbox: () => false,
      getDebugMode: () => false,
      getQuestion: () => undefined,
      getFullContext: () => false,
      getToolDiscoveryCommand: () => undefined,
      getToolCallCommand: () => undefined,
      getMcpServerCommand: () => undefined,
      getMcpServers: () => undefined,
      getUserAgent: () => 'test-agent',
      getUserMemory: () => '',
      setUserMemory: vi.fn(),
      getGeminiMdFileCount: () => 0,
      setGeminiMdFileCount: vi.fn(),
      getToolRegistry: () => ({}) as any, // ToolRegistry 的最小模拟
    } as unknown as Config;

    // 在每次测试前重置模拟
    (mockConfig.getApprovalMode as Mock).mockClear();
    // 默认不跳过确认
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);

    // 重置模拟并为 ensureCorrectEdit 设置默认实现
    mockEnsureCorrectEdit.mockReset();
    mockEnsureCorrectEdit.mockImplementation(
      async (_, currentContent, params) => {
        let occurrences = 0;
        if (params.old_string && currentContent) {
          // 简单的字符串计数用于模拟
          let index = currentContent.indexOf(params.old_string);
          while (index !== -1) {
            occurrences++;
            index = currentContent.indexOf(params.old_string, index + 1);
          }
        } else if (params.old_string === '') {
          occurrences = 0; // 创建新文件
        }
        return Promise.resolve({ params, occurrences });
      },
    );

    // 默认模拟 generateJson 以返回未更改的代码片段
    mockGenerateJson.mockReset();
    mockGenerateJson.mockImplementation(
      async (contents: Content[], schema: SchemaUnion) => {
        // problematic_snippet 是用户内容的最后一部分
        const userContent = contents.find((c: Content) => c.role === 'user');
        let promptText = '';
        if (userContent && userContent.parts) {
          promptText = userContent.parts
            .filter((p: Part) => typeof (p as any).text === 'string')
            .map((p: Part) => (p as any).text)
            .join('\n');
        }
        const snippetMatch = promptText.match(
          /Problematic target snippet:\n```\n([\s\S]*?)\n```/,
        );
        const problematicSnippet =
          snippetMatch && snippetMatch[1] ? snippetMatch[1] : '';

        if (((schema as any).properties as any)?.corrected_target_snippet) {
          return Promise.resolve({
            corrected_target_snippet: problematicSnippet,
          });
        }
        if (((schema as any).properties as any)?.corrected_new_string) {
          // 对于 new_string 纠正，我们可能需要更复杂的逻辑，
          // 但目前，如果测试未指定，返回原始值是安全的默认值。
          const originalNewStringMatch = promptText.match(
            /original_new_string \(what was intended to replace original_old_string\):\n```\n([\s\S]*?)\n```/,
          );
          const originalNewString =
            originalNewStringMatch && originalNewStringMatch[1]
              ? originalNewStringMatch[1]
              : '';
          return Promise.resolve({ corrected_new_string: originalNewString });
        }
        return Promise.resolve({}); // 如果模式不匹配，返回默认空对象
      },
    );

    tool = new EditTool(mockConfig);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('_applyReplacement', () => {
    // 访问私有方法进行测试
    // 注意：`tool` 在父 describe 块的 `beforeEach` 中初始化
    it('如果 isNewFile 为 true，应返回 newString', () => {
      expect((tool as any)._applyReplacement(null, 'old', 'new', true)).toBe(
        'new',
      );
      expect(
        (tool as any)._applyReplacement('existing', 'old', 'new', true),
      ).toBe('new');
    });

    it('如果 currentContent 为 null 且 oldString 为空，应返回 newString（防御性）', () => {
      expect((tool as any)._applyReplacement(null, '', 'new', false)).toBe(
        'new',
      );
    });

    it('如果 currentContent 为 null 且 oldString 不为空，应返回空字符串（防御性）', () => {
      expect((tool as any)._applyReplacement(null, 'old', 'new', false)).toBe(
        '',
      );
    });

    it('应在 currentContent 中将 oldString 替换为 newString', () => {
      expect(
        (tool as any)._applyReplacement(
          'hello old world old',
          'old',
          'new',
          false,
        ),
      ).toBe('hello new world new');
    });

    it('如果 oldString 为空且不是新文件，应返回 currentContent', () => {
      expect(
        (tool as any)._applyReplacement('hello world', '', 'new', false),
      ).toBe('hello world');
    });
  });

  describe('validateToolParams', () => {
    it('对于有效参数应返回 null', () => {
      const params: EditToolParams = {
        file_path: path.join(rootDir, 'test.txt'),
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('对于相对路径应返回错误', () => {
      const params: EditToolParams = {
        file_path: 'test.txt',
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be absolute/,
      );
    });

    it('对于根目录外的路径应返回错误', () => {
      const params: EditToolParams = {
        file_path: path.join(tempDir, 'outside-root.txt'),
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be within the root directory/,
      );
    });
  });

  describe('shouldConfirmExecute', () => {
    const testFile = 'edit_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it('如果参数无效应返回 false', async () => {
      const params: EditToolParams = {
        file_path: 'relative.txt',
        old_string: 'old',
        new_string: 'new',
      };
      expect(
        await tool.shouldConfirmExecute(params, new AbortController().signal),
      ).toBe(false);
    });

    it('对于有效编辑应请求确认', async () => {
      fs.writeFileSync(filePath, 'some old content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      // ensureCorrectEdit 将由 shouldConfirmExecute 调用
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 1 });
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Edit: ${testFile}`,
          fileName: testFile,
          fileDiff: expect.any(String),
        }),
      );
    });

    it('如果未找到 old_string 应返回 false（ensureCorrectEdit 返回 0）', async () => {
      fs.writeFileSync(filePath, 'some content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'not_found',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 0 });
      expect(
        await tool.shouldConfirmExecute(params, new AbortController().signal),
      ).toBe(false);
    });

    it('如果找到多个 old_string 实例应返回 false（ensureCorrectEdit 返回 > 1）', async () => {
      fs.writeFileSync(filePath, 'old old content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 2 });
      expect(
        await tool.shouldConfirmExecute(params, new AbortController().signal),
      ).toBe(false);
    });

    it('对于创建新文件应请求确认（空 old_string）', async () => {
      const newFileName = 'new_file.txt';
      const newFilePath = path.join(rootDir, newFileName);
      const params: EditToolParams = {
        file_path: newFilePath,
        old_string: '',
        new_string: 'new file content',
      };
      // 如果 old_string 为空，ensureCorrectEdit 可能不会被调用，
      // 因为 shouldConfirmExecute 处理 diff 生成。
      // 如果被调用，对于新文件应返回 0 次出现。
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 0 });
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Edit: ${newFileName}`,
          fileName: newFileName,
          fileDiff: expect.any(String),
        }),
      );
    });

    it('应使用 ensureCorrectEdit 的纠正参数生成 diff', async () => {
      const originalContent = 'This is the original string to be replaced.';
      const originalOldString = 'original string';
      const originalNewString = 'new string';

      const correctedOldString = 'original string to be replaced'; // 更具体
      const correctedNewString = 'completely new string'; // 不同的替换
      const expectedFinalContent = 'This is the completely new string.';

      fs.writeFileSync(filePath, originalContent);
      const params: EditToolParams = {
        file_path: filePath,
        old_string: originalOldString,
        new_string: originalNewString,
      };

      // 主 beforeEach 已调用 mockEnsureCorrectEdit.mockReset()
      // 为此测试用例设置特定模拟
      let mockCalled = false;
      mockEnsureCorrectEdit.mockImplementationOnce(
        async (_, content, p, client) => {
          mockCalled = true;
          expect(content).toBe(originalContent);
          expect(p).toBe(params);
          expect(client).toBe(geminiClient);
          return {
            params: {
              file_path: filePath,
              old_string: correctedOldString,
              new_string: correctedNewString,
            },
            occurrences: 1,
          };
        },
      );

      const confirmation = (await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      )) as FileDiff;

      expect(mockCalled).toBe(true); // 检查模拟实现是否运行
      // expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(originalContent, params, expect.anything()); // 暂时保持注释
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Edit: ${testFile}`,
          fileName: testFile,
        }),
      );
      // 检查 diff 是否基于纠正的字符串导致新状态
      expect(confirmation.fileDiff).toContain(`-${originalContent}`);
      expect(confirmation.fileDiff).toContain(`+${expectedFinalContent}`);

      // 验证将 correctedOldString 和 correctedNewString 应用于 originalContent
      // 确实产生 expectedFinalContent，这是 diff 应该反映的内容。
      const patchedContent = originalContent.replace(
        correctedOldString, // 这是 ensureCorrectEdit 识别用于替换的字符串
        correctedNewString, // 这是 ensureCorrectEdit 识别为替换的字符串
      );
      expect(patchedContent).toBe(expectedFinalContent);
    });
  });

  describe('execute', () => {
    const testFile = 'execute_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
      // execute 测试的默认值，可以覆盖
      mockEnsureCorrectEdit.mockImplementation(async (_, content, params) => {
        let occurrences = 0;
        if (params.old_string && content) {
          let index = content.indexOf(params.old_string);
          while (index !== -1) {
            occurrences++;
            index = content.indexOf(params.old_string, index + 1);
          }
        } else if (params.old_string === '') {
          occurrences = 0;
        }
        return { params, occurrences };
      });
    });

    it('如果参数无效应返回错误', async () => {
      const params: EditToolParams = {
        file_path: 'relative.txt',
        old_string: 'old',
        new_string: 'new',
      };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(/Error: File path must be absolute/);
    });

    it('应编辑现有文件并返回带 fileName 的 diff', async () => {
      const initialContent = 'This is some old text.';
      const newContent = 'This is some new text.'; // old -> new
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };

      // 为此测试的执行路径在 calculateEdit 中设置特定模拟
      // ensureCorrectEdit 不由 calculateEdit 调用，仅由 shouldConfirmExecute 调用
      // 因此，默认的 mockEnsureCorrectEdit 应正确返回 initialContent 中 'old' 的 1 次出现

      // 通过设置 shouldAlwaysEdit 模拟确认
      (tool as any).shouldAlwaysEdit = true;

      const result = await tool.execute(params, new AbortController().signal);

      (tool as any).shouldAlwaysEdit = false; // 为其他测试重置

      expect(result.llmContent).toMatch(/Successfully modified file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(newContent);
      const display = result.returnDisplay as FileDiff;
      expect(display.fileDiff).toMatch(initialContent);
      expect(display.fileDiff).toMatch(newContent);
      expect(display.fileName).toBe(testFile);
    });

    it('如果 old_string 为空且文件不存在，应创建新文件并返回创建消息', async () => {
      const newFileName = 'brand_new_file.txt';
      const newFilePath = path.join(rootDir, newFileName);
      const fileContent = 'Content for the new file.';
      const params: EditToolParams = {
        file_path: newFilePath,
        old_string: '',
        new_string: fileContent,
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(/Created new file/);
      expect(fs.existsSync(newFilePath)).toBe(true);
      expect(fs.readFileSync(newFilePath, 'utf8')).toBe(fileContent);
      expect(result.returnDisplay).toBe(`Created ${newFileName}`);
    });

    it('如果在文件中未找到 old_string 应返回错误', async () => {
      fs.writeFileSync(filePath, 'Some content.', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'nonexistent',
        new_string: 'replacement',
      };
      // 默认的 mockEnsureCorrectEdit 将返回 'nonexistent' 的 0 次出现
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(
        /0 occurrences found for old_string in/,
      );
      expect(result.returnDisplay).toMatch(
        /Failed to edit, could not find the string to replace./,
      );
    });

    it('如果找到多个 old_string 实例应返回错误', async () => {
      fs.writeFileSync(filePath, 'multiple old old strings', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      // 默认的 mockEnsureCorrectEdit 将返回 'old' 的 2 次出现
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(
        /Expected 1 occurrence but found 2 for old_string in file/,
      );
      expect(result.returnDisplay).toMatch(
        /Failed to edit, expected 1 occurrence but found 2/,
      );
    });

    it('当指定 expected_replacements 时应成功替换多次出现', async () => {
      fs.writeFileSync(filePath, 'old text old text old text', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        expected_replacements: 3,
      };

      // 通过设置 shouldAlwaysEdit 模拟确认
      (tool as any).shouldAlwaysEdit = true;

      const result = await tool.execute(params, new AbortController().signal);

      (tool as any).shouldAlwaysEdit = false; // 为其他测试重置

      expect(result.llmContent).toMatch(/Successfully modified file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(
        'new text new text new text',
      );
      const display = result.returnDisplay as FileDiff;
      expect(display.fileDiff).toMatch(/old text old text old text/);
      expect(display.fileDiff).toMatch(/new text new text new text/);
      expect(display.fileName).toBe(testFile);
    });

    it('如果 expected_replacements 与实际出现次数不匹配应返回错误', async () => {
      fs.writeFileSync(filePath, 'old text old text', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        expected_replacements: 3, // 期望 3 个但只有 2 个存在
      };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(
        /Expected 3 occurrences but found 2 for old_string in file/,
      );
      expect(result.returnDisplay).toMatch(
        /Failed to edit, expected 3 occurrences but found 2/,
      );
    });

    it('如果尝试创建已存在的文件应返回错误（空 old_string）', async () => {
      fs.writeFileSync(filePath, 'Existing content', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: '',
        new_string: 'new content',
      };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/File already exists, cannot create/);
      expect(result.returnDisplay).toMatch(
        /Attempted to create a file that already exists/,
      );
    });

    it('当提议内容被修改时应包含修改消息', async () => {
      const initialContent = 'This is some old text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        modified_by_user: true,
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(
        /User modified the `new_string` content/,
      );
    });

    it('当提议内容未被修改时不包含修改消息', async () => {
      const initialContent = 'This is some old text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        modified_by_user: false,
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).not.toMatch(
        /User modified the `new_string` content/,
      );
    });

    it('当未提供 modified_by_user 时不包含修改消息', async () => {
      const initialContent = 'This is some old text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).not.toMatch(
        /User modified the `new_string` content/,
      );
    });
  });

  describe('getDescription', () => {
    it('如果 old_string 和 new_string 相同，应返回 "No file changes to..."', () => {
      const testFileName = 'test.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string: 'identical_string',
        new_string: 'identical_string',
      };
      // 内部将调用 shortenPath，结果仅为文件名
      expect(tool.getDescription(params)).toBe(
        `No file changes to ${testFileName}`,
      );
    });

    it('如果字符串不同，应返回 old 和 new 字符串的片段', () => {
      const testFileName = 'test.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string: 'this is the old string value',
        new_string: 'this is the new string value',
      };
      // 内部将调用 shortenPath，结果仅为文件名
      // 片段在 30 个字符 + '...' 处截断
      expect(tool.getDescription(params)).toBe(
        `${testFileName}: this is the old string value => this is the new string value`,
      );
    });

    it('在描述中应正确处理非常短的字符串', () => {
      const testFileName = 'short.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.getDescription(params)).toBe(`${testFileName}: old => new`);
    });

    it('在描述中应截断长字符串', () => {
      const testFileName = 'long.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string:
          'this is a very long old string that will definitely be truncated',
        new_string:
          'this is a very long new string that will also be truncated',
      };
      expect(tool.getDescription(params)).toBe(
        `${testFileName}: this is a very long old string... => this is a very long new string...`,
      );
    });
  });
});