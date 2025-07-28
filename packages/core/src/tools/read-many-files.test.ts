/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { mockControl } from '../__mocks__/fs/promises.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import path from 'path';
import fs from 'fs'; // 实际的 fs 用于设置
import os from 'os';
import { Config } from '../config/config.js';

vi.mock('mime-types', () => {
  const lookup = (filename: string) => {
    if (filename.endsWith('.ts') || filename.endsWith('.js')) {
      return 'text/plain';
    }
    if (filename.endsWith('.png')) {
      return 'image/png';
    }
    if (filename.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (filename.endsWith('.mp3') || filename.endsWith('.wav')) {
      return 'audio/mpeg';
    }
    if (filename.endsWith('.mp4') || filename.endsWith('.mov')) {
      return 'video/mp4';
    }
    return false;
  };
  return {
    default: {
      lookup,
    },
    lookup,
  };
});

describe('ReadManyFilesTool', () => {
  let tool: ReadManyFilesTool;
  let tempRootDir: string;
  let tempDirOutsideRoot: string;
  let mockReadFileFn: Mock;

  beforeEach(async () => {
    tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-many-files-root-'),
    );
    tempDirOutsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-many-files-external-'),
    );
    fs.writeFileSync(path.join(tempRootDir, '.geminiignore'), 'foo.*');
    const fileService = new FileDiscoveryService(tempRootDir);
    const mockConfig = {
      getFileService: () => fileService,
      getFileFilteringRespectGitIgnore: () => true,
      getTargetDir: () => tempRootDir,
    } as Partial<Config> as Config;

    tool = new ReadManyFilesTool(mockConfig);

    mockReadFileFn = mockControl.mockReadFile;
    mockReadFileFn.mockReset();

    mockReadFileFn.mockImplementation(
      async (filePath: fs.PathLike, options?: Record<string, unknown>) => {
        const fp =
          typeof filePath === 'string'
            ? filePath
            : (filePath as Buffer).toString();

        if (fs.existsSync(fp)) {
          const originalFs = await vi.importActual<typeof fs>('fs');
          return originalFs.promises.readFile(fp, options);
        }

        if (fp.endsWith('nonexistent-file.txt')) {
          const err = new Error(
            `ENOENT: 没有那个文件或目录，打开 '${fp}'`,
          );
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        if (fp.endsWith('unreadable.txt')) {
          const err = new Error(`EACCES: 权限被拒绝，打开 '${fp}'`);
          (err as NodeJS.ErrnoException).code = 'EACCES';
          throw err;
        }
        if (fp.endsWith('.png'))
          return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG 头部
        if (fp.endsWith('.pdf')) return Buffer.from('%PDF-1.4...'); // PDF 开始
        if (fp.endsWith('binary.bin'))
          return Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]);

        const err = new Error(
          `ENOENT: 没有那个文件或目录，打开 '${fp}' (未模拟的路径)`,
        );
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      },
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempDirOutsideRoot)) {
      fs.rmSync(tempDirOutsideRoot, { recursive: true, force: true });
    }
  });

  describe('validateParams', () => {
    it('应返回 null 以表示根目录内的有效相对路径', () => {
      const params = { paths: ['file1.txt', 'subdir/file2.txt'] };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('应返回 null 以表示根目录内的有效通配符模式', () => {
      const params = { paths: ['*.txt', 'subdir/**/*.js'] };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('应返回 null 以表示试图跳出根目录的路径 (例如，../)，因为 execute 会处理这种情况', () => {
      const params = { paths: ['../outside.txt'] };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('应返回 null 以表示绝对路径，因为 execute 会处理这种情况', () => {
      const params = { paths: [path.join(tempDirOutsideRoot, 'absolute.txt')] };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('如果 paths 数组为空，则应返回错误', () => {
      const params = { paths: [] };
      expect(tool.validateParams(params)).toBe(
        'params/paths 项目数量不得少于 1 个',
      );
    });

    it('应返回 null 以表示有效的排除和包含模式', () => {
      const params = {
        paths: ['src/**/*.ts'],
        exclude: ['**/*.test.ts'],
        include: ['src/utils/*.ts'],
      };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('如果 paths 数组包含空字符串，则应返回错误', () => {
      const params = { paths: ['file1.txt', ''] };
      expect(tool.validateParams(params)).toBe(
        'params/paths/1 字符数不得少于 1 个',
      );
    });

    it('如果 include 数组包含非字符串元素，则应返回错误', () => {
      const params = {
        paths: ['file1.txt'],
        include: ['*.ts', 123] as string[],
      };
      expect(tool.validateParams(params)).toBe(
        'params/include/1 必须是字符串',
      );
    });

    it('如果 exclude 数组包含非字符串元素，则应返回错误', () => {
      const params = {
        paths: ['file1.txt'],
        exclude: ['*.log', {}] as string[],
      };
      expect(tool.validateParams(params)).toBe(
        'params/exclude/1 必须是字符串',
      );
    });
  });

  describe('execute', () => {
    const createFile = (filePath: string, content = '') => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    };
    const createBinaryFile = (filePath: string, data: Uint8Array) => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, data);
    };

    it('应读取单个指定文件', async () => {
      createFile('file1.txt', 'Content of file1');
      const params = { paths: ['file1.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      const expectedPath = path.join(tempRootDir, 'file1.txt');
      expect(result.llmContent).toEqual([
        `--- ${expectedPath} ---\n\nContent of file1\n\n`,
      ]);
      expect(result.returnDisplay).toContain(
        '已成功读取并连接 **1 个文件** 的内容',
      );
    });

    it('应读取多个指定文件', async () => {
      createFile('file1.txt', 'Content1');
      createFile('subdir/file2.js', 'Content2');
      const params = { paths: ['file1.txt', 'subdir/file2.js'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath1 = path.join(tempRootDir, 'file1.txt');
      const expectedPath2 = path.join(tempRootDir, 'subdir/file2.js');
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath1} ---\n\nContent1\n\n`),
        ),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath2} ---\n\nContent2\n\n`),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain(
        '已成功读取并连接 **2 个文件** 的内容',
      );
    });

    it('应处理通配符模式', async () => {
      createFile('file.txt', 'Text file');
      createFile('another.txt', 'Another text');
      createFile('sub/data.json', '{}');
      const params = { paths: ['*.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath1 = path.join(tempRootDir, 'file.txt');
      const expectedPath2 = path.join(tempRootDir, 'another.txt');
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath1} ---\n\nText file\n\n`),
        ),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath2} ---\n\nAnother text\n\n`),
        ),
      ).toBe(true);
      expect(content.find((c) => c.includes('sub/data.json'))).toBeUndefined();
      expect(result.returnDisplay).toContain(
        '已成功读取并连接 **2 个文件** 的内容',
      );
    });

    it('应遵循排除模式', async () => {
      createFile('src/main.ts', 'Main content');
      createFile('src/main.test.ts', 'Test content');
      const params = { paths: ['src/**/*.ts'], exclude: ['**/*.test.ts'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath = path.join(tempRootDir, 'src/main.ts');
      expect(content).toEqual([`--- ${expectedPath} ---\n\nMain content\n\n`]);
      expect(
        content.find((c) => c.includes('src/main.test.ts')),
      ).toBeUndefined();
      expect(result.returnDisplay).toContain(
        '已成功读取并连接 **1 个文件** 的内容',
      );
    });

    it('应优雅地处理不存在的特定文件', async () => {
      const params = { paths: ['nonexistent-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        '未找到符合标准的文件，或所有文件均被跳过。',
      ]);
      expect(result.returnDisplay).toContain(
        '没有根据标准读取并连接任何文件。',
      );
    });

    it('应使用默认排除项', async () => {
      createFile('node_modules/some-lib/index.js', 'lib code');
      createFile('src/app.js', 'app code');
      const params = { paths: ['**/*.js'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath = path.join(tempRootDir, 'src/app.js');
      expect(content).toEqual([`--- ${expectedPath} ---\n\napp code\n\n`]);
      expect(
        content.find((c) => c.includes('node_modules/some-lib/index.js')),
      ).toBeUndefined();
      expect(result.returnDisplay).toContain(
        '已成功读取并连接 **1 个文件** 的内容',
      );
    });

    it('如果 useDefaultExcludes 为 false，则不应使用默认排除项', async () => {
      createFile('node_modules/some-lib/index.js', 'lib code');
      createFile('src/app.js', 'app code');
      const params = { paths: ['**/*.js'], useDefaultExcludes: false };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath1 = path.join(
        tempRootDir,
        'node_modules/some-lib/index.js',
      );
      const expectedPath2 = path.join(tempRootDir, 'src/app.js');
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath1} ---\n\nlib code\n\n`),
        ),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath2} ---\n\napp code\n\n`),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain(
        '已成功读取并连接 **2 个文件** 的内容',
      );
    });

    it('如果通过扩展名显式请求，应将图像作为 inlineData 部分包含', async () => {
      createBinaryFile(
        'image.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const params = { paths: ['*.png'] }; // 显式请求 .png
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]).toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]);
      expect(result.returnDisplay).toContain(
        '已成功读取并连接 **1 个文件** 的内容',
      );
    });

    it('如果通过名称显式请求，应将图像作为 inlineData 部分包含', async () => {
      createBinaryFile(
        'myExactImage.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const params = { paths: ['myExactImage.png'] }; // 通过完整名称显式请求
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]).toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]);
    });

    it('如果未通过扩展名或名称显式请求，则应跳过 PDF 文件', async () => {
      createBinaryFile('document.pdf', Buffer.from('%PDF-1.4...'));
      createFile('notes.txt', 'text notes');
      const params = { paths: ['*'] }; // 通用通配符，不特定于 .pdf
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath = path.join(tempRootDir, 'notes.txt');
      expect(
        content.some(
          (c) =>
            typeof c === 'string' &&
            c.includes(`--- ${expectedPath} ---\n\ntext notes\n\n`),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain('**跳过了 1 个项目：**');
      expect(result.returnDisplay).toContain(
        '- `document.pdf` (原因：未通过名称或扩展名显式请求的资源文件（图像/pdf）)',
      );
    });

    it('如果通过扩展名显式请求，应将 PDF 文件作为 inlineData 部分包含', async () => {
      createBinaryFile('important.pdf', Buffer.from('%PDF-1.4...'));
      const params = { paths: ['*.pdf'] }; // 显式请求 .pdf 文件
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from('%PDF-1.4...').toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);
    });

    it('如果通过名称显式请求，应将 PDF 文件作为 inlineData 部分包含', async () => {
      createBinaryFile('report-final.pdf', Buffer.from('%PDF-1.4...'));
      const params = { paths: ['report-final.pdf'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from('%PDF-1.4...').toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);
    });

    it('如果路径被 .geminiignore 模式忽略，则应返回错误', async () => {
      createFile('foo.bar', '');
      createFile('bar.ts', '');
      createFile('foo.quux', '');
      const params = { paths: ['foo.bar', 'bar.ts', 'foo.quux'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.returnDisplay).not.toContain('foo.bar');
      expect(result.returnDisplay).not.toContain('foo.quux');
      expect(result.returnDisplay).toContain('bar.ts');
    });
  });
});