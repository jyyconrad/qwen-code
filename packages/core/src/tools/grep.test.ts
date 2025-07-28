/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrepTool, GrepToolParams } from './grep.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { Config } from '../config/config.js';

// 模拟 child_process 模块以控制 grep/git grep 行为
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: (event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'error' || event === 'close') {
        // 模拟命令未找到或 git grep 和系统 grep 出错
        // 以强制回退到 JS 实现。
        setTimeout(() => cb(1), 0); // cb(1) 表示错误/关闭
      }
    },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
}));

describe('GrepTool', () => {
  let tempRootDir: string;
  let grepTool: GrepTool;
  const abortSignal = new AbortController().signal;

  const mockConfig = {
    getTargetDir: () => tempRootDir,
  } as unknown as Config;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-tool-root-'));
    grepTool = new GrepTool(mockConfig);

    // 创建一些测试文件和目录
    await fs.writeFile(
      path.join(tempRootDir, 'fileA.txt'),
      'hello world\nsecond line with world',
    );
    await fs.writeFile(
      path.join(tempRootDir, 'fileB.js'),
      'const foo = "bar";\nfunction baz() { return "hello"; }',
    );
    await fs.mkdir(path.join(tempRootDir, 'sub'));
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'fileC.txt'),
      'another world in sub dir',
    );
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'fileD.md'),
      '# Markdown file\nThis is a test.',
    );
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('validateToolParams', () => {
    it('对于有效参数应返回 null（仅模式）', () => {
      const params: GrepToolParams = { pattern: 'hello' };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('对于有效参数应返回 null（模式和路径）', () => {
      const params: GrepToolParams = { pattern: 'hello', path: '.' };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('对于有效参数应返回 null（模式、路径和包含）', () => {
      const params: GrepToolParams = {
        pattern: 'hello',
        path: '.',
        include: '*.txt',
      };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('如果缺少模式应返回错误', () => {
      const params = { path: '.' } as unknown as GrepToolParams;
      expect(grepTool.validateToolParams(params)).toBe(
        `params 必须具有必需属性 'pattern'`,
      );
    });

    it('对于无效正则表达式模式应返回错误', () => {
      const params: GrepToolParams = { pattern: '[[' };
      expect(grepTool.validateToolParams(params)).toContain(
        '无效的正则表达式模式',
      );
    });

    it('如果路径不存在应返回错误', () => {
      const params: GrepToolParams = { pattern: 'hello', path: 'nonexistent' };
      // 检查核心错误信息，因为完整路径可能不同
      expect(grepTool.validateToolParams(params)).toContain(
        '无法访问路径统计信息',
      );
      expect(grepTool.validateToolParams(params)).toContain('nonexistent');
    });

    it('如果路径是文件而不是目录应返回错误', async () => {
      const filePath = path.join(tempRootDir, 'fileA.txt');
      const params: GrepToolParams = { pattern: 'hello', path: filePath };
      expect(grepTool.validateToolParams(params)).toContain(
        `路径不是目录: ${filePath}`,
      );
    });
  });

  describe('execute', () => {
    it('应在所有文件中找到简单模式的匹配项', async () => {
      const params: GrepToolParams = { pattern: 'world' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        '在路径 "." 中找到模式 "world" 的 3 个匹配项',
      );
      expect(result.llmContent).toContain('文件: fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('L2: second line with world');
      expect(result.llmContent).toContain('文件: sub/fileC.txt');
      expect(result.llmContent).toContain('L1: another world in sub dir');
      expect(result.returnDisplay).toBe('找到 3 个匹配项');
    });

    it('应在特定路径中找到匹配项', async () => {
      const params: GrepToolParams = { pattern: 'world', path: 'sub' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        '在路径 "sub" 中找到模式 "world" 的 1 个匹配项',
      );
      expect(result.llmContent).toContain('文件: fileC.txt'); // 相对于 'sub' 的路径
      expect(result.llmContent).toContain('L1: another world in sub dir');
      expect(result.returnDisplay).toBe('找到 1 个匹配项');
    });

    it('应使用包含 glob 找到匹配项', async () => {
      const params: GrepToolParams = { pattern: 'hello', include: '*.js' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        '在路径 "." 中找到模式 "hello" 的 1 个匹配项（过滤器: "*.js"）',
      );
      expect(result.llmContent).toContain('文件: fileB.js');
      expect(result.llmContent).toContain(
        'L2: function baz() { return "hello"; }',
      );
      expect(result.returnDisplay).toBe('找到 1 个匹配项');
    });

    it('应使用包含 glob 和路径找到匹配项', async () => {
      await fs.writeFile(
        path.join(tempRootDir, 'sub', 'another.js'),
        'const greeting = "hello";',
      );
      const params: GrepToolParams = {
        pattern: 'hello',
        path: 'sub',
        include: '*.js',
      };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        '在路径 "sub" 中找到模式 "hello" 的 1 个匹配项（过滤器: "*.js"）',
      );
      expect(result.llmContent).toContain('文件: another.js');
      expect(result.llmContent).toContain('L1: const greeting = "hello";');
      expect(result.returnDisplay).toBe('找到 1 个匹配项');
    });

    it('当模式不存在时应返回 "未找到匹配项"', async () => {
      const params: GrepToolParams = { pattern: 'nonexistentpattern' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        '在路径 "." 中未找到模式 "nonexistentpattern" 的匹配项',
      );
      expect(result.returnDisplay).toBe('未找到匹配项');
    });

    it('应正确处理正则表达式特殊字符', async () => {
      const params: GrepToolParams = { pattern: 'foo.*bar' }; // 匹配 'const foo = "bar";'
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        '在路径 "." 中找到模式 "foo.*bar" 的 1 个匹配项',
      );
      expect(result.llmContent).toContain('文件: fileB.js');
      expect(result.llmContent).toContain('L1: const foo = "bar";');
    });

    it('默认情况下应不区分大小写（JS 回退）', async () => {
      const params: GrepToolParams = { pattern: 'HELLO' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        '在路径 "." 中找到模式 "HELLO" 的 2 个匹配项',
      );
      expect(result.llmContent).toContain('文件: fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('文件: fileB.js');
      expect(result.llmContent).toContain(
        'L2: function baz() { return "hello"; }',
      );
    });

    it('如果参数无效应返回错误', async () => {
      const params = { path: '.' } as unknown as GrepToolParams; // 无效：缺少模式
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toBe(
        "错误: 提供的参数无效。原因: params 必须具有必需属性 'pattern'",
      );
      expect(result.returnDisplay).toBe(
        "模型提供了无效参数。错误: params 必须具有必需属性 'pattern'",
      );
    });
  });

  describe('getDescription', () => {
    it('应仅使用模式生成正确的描述', () => {
      const params: GrepToolParams = { pattern: 'testPattern' };
      expect(grepTool.getDescription(params)).toBe("'testPattern'");
    });

    it('应使用模式和包含生成正确的描述', () => {
      const params: GrepToolParams = {
        pattern: 'testPattern',
        include: '*.ts',
      };
      expect(grepTool.getDescription(params)).toBe("'testPattern' in *.ts");
    });

    it('应使用模式和路径生成正确的描述', () => {
      const params: GrepToolParams = {
        pattern: 'testPattern',
        path: 'src/app',
      };
      // 路径将相对于 tempRootDir，所以我们检查是否包含。
      expect(grepTool.getDescription(params)).toContain("'testPattern' within");
      expect(grepTool.getDescription(params)).toContain(
        path.join('src', 'app'),
      );
    });

    it('应使用模式、包含和路径生成正确的描述', () => {
      const params: GrepToolParams = {
        pattern: 'testPattern',
        include: '*.ts',
        path: 'src/app',
      };
      expect(grepTool.getDescription(params)).toContain(
        "'testPattern' in *.ts within",
      );
      expect(grepTool.getDescription(params)).toContain('src/app');
    });

    it('应在描述中为根路径使用 ./', () => {
      const params: GrepToolParams = { pattern: 'testPattern', path: '.' };
      expect(grepTool.getDescription(params)).toBe("'testPattern' within ./");
    });
  });
});