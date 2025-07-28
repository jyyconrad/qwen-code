/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import fsPromises from 'fs/promises';
import * as fs from 'fs';
import { Dirent as FSDirent } from 'fs';
import * as nodePath from 'path';
import { getFolderStructure } from './getFolderStructure.js';
import * as gitUtils from './gitUtils.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

vi.mock('path', async (importOriginal) => {
  const original = (await importOriginal()) as typeof nodePath;
  return {
    ...original,
    resolve: vi.fn((str) => str),
    // 其他路径函数（basename、join、normalize 等）将使用原始实现
  };
});

vi.mock('fs/promises');
vi.mock('fs');
vi.mock('./gitUtils.js');

// 在此处再次导入 'path'，它将是被模拟的版本
import * as path from 'path';

// 辅助函数：创建 Dirent 类似对象以模拟 fs.readdir
const createDirent = (name: string, type: 'file' | 'dir'): FSDirent => ({
  name,
  isFile: () => type === 'file',
  isDirectory: () => type === 'dir',
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isSymbolicLink: () => false,
  isFIFO: () => false,
  isSocket: () => false,
  parentPath: '',
});

describe('getFolderStructure', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // path.resolve 现在是 vi.fn()，由于顶层的 vi.mock。
    // 我们确保每次测试都设置其实现（或依赖 vi.mock 中的设置）。
    // vi.resetAllMocks() 清除调用历史但不清除 vi.mock 中 vi.fn 设置的实现。
    // 如果我们需要在每个测试中更改它，我们会在这里做：
    (path.resolve as Mock).mockImplementation((str: string) => str);

    // 为每个测试重新应用/定义 fsPromises.readdir 的模拟实现
    (fsPromises.readdir as Mock).mockImplementation(
      async (dirPath: string | Buffer | URL) => {
        // 这里的 path.normalize 将使用被模拟的 path 模块。
        // 由于 normalize 是从原始模块中展开的，它应该是真实的实现。
        const normalizedPath = path.normalize(dirPath.toString());
        if (mockFsStructure[normalizedPath]) {
          return mockFsStructure[normalizedPath];
        }
        throw Object.assign(
          new Error(
            `ENOENT: no such file or directory, scandir '${normalizedPath}'`,
          ),
          { code: 'ENOENT' },
        );
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks(); // 恢复间谍（如 fsPromises.readdir）并重置 vi.fn 模拟（如 path.resolve）
  });

  const mockFsStructure: Record<string, FSDirent[]> = {
    '/testroot': [
      createDirent('file1.txt', 'file'),
      createDirent('subfolderA', 'dir'),
      createDirent('emptyFolder', 'dir'),
      createDirent('.hiddenfile', 'file'),
      createDirent('node_modules', 'dir'),
    ],
    '/testroot/subfolderA': [
      createDirent('fileA1.ts', 'file'),
      createDirent('fileA2.js', 'file'),
      createDirent('subfolderB', 'dir'),
    ],
    '/testroot/subfolderA/subfolderB': [createDirent('fileB1.md', 'file')],
    '/testroot/emptyFolder': [],
    '/testroot/node_modules': [createDirent('somepackage', 'dir')],
    '/testroot/manyFilesFolder': Array.from({ length: 10 }, (_, i) =>
      createDirent(`file-${i}.txt`, 'file'),
    ),
    '/testroot/manyFolders': Array.from({ length: 5 }, (_, i) =>
      createDirent(`folder-${i}`, 'dir'),
    ),
    ...Array.from({ length: 5 }, (_, i) => ({
      [`/testroot/manyFolders/folder-${i}`]: [
        createDirent('child.txt', 'file'),
      ],
    })).reduce((acc, val) => ({ ...acc, ...val }), {}),
    '/testroot/deepFolders': [createDirent('level1', 'dir')],
    '/testroot/deepFolders/level1': [createDirent('level2', 'dir')],
    '/testroot/deepFolders/level1/level2': [createDirent('level3', 'dir')],
    '/testroot/deepFolders/level1/level2/level3': [
      createDirent('file.txt', 'file'),
    ],
  };

  it('应返回基本文件夹结构', async () => {
    const structure = await getFolderStructure('/testroot/subfolderA');
    const expected = `
显示最多 200 个项目（文件 + 文件夹）。

/testroot/subfolderA/
├───fileA1.ts
├───fileA2.js
└───subfolderB/
    └───fileB1.md
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('应处理空文件夹', async () => {
    const structure = await getFolderStructure('/testroot/emptyFolder');
    const expected = `
显示最多 200 个项目（文件 + 文件夹）。

/testroot/emptyFolder/
`.trim();
    expect(structure.trim()).toBe(expected.trim());
  });

  it('应忽略 ignoredFolders 中指定的文件夹（默认）', async () => {
    const structure = await getFolderStructure('/testroot');
    const expected = `
显示最多 200 个项目（文件 + 文件夹）。标记为 ... 的文件夹或文件包含未显示的更多项目、被忽略的项目，或已达到显示限制（200 个项目）。

/testroot/
├───.hiddenfile
├───file1.txt
├───emptyFolder/
├───node_modules/...
└───subfolderA/
    ├───fileA1.ts
    ├───fileA2.js
    └───subfolderB/
        └───fileB1.md
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('应忽略自定义 ignoredFolders 中指定的文件夹', async () => {
    const structure = await getFolderStructure('/testroot', {
      ignoredFolders: new Set(['subfolderA', 'node_modules']),
    });
    const expected = `
显示最多 200 个项目（文件 + 文件夹）。标记为 ... 的文件夹或文件包含未显示的更多项目、被忽略的项目，或已达到显示限制（200 个项目）。

/testroot/
├───.hiddenfile
├───file1.txt
├───emptyFolder/
├───node_modules/...
└───subfolderA/...
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('应按 fileIncludePattern 过滤文件', async () => {
    const structure = await getFolderStructure('/testroot/subfolderA', {
      fileIncludePattern: /\.ts$/,
    });
    const expected = `
显示最多 200 个项目（文件 + 文件夹）。

/testroot/subfolderA/
├───fileA1.ts
└───subfolderB/
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('应处理文件夹内文件的 maxItems 截断', async () => {
    const structure = await getFolderStructure('/testroot/subfolderA', {
      maxItems: 3,
    });
    const expected = `
显示最多 3 个项目（文件 + 文件夹）。

/testroot/subfolderA/
├───fileA1.ts
├───fileA2.js
└───subfolderB/
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('应处理子文件夹的 maxItems 截断', async () => {
    const structure = await getFolderStructure('/testroot/manyFolders', {
      maxItems: 4,
    });
    const expectedRevised = `
显示最多 4 个项目（文件 + 文件夹）。标记为 ... 的文件夹或文件包含未显示的更多项目、被忽略的项目，或已达到显示限制（4 个项目）。

/testroot/manyFolders/
├───folder-0/
├───folder-1/
├───folder-2/
├───folder-3/
└───...
`.trim();
    expect(structure.trim()).toBe(expectedRevised);
  });

  it('应处理仅允许根文件夹本身的 maxItems', async () => {
    const structure = await getFolderStructure('/testroot/subfolderA', {
      maxItems: 1,
    });
    const expectedRevisedMax1 = `
显示最多 1 个项目（文件 + 文件夹）。标记为 ... 的文件夹或文件包含未显示的更多项目、被忽略的项目，或已达到显示限制（1 个项目）。

/testroot/subfolderA/
├───fileA1.ts
├───...
└───...
`.trim();
    expect(structure.trim()).toBe(expectedRevisedMax1);
  });

  it('应处理不存在的目录', async () => {
    // 临时使 fsPromises.readdir 对此特定路径抛出 ENOENT
    const originalReaddir = fsPromises.readdir;
    (fsPromises.readdir as Mock).mockImplementation(
      async (p: string | Buffer | URL) => {
        if (p === '/nonexistent') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        return originalReaddir(p);
      },
    );

    const structure = await getFolderStructure('/nonexistent');
    expect(structure).toContain(
      '错误：无法读取目录 "/nonexistent"',
    );
  });

  it('应在限制内处理深层文件夹结构', async () => {
    const structure = await getFolderStructure('/testroot/deepFolders', {
      maxItems: 10,
    });
    const expected = `
显示最多 10 个项目（文件 + 文件夹）。

/testroot/deepFolders/
└───level1/
    └───level2/
        └───level3/
            └───file.txt
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('如果 maxItems 较小，应截断深层文件夹结构', async () => {
    const structure = await getFolderStructure('/testroot/deepFolders', {
      maxItems: 3,
    });
    const expected = `
显示最多 3 个项目（文件 + 文件夹）。

/testroot/deepFolders/
└───level1/
    └───level2/
        └───level3/
`.trim();
    expect(structure.trim()).toBe(expected);
  });
});

describe('getFolderStructure gitignore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (path.resolve as Mock).mockImplementation((str: string) => str);

    (fsPromises.readdir as Mock).mockImplementation(async (p) => {
      const path = p.toString();
      if (path === '/test/project') {
        return [
          createDirent('file1.txt', 'file'),
          createDirent('node_modules', 'dir'),
          createDirent('ignored.txt', 'file'),
          createDirent('.iflycode', 'dir'),
        ] as any;
      }
      if (path === '/test/project/node_modules') {
        return [createDirent('some-package', 'dir')] as any;
      }
      if (path === '/test/project/.gemini') {
        return [
          createDirent('config.yaml', 'file'),
          createDirent('logs.json', 'file'),
        ] as any;
      }
      return [];
    });

    (fs.readFileSync as Mock).mockImplementation((p) => {
      const path = p.toString();
      if (path === '/test/project/.gitignore') {
        return 'ignored.txt\nnode_modules/\n.iflycode/\n!/.iflycode/config.yaml';
      }
      return '';
    });

    vi.mocked(gitUtils.isGitRepository).mockReturnValue(true);
  });

  it('应忽略 .gitignore 中指定的文件和文件夹', async () => {
    const fileService = new FileDiscoveryService('/test/project');
    const structure = await getFolderStructure('/test/project', {
      fileService,
    });
    expect(structure).not.toContain('ignored.txt');
    expect(structure).toContain('node_modules/...');
    expect(structure).not.toContain('logs.json');
  });

  it('如果 respectGitIgnore 为 false，不应忽略文件', async () => {
    const fileService = new FileDiscoveryService('/test/project');
    const structure = await getFolderStructure('/test/project', {
      fileService,
      respectGitIgnore: false,
    });
    expect(structure).toContain('ignored.txt');
    // node_modules 仍被默认忽略
    expect(structure).toContain('node_modules/...');
  });
});