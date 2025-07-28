/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { getCoreSystemPrompt } from './prompts.js';
import { isGitRepository } from '../utils/gitUtils.js';

// 如果工具名称是动态生成或复杂的，则进行模拟
vi.mock('../tools/ls', () => ({ LSTool: { Name: 'list_directory' } }));
vi.mock('../tools/edit', () => ({ EditTool: { Name: 'replace' } }));
vi.mock('../tools/glob', () => ({ GlobTool: { Name: 'glob' } }));
vi.mock('../tools/grep', () => ({ GrepTool: { Name: 'search_file_content' } }));
vi.mock('../tools/read-file', () => ({ ReadFileTool: { Name: 'read_file' } }));
vi.mock('../tools/read-many-files', () => ({
  ReadManyFilesTool: { Name: 'read_many_files' },
}));
vi.mock('../tools/shell', () => ({
  ShellTool: { Name: 'run_shell_command' },
}));
vi.mock('../tools/write-file', () => ({
  WriteFileTool: { Name: 'write_file' },
}));
vi.mock('../utils/gitUtils', () => ({
  isGitRepository: vi.fn(),
}));

describe('核心系统提示（prompts.ts）', () => {
  it('当未提供 userMemory 时应返回基础提示', () => {
    vi.stubEnv('SANDBOX', undefined);
    const prompt = getCoreSystemPrompt();
    expect(prompt).not.toContain('---\n\n'); // 分隔符不应存在
    expect(prompt).toContain('You are an interactive CLI agent'); // 检查核心内容
    expect(prompt).toMatchSnapshot(); // 使用快照记录基础提示结构
  });

  it('当 userMemory 为空字符串时应返回基础提示', () => {
    vi.stubEnv('SANDBOX', undefined);
    const prompt = getCoreSystemPrompt('');
    expect(prompt).not.toContain('---\n\n');
    expect(prompt).toContain('You are an interactive CLI agent');
    expect(prompt).toMatchSnapshot();
  });

  it('当 userMemory 仅为空白字符时应返回基础提示', () => {
    vi.stubEnv('SANDBOX', undefined);
    const prompt = getCoreSystemPrompt('   \n  \t ');
    expect(prompt).not.toContain('---\n\n');
    expect(prompt).toContain('You are an interactive CLI agent');
    expect(prompt).toMatchSnapshot();
  });

  it('当提供 userMemory 时应附加分隔符和记忆内容', () => {
    vi.stubEnv('SANDBOX', undefined);
    const memory = '这是自定义用户记忆。\n请格外礼貌。';
    const expectedSuffix = `\n\n---\n\n${memory}`;
    const prompt = getCoreSystemPrompt(memory);

    expect(prompt.endsWith(expectedSuffix)).toBe(true);
    expect(prompt).toContain('You are an interactive CLI agent'); // 确保基础提示跟随其后
    expect(prompt).toMatchSnapshot(); // 快照记录组合后的提示
  });

  it('当设置 SANDBOX 环境变量时应包含沙箱特定指令', () => {
    vi.stubEnv('SANDBOX', 'true'); // 通用沙箱值
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# Sandbox');
    expect(prompt).not.toContain('# MacOS Seatbelt');
    expect(prompt).not.toContain('# Outside of Sandbox');
    expect(prompt).toMatchSnapshot();
  });

  it('当 SANDBOX 环境变量为 "sandbox-exec" 时应包含安全带特定指令', () => {
    vi.stubEnv('SANDBOX', 'sandbox-exec');
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# MacOS Seatbelt');
    expect(prompt).not.toContain('# Sandbox');
    expect(prompt).not.toContain('# Outside of Sandbox');
    expect(prompt).toMatchSnapshot();
  });

  it('当未设置 SANDBOX 环境变量时应包含非沙箱指令', () => {
    vi.stubEnv('SANDBOX', undefined); // 确保未设置
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# Outside of Sandbox');
    expect(prompt).not.toContain('# Sandbox');
    expect(prompt).not.toContain('# MacOS Seatbelt');
    expect(prompt).toMatchSnapshot();
  });

  it('当处于 git 仓库中时应包含 git 指令', () => {
    vi.stubEnv('SANDBOX', undefined);
    vi.mocked(isGitRepository).mockReturnValue(true);
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# Git Repository');
    expect(prompt).toMatchSnapshot();
  });

  it('当不处于 git 仓库中时不应包含 git 指令', () => {
    vi.stubEnv('SANDBOX', undefined);
    vi.mocked(isGitRepository).mockReturnValue(false);
    const prompt = getCoreSystemPrompt();
    expect(prompt).not.toContain('# Git Repository');
    expect(prompt).toMatchSnapshot();
  });
});