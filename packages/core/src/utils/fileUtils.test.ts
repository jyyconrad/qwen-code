/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

import * as actualNodeFs from 'node:fs'; // 用于设置/清理
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mime from 'mime-types';

import {
  isWithinRoot,
  isBinaryFile,
  detectFileType,
  processSingleFileContent,
} from './fileUtils.js';

vi.mock('mime-types', () => ({
  default: { lookup: vi.fn() },
  lookup: vi.fn(),
}));

const mockMimeLookup = mime.lookup as Mock;

describe('fileUtils', () => {
  let tempRootDir: string;
  const originalProcessCwd = process.cwd;

  let testTextFilePath: string;
  let testImageFilePath: string;
  let testPdfFilePath: string;
  let testBinaryFilePath: string;
  let nonExistentFilePath: string;
  let directoryPath: string;

  beforeEach(() => {
    vi.resetAllMocks(); // 重置所有模拟，包括 mime.lookup

    tempRootDir = actualNodeFs.mkdtempSync(
      path.join(os.tmpdir(), 'fileUtils-test-'),
    );
    process.cwd = vi.fn(() => tempRootDir); // 如果测试中需要相对路径逻辑，则模拟 cwd

    testTextFilePath = path.join(tempRootDir, 'test.txt');
    testImageFilePath = path.join(tempRootDir, 'image.png');
    testPdfFilePath = path.join(tempRootDir, 'document.pdf');
    testBinaryFilePath = path.join(tempRootDir, 'app.exe');
    nonExistentFilePath = path.join(tempRootDir, 'notfound.txt');
    directoryPath = path.join(tempRootDir, 'subdir');

    actualNodeFs.mkdirSync(directoryPath, { recursive: true }); // 确保子目录存在
  });

  afterEach(() => {
    if (actualNodeFs.existsSync(tempRootDir)) {
      actualNodeFs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    process.cwd = originalProcessCwd;
    vi.restoreAllMocks(); // 恢复所有监视
  });

  describe('isWithinRoot', () => {
    const root = path.resolve('/project/root');

    it('应返回 true 对于直接在根目录内的路径', () => {
      expect(isWithinRoot(path.join(root, 'file.txt'), root)).toBe(true);
      expect(isWithinRoot(path.join(root, 'subdir', 'file.txt'), root)).toBe(
        true,
      );
    });

    it('应返回 true 对于根路径本身', () => {
      expect(isWithinRoot(root, root)).toBe(true);
    });

    it('应返回 false 对于根目录外的路径', () => {
      expect(
        isWithinRoot(path.resolve('/project/other', 'file.txt'), root),
      ).toBe(false);
      expect(isWithinRoot(path.resolve('/unrelated', 'file.txt'), root)).toBe(
        false,
      );
    });

    it('应返回 false 对于仅部分匹配根前缀的路径', () => {
      expect(
        isWithinRoot(
          path.resolve('/project/root-but-actually-different'),
          root,
        ),
      ).toBe(false);
    });

    it('应正确处理带尾部斜杠的路径', () => {
      expect(isWithinRoot(path.join(root, 'file.txt') + path.sep, root)).toBe(
        true,
      );
      expect(isWithinRoot(root + path.sep, root)).toBe(true);
    });

    it('应处理不同的路径分隔符（POSIX vs Windows）', () => {
      const posixRoot = '/project/root';
      const posixPathInside = '/project/root/file.txt';
      const posixPathOutside = '/project/other/file.txt';
      expect(isWithinRoot(posixPathInside, posixRoot)).toBe(true);
      expect(isWithinRoot(posixPathOutside, posixRoot)).toBe(false);
    });

    it('应返回 false 对于根路径是待检查路径子路径的情况', () => {
      const pathToCheck = path.resolve('/project/root/sub');
      const rootSub = path.resolve('/project/root');
      expect(isWithinRoot(pathToCheck, rootSub)).toBe(true);

      const pathToCheckSuper = path.resolve('/project/root');
      const rootSuper = path.resolve('/project/root/sub');
      expect(isWithinRoot(pathToCheckSuper, rootSuper)).toBe(false);
    });
  });

  describe('isBinaryFile', () => {
    let filePathForBinaryTest: string;

    beforeEach(() => {
      filePathForBinaryTest = path.join(tempRootDir, 'binaryCheck.tmp');
    });

    afterEach(() => {
      if (actualNodeFs.existsSync(filePathForBinaryTest)) {
        actualNodeFs.unlinkSync(filePathForBinaryTest);
      }
    });

    it('应返回 false 对于空文件', () => {
      actualNodeFs.writeFileSync(filePathForBinaryTest, '');
      expect(isBinaryFile(filePathForBinaryTest)).toBe(false);
    });

    it('应返回 false 对于典型的文本文件', () => {
      actualNodeFs.writeFileSync(
        filePathForBinaryTest,
        'Hello, world!\nThis is a test file with normal text content.',
      );
      expect(isBinaryFile(filePathForBinaryTest)).toBe(false);
    });

    it('应返回 true 对于包含许多空字节的文件', () => {
      const binaryContent = Buffer.from([
        0x48, 0x65, 0x00, 0x6c, 0x6f, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]); // "He\0llo\0\0\0\0\0"
      actualNodeFs.writeFileSync(filePathForBinaryTest, binaryContent);
      expect(isBinaryFile(filePathForBinaryTest)).toBe(true);
    });

    it('应返回 true 对于非可打印ASCII字符占比高的文件', () => {
      const binaryContent = Buffer.from([
        0x41, 0x42, 0x01, 0x02, 0x03, 0x04, 0x05, 0x43, 0x44, 0x06,
      ]); // AB\x01\x02\x03\x04\x05CD\x06
      actualNodeFs.writeFileSync(filePathForBinaryTest, binaryContent);
      expect(isBinaryFile(filePathForBinaryTest)).toBe(true);
    });

    it('如果文件访问失败（例如，ENOENT），应返回 false', () => {
      // 确保文件不存在
      if (actualNodeFs.existsSync(filePathForBinaryTest)) {
        actualNodeFs.unlinkSync(filePathForBinaryTest);
      }
      expect(isBinaryFile(filePathForBinaryTest)).toBe(false);
    });
  });

  describe('detectFileType', () => {
    let filePathForDetectTest: string;

    beforeEach(() => {
      filePathForDetectTest = path.join(tempRootDir, 'detectType.tmp');
      // 默认：创建为文本文件以供 isBinaryFile 回退使用
      actualNodeFs.writeFileSync(filePathForDetectTest, 'Plain text content');
    });

    afterEach(() => {
      if (actualNodeFs.existsSync(filePathForDetectTest)) {
        actualNodeFs.unlinkSync(filePathForDetectTest);
      }
      vi.restoreAllMocks(); // 恢复对 actualNodeFs 的监视
    });

    it('应通过扩展名检测 typescript 类型 (ts)', () => {
      expect(detectFileType('file.ts')).toBe('text');
      expect(detectFileType('file.test.ts')).toBe('text');
    });

    it('应通过扩展名检测图像类型 (png)', () => {
      mockMimeLookup.mockReturnValueOnce('image/png');
      expect(detectFileType('file.png')).toBe('image');
    });

    it('应通过扩展名检测图像类型 (jpeg)', () => {
      mockMimeLookup.mockReturnValueOnce('image/jpeg');
      expect(detectFileType('file.jpg')).toBe('image');
    });

    it('应通过扩展名检测 svg 类型', () => {
      expect(detectFileType('image.svg')).toBe('svg');
      expect(detectFileType('image.icon.svg')).toBe('svg');
    });

    it('应通过扩展名检测 pdf 类型', () => {
      mockMimeLookup.mockReturnValueOnce('application/pdf');
      expect(detectFileType('file.pdf')).toBe('pdf');
    });

    it('应通过扩展名检测音频类型', () => {
      mockMimeLookup.mockReturnValueOnce('audio/mpeg');
      expect(detectFileType('song.mp3')).toBe('audio');
    });

    it('应通过扩展名检测视频类型', () => {
      mockMimeLookup.mockReturnValueOnce('video/mp4');
      expect(detectFileType('movie.mp4')).toBe('video');
    });

    it('应将已知的二进制扩展名检测为二进制（例如 .zip）', () => {
      mockMimeLookup.mockReturnValueOnce('application/zip');
      expect(detectFileType('archive.zip')).toBe('binary');
    });
    it('应将已知的二进制扩展名检测为二进制（例如 .exe）', () => {
      mockMimeLookup.mockReturnValueOnce('application/octet-stream'); // .exe 的常见类型
      expect(detectFileType('app.exe')).toBe('binary');
    });

    it('对于未知扩展名应使用 isBinaryFile 并检测为二进制', () => {
      mockMimeLookup.mockReturnValueOnce(false); // 未知的 mime 类型
      // 创建一个 isBinaryFile 将识别为二进制的文件
      const binaryContent = Buffer.from([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
      ]);
      actualNodeFs.writeFileSync(filePathForDetectTest, binaryContent);
      expect(detectFileType(filePathForDetectTest)).toBe('binary');
    });

    it('如果 mime 类型未知且内容不是二进制，则默认为文本', () => {
      mockMimeLookup.mockReturnValueOnce(false); // 未知的 mime 类型
      // filePathForDetectTest 在 beforeEach 中已默认为文本文件
      expect(detectFileType(filePathForDetectTest)).toBe('text');
    });
  });

  describe('processSingleFileContent', () => {
    beforeEach(() => {
      // 确保文件在 readFile 可能被模拟之前存在以供 statSync 检查
      if (actualNodeFs.existsSync(testTextFilePath))
        actualNodeFs.unlinkSync(testTextFilePath);
      if (actualNodeFs.existsSync(testImageFilePath))
        actualNodeFs.unlinkSync(testImageFilePath);
      if (actualNodeFs.existsSync(testPdfFilePath))
        actualNodeFs.unlinkSync(testPdfFilePath);
      if (actualNodeFs.existsSync(testBinaryFilePath))
        actualNodeFs.unlinkSync(testBinaryFilePath);
    });

    it('应成功读取文本文件', async () => {
      const content = 'Line 1\\nLine 2\\nLine 3';
      actualNodeFs.writeFileSync(testTextFilePath, content);
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
      );
      expect(result.llmContent).toBe(content);
      expect(result.returnDisplay).toBe('');
      expect(result.error).toBeUndefined();
    });

    it('应处理文件未找到的情况', async () => {
      const result = await processSingleFileContent(
        nonExistentFilePath,
        tempRootDir,
      );
      expect(result.error).toContain('File not found');
      expect(result.returnDisplay).toContain('File not found');
    });

    it('应处理文本文件的读取错误', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, 'content'); // 文件必须存在以供初始 statSync
      const readError = new Error('Simulated read error');
      vi.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(readError);

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
      );
      expect(result.error).toContain('Simulated read error');
      expect(result.returnDisplay).toContain('Simulated read error');
    });

    it('应处理图像/pdf 文件的读取错误', async () => {
      actualNodeFs.writeFileSync(testImageFilePath, 'content'); // 文件必须存在
      mockMimeLookup.mockReturnValue('image/png');
      const readError = new Error('Simulated image read error');
      vi.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(readError);

      const result = await processSingleFileContent(
        testImageFilePath,
        tempRootDir,
      );
      expect(result.error).toContain('Simulated image read error');
      expect(result.returnDisplay).toContain('Simulated image read error');
    });

    it('应处理图像文件', async () => {
      const fakePngData = Buffer.from('fake png data');
      actualNodeFs.writeFileSync(testImageFilePath, fakePngData);
      mockMimeLookup.mockReturnValue('image/png');
      const result = await processSingleFileContent(
        testImageFilePath,
        tempRootDir,
      );
      expect(
        (result.llmContent as { inlineData: unknown }).inlineData,
      ).toBeDefined();
      expect(
        (result.llmContent as { inlineData: { mimeType: string } }).inlineData
          .mimeType,
      ).toBe('image/png');
      expect(
        (result.llmContent as { inlineData: { data: string } }).inlineData.data,
      ).toBe(fakePngData.toString('base64'));
      expect(result.returnDisplay).toContain('Read image file: image.png');
    });

    it('应处理 PDF 文件', async () => {
      const fakePdfData = Buffer.from('fake pdf data');
      actualNodeFs.writeFileSync(testPdfFilePath, fakePdfData);
      mockMimeLookup.mockReturnValue('application/pdf');
      const result = await processSingleFileContent(
        testPdfFilePath,
        tempRootDir,
      );
      expect(
        (result.llmContent as { inlineData: unknown }).inlineData,
      ).toBeDefined();
      expect(
        (result.llmContent as { inlineData: { mimeType: string } }).inlineData
          .mimeType,
      ).toBe('application/pdf');
      expect(
        (result.llmContent as { inlineData: { data: string } }).inlineData.data,
      ).toBe(fakePdfData.toString('base64'));
      expect(result.returnDisplay).toContain('Read pdf file: document.pdf');
    });

    it('当 SVG 文件小于 1MB 时应作为文本读取', async () => {
      const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="100" height="100" fill="blue" />
    </svg>
  `;
      const testSvgFilePath = path.join(tempRootDir, 'test.svg');
      actualNodeFs.writeFileSync(testSvgFilePath, svgContent, 'utf-8');

      mockMimeLookup.mockReturnValue('image/svg+xml');

      const result = await processSingleFileContent(
        testSvgFilePath,
        tempRootDir,
      );

      expect(result.llmContent).toBe(svgContent);
      expect(result.returnDisplay).toContain('Read SVG as text');
    });

    it('应跳过二进制文件', async () => {
      actualNodeFs.writeFileSync(
        testBinaryFilePath,
        Buffer.from([0x00, 0x01, 0x02]),
      );
      mockMimeLookup.mockReturnValueOnce('application/octet-stream');
      // isBinaryFile 将对真实文件进行操作。

      const result = await processSingleFileContent(
        testBinaryFilePath,
        tempRootDir,
      );
      expect(result.llmContent).toContain(
        'Cannot display content of binary file',
      );
      expect(result.returnDisplay).toContain('Skipped binary file: app.exe');
    });

    it('应处理路径为目录的情况', async () => {
      const result = await processSingleFileContent(directoryPath, tempRootDir);
      expect(result.error).toContain('Path is a directory');
      expect(result.returnDisplay).toContain('Path is a directory');
    });

    it('应正确分页文本文件（偏移量和限制）', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        5,
        5,
      ); // 读取第 6-10 行
      const expectedContent = lines.slice(5, 10).join('\n');

      expect(result.llmContent).toContain(expectedContent);
      expect(result.llmContent).toContain(
        '[File content truncated: showing lines 6-10 of 20 total lines. Use offset/limit parameters to view more.]',
      );
      expect(result.returnDisplay).toBe('(truncated)');
      expect(result.isTruncated).toBe(true);
      expect(result.originalLineCount).toBe(20);
      expect(result.linesShown).toEqual([6, 10]);
    });

    it('应处理限制超出文件长度的情况', async () => {
      const lines = ['Line 1', 'Line 2'];
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        0,
        10,
      );
      const expectedContent = lines.join('\n');

      expect(result.llmContent).toBe(expectedContent);
      expect(result.returnDisplay).toBe('');
      expect(result.isTruncated).toBe(false);
      expect(result.originalLineCount).toBe(2);
      expect(result.linesShown).toEqual([1, 2]);
    });

    it('应截断文本文件中的长行', async () => {
      const longLine = 'a'.repeat(2500);
      actualNodeFs.writeFileSync(
        testTextFilePath,
        `Short line\n${longLine}\nAnother short line`,
      );

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
      );

      expect(result.llmContent).toContain('Short line');
      expect(result.llmContent).toContain(
        longLine.substring(0, 2000) + '... [truncated]',
      );
      expect(result.llmContent).toContain('Another short line');
      expect(result.llmContent).toContain(
        '[File content partially truncated: some lines exceeded maximum length of 2000 characters.]',
      );
      expect(result.isTruncated).toBe(true);
    });

    it('如果文件大小超过 20MB，应返回错误', async () => {
      // 创建一个刚好超过 20MB 的文件
      const twentyOneMB = 21 * 1024 * 1024;
      const buffer = Buffer.alloc(twentyOneMB, 0x61); // 用 'a' 填充
      actualNodeFs.writeFileSync(testTextFilePath, buffer);

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
      );

      expect(result.error).toContain('File size exceeds the 20MB limit');
      expect(result.returnDisplay).toContain(
        'File size exceeds the 20MB limit',
      );
      expect(result.llmContent).toContain('File size exceeds the 20MB limit');
    });
  });
});