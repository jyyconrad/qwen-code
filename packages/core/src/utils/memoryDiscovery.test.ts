/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, Mocked } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';
import { Stats, Dirent } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadServerHierarchicalMemory } from './memoryDiscovery.js';
import {
  GEMINI_CONFIG_DIR,
  setGeminiMdFilename,
  getCurrentGeminiMdFilename,
  DEFAULT_CONTEXT_FILENAME,
} from '../tools/memoryTool.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

const ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST = DEFAULT_CONTEXT_FILENAME;

// 模拟整个 fs/promises 模块
vi.mock('fs/promises');
// 模拟我们可能使用的 fsSync 部分（如常量或 existsSync）
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fsSync>();
  return {
    ...actual, // 展开 actual 以获取所有导出，包括 Stats 和 Dirent（如果它们是类/构造函数）
    constants: { ...actual.constants }, // 保留常量
  };
});
vi.mock('os');

describe('loadServerHierarchicalMemory', () => {
  const mockFs = fsPromises as Mocked<typeof fsPromises>;
  const mockOs = os as Mocked<typeof os>;

  const CWD = '/test/project/src';
  const PROJECT_ROOT = '/test/project';
  const USER_HOME = '/test/userhome';

  let GLOBAL_GEMINI_DIR: string;
  let GLOBAL_GEMINI_FILE: string; // 在 beforeEach 中定义

  const fileService = new FileDiscoveryService(PROJECT_ROOT);
  beforeEach(() => {
    vi.resetAllMocks();
    // 设置环境变量以指示测试环境
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';

    setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME); // 使用定义的常量
    mockOs.homedir.mockReturnValue(USER_HOME);

    // 在此处定义这些，以使用可能从导入中重置/更新的值
    GLOBAL_GEMINI_DIR = path.join(USER_HOME, GEMINI_CONFIG_DIR);
    GLOBAL_GEMINI_FILE = path.join(
      GLOBAL_GEMINI_DIR,
      getCurrentGeminiMdFilename(), // 使用当前文件名
    );

    mockFs.stat.mockRejectedValue(new Error('File not found'));
    mockFs.readdir.mockResolvedValue([]);
    mockFs.readFile.mockRejectedValue(new Error('File not found'));
    mockFs.access.mockRejectedValue(new Error('File not found'));
  });

  it('如果未找到上下文文件，应返回空内存和计数', async () => {
    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );
    expect(memoryContent).toBe('');
    expect(fileCount).toBe(0);
  });

  it('如果存在全局上下文文件而其他文件不存在，则应仅加载全局上下文文件（默认文件名）', async () => {
    const globalDefaultFile = path.join(
      GLOBAL_GEMINI_DIR,
      DEFAULT_CONTEXT_FILENAME,
    );
    mockFs.access.mockImplementation(async (p) => {
      if (p === globalDefaultFile) {
        return undefined;
      }
      throw new Error('File not found');
    });
    mockFs.readFile.mockImplementation(async (p) => {
      if (p === globalDefaultFile) {
        return 'Global memory content';
      }
      throw new Error('File not found');
    });

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );

    expect(memoryContent).toBe(
      `--- Context from: ${path.relative(CWD, globalDefaultFile)} ---\nGlobal memory content\n--- End of Context from: ${path.relative(CWD, globalDefaultFile)} ---`,
    );
    expect(fileCount).toBe(1);
    expect(mockFs.readFile).toHaveBeenCalledWith(globalDefaultFile, 'utf-8');
  });

  it('如果存在全局自定义上下文文件且文件名已更改，则应仅加载全局自定义上下文文件', async () => {
    const customFilename = 'CUSTOM_AGENTS.md';
    setGeminiMdFilename(customFilename);
    const globalCustomFile = path.join(GLOBAL_GEMINI_DIR, customFilename);

    mockFs.access.mockImplementation(async (p) => {
      if (p === globalCustomFile) {
        return undefined;
      }
      throw new Error('File not found');
    });
    mockFs.readFile.mockImplementation(async (p) => {
      if (p === globalCustomFile) {
        return 'Global custom memory';
      }
      throw new Error('File not found');
    });

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );

    expect(memoryContent).toBe(
      `--- Context from: ${path.relative(CWD, globalCustomFile)} ---\nGlobal custom memory\n--- End of Context from: ${path.relative(CWD, globalCustomFile)} ---`,
    );
    expect(fileCount).toBe(1);
    expect(mockFs.readFile).toHaveBeenCalledWith(globalCustomFile, 'utf-8');
  });

  it('应通过向上遍历加载上下文文件（使用自定义文件名）', async () => {
    const customFilename = 'PROJECT_CONTEXT.md';
    setGeminiMdFilename(customFilename);
    const projectRootCustomFile = path.join(PROJECT_ROOT, customFilename);
    const srcCustomFile = path.join(CWD, customFilename);

    mockFs.stat.mockImplementation(async (p) => {
      if (p === path.join(PROJECT_ROOT, '.git')) {
        return { isDirectory: () => true } as Stats;
      }
      throw new Error('File not found');
    });

    mockFs.access.mockImplementation(async (p) => {
      if (p === projectRootCustomFile || p === srcCustomFile) {
        return undefined;
      }
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === projectRootCustomFile) {
        return 'Project root custom memory';
      }
      if (p === srcCustomFile) {
        return 'Src directory custom memory';
      }
      throw new Error('File not found');
    });

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );
    const expectedContent =
      `--- Context from: ${path.relative(CWD, projectRootCustomFile)} ---\nProject root custom memory\n--- End of Context from: ${path.relative(CWD, projectRootCustomFile)} ---\n\n` +
      `--- Context from: ${customFilename} ---\nSrc directory custom memory\n--- End of Context from: ${customFilename} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(2);
    expect(mockFs.readFile).toHaveBeenCalledWith(
      projectRootCustomFile,
      'utf-8',
    );
    expect(mockFs.readFile).toHaveBeenCalledWith(srcCustomFile, 'utf-8');
  });

  it('应通过向下遍历加载上下文文件（使用自定义文件名）', async () => {
    const customFilename = 'LOCAL_CONTEXT.md';
    setGeminiMdFilename(customFilename);
    const subDir = path.join(CWD, 'subdir');
    const subDirCustomFile = path.join(subDir, customFilename);
    const cwdCustomFile = path.join(CWD, customFilename);

    mockFs.access.mockImplementation(async (p) => {
      if (p === cwdCustomFile || p === subDirCustomFile) return undefined;
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === cwdCustomFile) return 'CWD custom memory';
      if (p === subDirCustomFile) return 'Subdir custom memory';
      throw new Error('File not found');
    });

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) {
        return [
          {
            name: customFilename,
            isFile: () => true,
            isDirectory: () => false,
          } as Dirent,
          {
            name: 'subdir',
            isFile: () => false,
            isDirectory: () => true,
          } as Dirent,
        ] as Dirent[];
      }
      if (p === subDir) {
        return [
          {
            name: customFilename,
            isFile: () => true,
            isDirectory: () => false,
          } as Dirent,
        ] as Dirent[];
      }
      return [] as Dirent[];
    }) as unknown as typeof fsPromises.readdir);

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );
    const expectedContent =
      `--- Context from: ${customFilename} ---\nCWD custom memory\n--- End of Context from: ${customFilename} ---\n\n` +
      `--- Context from: ${path.join('subdir', customFilename)} ---\nSubdir custom memory\n--- End of Context from: ${path.join('subdir', customFilename)} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(2);
  });

  it('应通过从 CWD 到项目根目录的向上遍历加载 ORIGINAL_GEMINI_MD_FILENAME 文件', async () => {
    const projectRootGeminiFile = path.join(
      PROJECT_ROOT,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );
    const srcGeminiFile = path.join(
      CWD,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );

    mockFs.stat.mockImplementation(async (p) => {
      if (p === path.join(PROJECT_ROOT, '.git')) {
        return { isDirectory: () => true } as Stats;
      }
      throw new Error('File not found');
    });

    mockFs.access.mockImplementation(async (p) => {
      if (p === projectRootGeminiFile || p === srcGeminiFile) {
        return undefined;
      }
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === projectRootGeminiFile) {
        return 'Project root memory';
      }
      if (p === srcGeminiFile) {
        return 'Src directory memory';
      }
      throw new Error('File not found');
    });

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );
    const expectedContent =
      `--- Context from: ${path.relative(CWD, projectRootGeminiFile)} ---\nProject root memory\n--- End of Context from: ${path.relative(CWD, projectRootGeminiFile)} ---\n\n` +
      `--- Context from: ${ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST} ---\nSrc directory memory\n--- End of Context from: ${ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(2);
    expect(mockFs.readFile).toHaveBeenCalledWith(
      projectRootGeminiFile,
      'utf-8',
    );
    expect(mockFs.readFile).toHaveBeenCalledWith(srcGeminiFile, 'utf-8');
  });

  it('应通过从 CWD 向下遍历加载 ORIGINAL_GEMINI_MD_FILENAME 文件', async () => {
    const subDir = path.join(CWD, 'subdir');
    const subDirGeminiFile = path.join(
      subDir,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );
    const cwdGeminiFile = path.join(
      CWD,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );

    mockFs.access.mockImplementation(async (p) => {
      if (p === cwdGeminiFile || p === subDirGeminiFile) return undefined;
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === cwdGeminiFile) return 'CWD memory';
      if (p === subDirGeminiFile) return 'Subdir memory';
      throw new Error('File not found');
    });

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) {
        return [
          {
            name: ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
            isFile: () => true,
            isDirectory: () => false,
          } as Dirent,
          {
            name: 'subdir',
            isFile: () => false,
            isDirectory: () => true,
          } as Dirent,
        ] as Dirent[];
      }
      if (p === subDir) {
        return [
          {
            name: ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
            isFile: () => true,
            isDirectory: () => false,
          } as Dirent,
        ] as Dirent[];
      }
      return [] as Dirent[];
    }) as unknown as typeof fsPromises.readdir);

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );
    const expectedContent =
      `--- Context from: ${ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST} ---\nCWD memory\n--- End of Context from: ${ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST} ---\n\n` +
      `--- Context from: ${path.join('subdir', ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST)} ---\nSubdir memory\n--- End of Context from: ${path.join('subdir', ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST)} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(2);
  });

  it('应加载并正确排序全局、向上和向下遍历的 ORIGINAL_GEMINI_MD_FILENAME 文件', async () => {
    setGeminiMdFilename(ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST); // 显式设置此测试

    const globalFileToUse = path.join(
      GLOBAL_GEMINI_DIR,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );
    const projectParentDir = path.dirname(PROJECT_ROOT);
    const projectParentGeminiFile = path.join(
      projectParentDir,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );
    const projectRootGeminiFile = path.join(
      PROJECT_ROOT,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );
    const cwdGeminiFile = path.join(
      CWD,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );
    const subDir = path.join(CWD, 'sub');
    const subDirGeminiFile = path.join(
      subDir,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );

    mockFs.stat.mockImplementation(async (p) => {
      if (p === path.join(PROJECT_ROOT, '.git')) {
        return { isDirectory: () => true } as Stats;
      } else if (p === path.join(PROJECT_ROOT, '.gemini')) {
        return { isDirectory: () => true } as Stats;
      }
      throw new Error('File not found');
    });

    mockFs.access.mockImplementation(async (p) => {
      if (
        p === globalFileToUse || // 使用动态设置的全局文件路径
        p === projectParentGeminiFile ||
        p === projectRootGeminiFile ||
        p === cwdGeminiFile ||
        p === subDirGeminiFile
      ) {
        return undefined;
      }
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === globalFileToUse) return 'Global memory'; // 使用动态设置的全局文件路径
      if (p === projectParentGeminiFile) return 'Project parent memory';
      if (p === projectRootGeminiFile) return 'Project root memory';
      if (p === cwdGeminiFile) return 'CWD memory';
      if (p === subDirGeminiFile) return 'Subdir memory';
      throw new Error('File not found');
    });

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) {
        return [
          {
            name: 'sub',
            isFile: () => false,
            isDirectory: () => true,
          } as Dirent,
        ] as Dirent[];
      }
      if (p === subDir) {
        return [
          {
            name: ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
            isFile: () => true,
            isDirectory: () => false,
          } as Dirent,
        ] as Dirent[];
      }
      return [] as Dirent[];
    }) as unknown as typeof fsPromises.readdir);

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );

    const relPathGlobal = path.relative(CWD, GLOBAL_GEMINI_FILE);
    const relPathProjectParent = path.relative(CWD, projectParentGeminiFile);
    const relPathProjectRoot = path.relative(CWD, projectRootGeminiFile);
    const relPathCwd = ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST;
    const relPathSubDir = path.join(
      'sub',
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );

    const expectedContent = [
      `--- Context from: ${relPathGlobal} ---\nGlobal memory\n--- End of Context from: ${relPathGlobal} ---`,
      `--- Context from: ${relPathProjectParent} ---\nProject parent memory\n--- End of Context from: ${relPathProjectParent} ---`,
      `--- Context from: ${relPathProjectRoot} ---\nProject root memory\n--- End of Context from: ${relPathProjectRoot} ---`,
      `--- Context from: ${relPathCwd} ---\nCWD memory\n--- End of Context from: ${relPathCwd} ---`,
      `--- Context from: ${relPathSubDir} ---\nSubdir memory\n--- End of Context from: ${relPathSubDir} ---`,
    ].join('\n\n');

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(5);
  });

  it('在向下扫描期间应忽略指定的目录', async () => {
    const ignoredDir = path.join(CWD, 'node_modules');
    const ignoredDirGeminiFile = path.join(
      ignoredDir,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    ); // 已修正
    const regularSubDir = path.join(CWD, 'my_code');
    const regularSubDirGeminiFile = path.join(
      regularSubDir,
      ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
    );

    mockFs.access.mockImplementation(async (p) => {
      if (p === regularSubDirGeminiFile) return undefined;
      if (p === ignoredDirGeminiFile)
        throw new Error('Should not access ignored file');
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === regularSubDirGeminiFile) return 'My code memory';
      throw new Error('File not found');
    });

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) {
        return [
          {
            name: 'node_modules',
            isFile: () => false,
            isDirectory: () => true,
          } as Dirent,
          {
            name: 'my_code',
            isFile: () => false,
            isDirectory: () => true,
          } as Dirent,
        ] as Dirent[];
      }
      if (p === regularSubDir) {
        return [
          {
            name: ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST,
            isFile: () => true,
            isDirectory: () => false,
          } as Dirent,
        ] as Dirent[];
      }
      if (p === ignoredDir) {
        return [] as Dirent[];
      }
      return [] as Dirent[];
    }) as unknown as typeof fsPromises.readdir);

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
    );

    const expectedContent = `--- Context from: ${path.join('my_code', ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST)} ---\nMy code memory\n--- End of Context from: ${path.join('my_code', ORIGINAL_GEMINI_MD_FILENAME_CONST_FOR_TEST)} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(1);
    expect(mockFs.readFile).not.toHaveBeenCalledWith(
      ignoredDirGeminiFile,
      'utf-8',
    );
  });

  it('在向下扫描期间应遵守 MAX_DIRECTORIES_TO_SCAN_FOR_MEMORY', async () => {
    const consoleDebugSpy = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => {});

    const dirNames: Dirent[] = [];
    for (let i = 0; i < 250; i++) {
      dirNames.push({
        name: `deep_dir_${i}`,
        isFile: () => false,
        isDirectory: () => true,
      } as Dirent);
    }

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) return dirNames;
      if (p.toString().startsWith(path.join(CWD, 'deep_dir_')))
        return [] as Dirent[];
      return [] as Dirent[];
    }) as unknown as typeof fsPromises.readdir);
    mockFs.access.mockRejectedValue(new Error('not found'));

    await loadServerHierarchicalMemory(CWD, true, fileService);

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [BfsFileSearch]'),
      expect.stringContaining('Scanning [200/200]:'),
    );
    consoleDebugSpy.mockRestore();
  });

  it('应加载扩展上下文文件路径', async () => {
    const extensionFilePath = '/test/extensions/ext1/GEMINI.md';
    mockFs.access.mockImplementation(async (p) => {
      if (p === extensionFilePath) {
        return undefined;
      }
      throw new Error('File not found');
    });
    mockFs.readFile.mockImplementation(async (p) => {
      if (p === extensionFilePath) {
        return 'Extension memory content';
      }
      throw new Error('File not found');
    });

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
      fileService,
      [extensionFilePath],
    );

    expect(memoryContent).toBe(
      `--- Context from: ${path.relative(CWD, extensionFilePath)} ---\nExtension memory content\n--- End of Context from: ${path.relative(CWD, extensionFilePath)} ---`,
    );
    expect(fileCount).toBe(1);
    expect(mockFs.readFile).toHaveBeenCalledWith(extensionFilePath, 'utf-8');
  });
});