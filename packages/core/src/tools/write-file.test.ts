/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mocked,
} from 'vitest';
import { WriteFileTool } from './write-file.js';
import {
  FileDiff,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
} from './tools.js';
import { type EditToolParams } from './edit.js';
import { ApprovalMode, Config } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { GeminiClient } from '../core/client.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
  CorrectedEditResult,
} from '../utils/editCorrector.js';

const rootDir = path.resolve(os.tmpdir(), 'gemini-cli-test-root');

// --- 模拟 ---
vi.mock('../core/client.js');
vi.mock('../utils/editCorrector.js');

let mockGeminiClientInstance: Mocked<GeminiClient>;
const mockEnsureCorrectEdit = vi.fn<typeof ensureCorrectEdit>();
const mockEnsureCorrectFileContent = vi.fn<typeof ensureCorrectFileContent>();

// 连接模拟函数以供实际模块导入使用
vi.mocked(ensureCorrectEdit).mockImplementation(mockEnsureCorrectEdit);
vi.mocked(ensureCorrectFileContent).mockImplementation(
  mockEnsureCorrectFileContent,
);

// 模拟 Config
const mockConfigInternal = {
  getTargetDir: () => rootDir,
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  setApprovalMode: vi.fn(),
  getGeminiClient: vi.fn(), // 初始化为普通模拟函数
  getApiKey: () => 'test-key',
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
  getToolRegistry: () =>
    ({
      registerTool: vi.fn(),
      discoverTools: vi.fn(),
    }) as unknown as ToolRegistry,
};
const mockConfig = mockConfigInternal as unknown as Config;
// --- 结束模拟 ---

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  let tempDir: string;

  beforeEach(() => {
    // 为在根目录外创建的文件创建唯一的临时目录
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'write-file-test-external-'),
    );
    // 确保工具的 rootDir 存在
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    // 设置 GeminiClient 模拟
    mockGeminiClientInstance = new (vi.mocked(GeminiClient))(
      mockConfig,
    ) as Mocked<GeminiClient>;
    vi.mocked(GeminiClient).mockImplementation(() => mockGeminiClientInstance);

    // 现在 mockGeminiClientInstance 已初始化，为 getGeminiClient 设置模拟实现
    mockConfigInternal.getGeminiClient.mockReturnValue(
      mockGeminiClientInstance,
    );

    tool = new WriteFileTool(mockConfig);

    // 在每次测试前重置模拟
    mockConfigInternal.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);
    mockConfigInternal.setApprovalMode.mockClear();
    mockEnsureCorrectEdit.mockReset();
    mockEnsureCorrectFileContent.mockReset();

    // 默认模拟实现，返回有效结构
    mockEnsureCorrectEdit.mockImplementation(
      async (
        filePath: string,
        _currentContent: string,
        params: EditToolParams,
        _client: GeminiClient,
        signal?: AbortSignal, // 使 AbortSignal 可选以匹配使用情况
      ): Promise<CorrectedEditResult> => {
        if (signal?.aborted) {
          return Promise.reject(new Error('已中止'));
        }
        return Promise.resolve({
          params: { ...params, new_string: params.new_string ?? '' },
          occurrences: 1,
        });
      },
    );
    mockEnsureCorrectFileContent.mockImplementation(
      async (
        content: string,
        _client: GeminiClient,
        signal?: AbortSignal,
      ): Promise<string> => {
        // 使 AbortSignal 可选
        if (signal?.aborted) {
          return Promise.reject(new Error('已中止'));
        }
        return Promise.resolve(content ?? '');
      },
    );
  });

  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('validateToolParams', () => {
    it('应为根目录内的有效绝对路径返回 null', () => {
      const params = {
        file_path: path.join(rootDir, 'test.txt'),
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('应为相对路径返回错误', () => {
      const params = { file_path: 'test.txt', content: 'hello' };
      expect(tool.validateToolParams(params)).toMatch(
        /文件路径必须是绝对路径/,
      );
    });

    it('应为根目录外的路径返回错误', () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = {
        file_path: outsidePath,
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /文件路径必须在根目录内/,
      );
    });

    it('如果路径是目录则应返回错误', () => {
      const dirAsFilePath = path.join(rootDir, 'a_directory');
      fs.mkdirSync(dirAsFilePath);
      const params = {
        file_path: dirAsFilePath,
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toMatch(
        `路径是目录，不是文件: ${dirAsFilePath}`,
      );
    });
  });

  describe('_getCorrectedFileContent', () => {
    it('应为新文件调用 ensureCorrectFileContent', async () => {
      const filePath = path.join(rootDir, 'new_corrected_file.txt');
      const proposedContent = '建议的新内容。';
      const correctedContent = '修正的新内容。';
      const abortSignal = new AbortController().signal;
      // 如果需要，确保为此特定测试用例设置模拟，或依赖 beforeEach
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);

      // @ts-expect-error _getCorrectedFileContent 是私有的
      const result = await tool._getCorrectedFileContent(
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(mockEnsureCorrectEdit).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(correctedContent);
      expect(result.originalContent).toBe('');
      expect(result.fileExists).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('应为现有文件调用 ensureCorrectEdit', async () => {
      const filePath = path.join(rootDir, 'existing_corrected_file.txt');
      const originalContent = '原始现有内容。';
      const proposedContent = '建议的替换内容。';
      const correctedProposedContent = '修正的替换内容。';
      const abortSignal = new AbortController().signal;
      fs.writeFileSync(filePath, originalContent, 'utf8');

      // 确保此模拟处于活动状态并返回正确的结构
      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: originalContent,
          new_string: correctedProposedContent,
        },
        occurrences: 1,
      } as CorrectedEditResult);

      // @ts-expect-error _getCorrectedFileContent 是私有的
      const result = await tool._getCorrectedFileContent(
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        filePath,
        originalContent,
        {
          old_string: originalContent,
          new_string: proposedContent,
          file_path: filePath,
        },
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(mockEnsureCorrectFileContent).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(correctedProposedContent);
      expect(result.originalContent).toBe(originalContent);
      expect(result.fileExists).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('如果读取现有文件失败（例如权限）则应返回错误', async () => {
      const filePath = path.join(rootDir, 'unreadable_file.txt');
      const proposedContent = '一些内容';
      const abortSignal = new AbortController().signal;
      fs.writeFileSync(filePath, 'content', { mode: 0o000 });

      const readError = new Error('权限被拒绝');
      const originalReadFileSync = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw readError;
      });

      // @ts-expect-error _getCorrectedFileContent 是私有的
      const result = await tool._getCorrectedFileContent(
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
      expect(mockEnsureCorrectEdit).not.toHaveBeenCalled();
      expect(mockEnsureCorrectFileContent).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(proposedContent);
      expect(result.originalContent).toBe('');
      expect(result.fileExists).toBe(true);
      expect(result.error).toEqual({
        message: '权限被拒绝',
        code: undefined,
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation(originalReadFileSync);
      fs.chmodSync(filePath, 0o600);
    });
  });

  describe('shouldConfirmExecute', () => {
    const abortSignal = new AbortController().signal;
    it('如果参数无效（相对路径）应返回 false', async () => {
      const params = { file_path: 'relative.txt', content: 'test' };
      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      expect(confirmation).toBe(false);
    });

    it('如果参数无效（根目录外）应返回 false', async () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = { file_path: outsidePath, content: 'test' };
      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      expect(confirmation).toBe(false);
    });

    it('如果 _getCorrectedFileContent 返回错误应返回 false', async () => {
      const filePath = path.join(rootDir, 'confirm_error_file.txt');
      const params = { file_path: filePath, content: '测试内容' };
      fs.writeFileSync(filePath, 'original', { mode: 0o000 });

      const readError = new Error('用于确认的模拟读取错误');
      const originalReadFileSync = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw readError;
      });

      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      expect(confirmation).toBe(false);

      vi.spyOn(fs, 'readFileSync').mockImplementation(originalReadFileSync);
      fs.chmodSync(filePath, 0o600);
    });

    it('应请求确认并显示新文件的差异（带修正内容）', async () => {
      const filePath = path.join(rootDir, 'confirm_new_file.txt');
      const proposedContent = '用于确认的建议新内容。';
      const correctedContent = '用于确认的修正新内容。';
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent); // 确保此模拟处于活动状态

      const params = { file_path: filePath, content: proposedContent };
      const confirmation = (await tool.shouldConfirmExecute(
        params,
        abortSignal,
      )) as ToolEditConfirmationDetails;

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `确认写入: ${path.basename(filePath)}`,
          fileName: 'confirm_new_file.txt',
          fileDiff: expect.stringContaining(correctedContent),
        }),
      );
      expect(confirmation.fileDiff).toMatch(
        /--- confirm_new_file.txt\t当前/,
      );
      expect(confirmation.fileDiff).toMatch(
        /\+\+\+ confirm_new_file.txt\t建议/,
      );
    });

    it('应请求确认并显示现有文件的差异（带修正内容）', async () => {
      const filePath = path.join(rootDir, 'confirm_existing_file.txt');
      const originalContent = '用于确认的原始内容。';
      const proposedContent = '用于确认的建议替换。';
      const correctedProposedContent =
        '用于确认的修正替换。';
      fs.writeFileSync(filePath, originalContent, 'utf8');

      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: originalContent,
          new_string: correctedProposedContent,
        },
        occurrences: 1,
      });

      const params = { file_path: filePath, content: proposedContent };
      const confirmation = (await tool.shouldConfirmExecute(
        params,
        abortSignal,
      )) as ToolEditConfirmationDetails;

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        filePath,
        originalContent,
        {
          old_string: originalContent,
          new_string: proposedContent,
          file_path: filePath,
        },
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `确认写入: ${path.basename(filePath)}`,
          fileName: 'confirm_existing_file.txt',
          fileDiff: expect.stringContaining(correctedProposedContent),
        }),
      );
      expect(confirmation.fileDiff).toMatch(
        originalContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
    });
  });

  describe('execute', () => {
    const abortSignal = new AbortController().signal;
    it('如果参数无效（相对路径）应返回错误', async () => {
      const params = { file_path: 'relative.txt', content: 'test' };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(/错误: 提供的参数无效/);
      expect(result.returnDisplay).toMatch(/错误: 文件路径必须是绝对路径/);
    });

    it('如果参数无效（路径在根目录外）应返回错误', async () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = { file_path: outsidePath, content: 'test' };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(/错误: 提供的参数无效/);
      expect(result.returnDisplay).toMatch(
        /错误: 文件路径必须在根目录内/,
      );
    });

    it('如果在执行期间 _getCorrectedFileContent 返回错误应返回错误', async () => {
      const filePath = path.join(rootDir, 'execute_error_file.txt');
      const params = { file_path: filePath, content: '测试内容' };
      fs.writeFileSync(filePath, 'original', { mode: 0o000 });

      const readError = new Error('用于执行的模拟读取错误');
      const originalReadFileSync = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw readError;
      });

      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(/检查现有文件时出错/);
      expect(result.returnDisplay).toMatch(
        /检查现有文件时出错: 用于执行的模拟读取错误/,
      );

      vi.spyOn(fs, 'readFileSync').mockImplementation(originalReadFileSync);
      fs.chmodSync(filePath, 0o600);
    });

    it('应写入新文件并返回修正内容和差异', async () => {
      const filePath = path.join(rootDir, 'execute_new_corrected_file.txt');
      const proposedContent = '用于执行的建议新内容。';
      const correctedContent = '用于执行的修正新内容。';
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);

      const params = { file_path: filePath, content: proposedContent };

      const confirmDetails = await tool.shouldConfirmExecute(
        params,
        abortSignal,
      );
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await tool.execute(params, abortSignal);

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result.llmContent).toMatch(
        /成功创建并写入新文件/,
      );
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(correctedContent);
      const display = result.returnDisplay as FileDiff;
      expect(display.fileName).toBe('execute_new_corrected_file.txt');
      expect(display.fileDiff).toMatch(
        /--- execute_new_corrected_file.txt\t原始/,
      );
      expect(display.fileDiff).toMatch(
        /\+\+\+ execute_new_corrected_file.txt\t已写入/,
      );
      expect(display.fileDiff).toMatch(
        correctedContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
    });

    it('应覆盖现有文件并返回修正内容和差异', async () => {
      const filePath = path.join(
        rootDir,
        'execute_existing_corrected_file.txt',
      );
      const initialContent = '用于执行的初始内容。';
      const proposedContent = '用于执行的建议覆盖。';
      const correctedProposedContent = '用于执行的修正覆盖。';
      fs.writeFileSync(filePath, initialContent, 'utf8');

      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: initialContent,
          new_string: correctedProposedContent,
        },
        occurrences: 1,
      });

      const params = { file_path: filePath, content: proposedContent };

      const confirmDetails = await tool.shouldConfirmExecute(
        params,
        abortSignal,
      );
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await tool.execute(params, abortSignal);

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        filePath,
        initialContent,
        {
          old_string: initialContent,
          new_string: proposedContent,
          file_path: filePath,
        },
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result.llmContent).toMatch(/成功覆盖文件/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(correctedProposedContent);
      const display = result.returnDisplay as FileDiff;
      expect(display.fileName).toBe('execute_existing_corrected_file.txt');
      expect(display.fileDiff).toMatch(
        initialContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
      expect(display.fileDiff).toMatch(
        correctedProposedContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
    });

    it('如果目录不存在则应创建目录', async () => {
      const dirPath = path.join(rootDir, 'new_dir_for_write');
      const filePath = path.join(dirPath, 'file_in_new_dir.txt');
      const content = '新目录中的内容';
      mockEnsureCorrectFileContent.mockResolvedValue(content); // 确保此模拟处于活动状态

      const params = { file_path: filePath, content };
      // 如果您的逻辑在执行前需要确认，则模拟确认，否则如果不需要则移除
      const confirmDetails = await tool.shouldConfirmExecute(
        params,
        abortSignal,
      );
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      await tool.execute(params, abortSignal);

      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('当建议内容被修改时应包含修改消息', async () => {
      const filePath = path.join(rootDir, 'new_file_modified.txt');
      const content = '用户修改的新文件内容';
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const params = {
        file_path: filePath,
        content,
        modified_by_user: true,
      };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toMatch(/用户修改了 `content`/);
    });

    it('当建议内容未被修改时不包含修改消息', async () => {
      const filePath = path.join(rootDir, 'new_file_unmodified.txt');
      const content = '未被修改的新文件内容';
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const params = {
        file_path: filePath,
        content,
        modified_by_user: false,
      };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).not.toMatch(/用户修改了 `content`/);
    });

    it('当未提供 modified_by_user 时不包含修改消息', async () => {
      const filePath = path.join(rootDir, 'new_file_unmodified.txt');
      const content = '未被修改的新文件内容';
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const params = {
        file_path: filePath,
        content,
      };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).not.toMatch(/用户修改了 `content`/);
    });
  });
});