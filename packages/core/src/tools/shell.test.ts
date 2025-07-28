/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, vi, beforeEach } from 'vitest';
import { ShellTool } from './shell.js';
import { Config } from '../config/config.js';
import * as summarizer from '../utils/summarizer.js';
import { GeminiClient } from '../core/client.js';

describe('ShellTool', () => {
  it('如果未提供限制条件，应允许命令执行', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
    } as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('如果命令在允许列表中，应允许命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('如果命令不在允许列表中，应阻止命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('如果命令在阻止列表中，应阻止命令执行', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('如果命令不在阻止列表中，应允许命令执行', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('如果命令同时在允许列表和阻止列表中，应阻止命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(rm -rf /)'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('当 ShellTool 在 coreTools 中但没有指定具体命令时，应允许任何命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(true);
  });

  it('当 ShellTool 在 excludeTools 中但没有指定具体命令时，应阻止任何命令执行', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['ShellTool'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Shell tool is globally disabled in configuration',
    );
  });

  it('如果命令使用公开名称在允许列表中，应允许命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('如果命令使用公开名称在阻止列表中，应阻止命令执行', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['run_shell_command(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('当 ShellTool 使用公开名称在 excludeTools 中时，应阻止任何命令执行', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_shell_command'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Shell tool is globally disabled in configuration',
    );
  });

  it('如果 coreTools 包含一个空的 ShellTool 命令列表（使用公开名称），应阻止任何命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'any command' is not in the allowed commands list",
    );
  });

  it('如果 coreTools 包含一个空的 ShellTool 命令列表，应阻止任何命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'any command' is not in the allowed commands list",
    );
  });

  it('如果命令包含额外空格且在阻止列表中，应阻止命令执行', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(' rm  -rf  / ');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('当 ShellTool 存在并带有特定命令时，应允许任何命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool', 'ShellTool(ls)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(true);
  });

  it('即使有通配符允许，也应阻止阻止列表中的命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('应允许以允许的命令前缀开头的命令执行', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
    );
    expect(result.allowed).toBe(true);
  });

  it('应允许以允许的命令前缀开头的命令执行（使用公开名称）', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
    );
    expect(result.allowed).toBe(true);
  });

  it('不应允许以允许的命令前缀开头但与另一个命令链接的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue edit&&rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('不应允许是允许命令前缀的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'gh issue' is not in the allowed commands list",
    );
  });

  it('不应阻止是阻止命令前缀的命令执行', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_shell_command(gh issue edit)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue');
    expect(result.allowed).toBe(true);
  });

  it('不应允许通过管道链接的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list | rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('不应允许通过分号链接的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list; rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('如果链接命令的任何部分被阻止，应阻止整个命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo "hello")'],
      getExcludeTools: () => ['run_shell_command(rm)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" && rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('如果命令前缀在阻止列表中，即使命令本身在允许列表中，也应阻止命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(git push)'],
      getExcludeTools: () => ['run_shell_command(git)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('git push');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'git push' is blocked by configuration",
    );
  });

  it('匹配时应区分大小写', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ECHO "hello"');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command \'ECHO "hello"\' is not in the allowed commands list',
    );
  });

  it('应正确处理链接操作符周围有额外空格的命令', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(ls -l)'],
      getExcludeTools: () => ['run_shell_command(rm)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l  ;  rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('如果链接命令的所有部分都被允许，应允许命令执行', async () => {
    const config = {
      getCoreTools: () => [
        'run_shell_command(echo)',
        'run_shell_command(ls -l)',
      ],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" && ls -l');
    expect(result.allowed).toBe(true);
  });

  it('应允许使用反引号进行命令替换的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo `rm -rf /`');
    expect(result.allowed).toBe(true);
  });

  it('应阻止使用 $() 进行命令替换的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo $(rm -rf /)');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command substitution using $() is not allowed for security reasons',
    );
  });

  it('应允许带有 I/O 重定向的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" > file.txt');
    expect(result.allowed).toBe(true);
  });

  it('不应允许通过双管道链接的命令执行', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list || rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });
});

describe('ShellTool Bug Reproduction', () => {
  let shellTool: ShellTool;
  let config: Config;

  beforeEach(() => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
    } as unknown as Config;
    shellTool = new ShellTool(config);
  });

  it('不应让 summarizer 覆盖返回显示', async () => {
    const summarizeSpy = vi
      .spyOn(summarizer, 'summarizeToolOutput')
      .mockResolvedValue('summarized output');

    const abortSignal = new AbortController().signal;
    const result = await shellTool.execute(
      { command: 'echo "hello"' },
      abortSignal,
    );

    expect(result.returnDisplay).toBe('hello\n');
    expect(result.llmContent).toBe('summarized output');
    expect(summarizeSpy).toHaveBeenCalled();
  });
});