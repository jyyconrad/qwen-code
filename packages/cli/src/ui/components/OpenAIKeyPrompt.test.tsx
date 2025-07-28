/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';

describe('OpenAIKeyPrompt', () => {
  it('应正确渲染提示信息', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { lastFrame } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    expect(lastFrame()).toContain('需要 OpenAI 配置');
    expect(lastFrame()).toContain('https://platform.openai.com/api-keys');
    expect(lastFrame()).toContain(
      '按 Enter 继续，Tab/↑↓ 导航，Esc 取消',
    );
  });

  it('应以正确的样式显示组件', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { lastFrame } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    const output = lastFrame();
    expect(output).toContain('需要 OpenAI 配置');
    expect(output).toContain('API 密钥:');
    expect(output).toContain('基础 URL:');
    expect(output).toContain('模型:');
    expect(output).toContain(
      '按 Enter 继续，Tab/↑↓ 导航，Esc 取消',
    );
  });

  it('应处理包含控制字符的粘贴操作', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { stdin } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    // 模拟包含控制字符的粘贴操作
    const pasteWithControlChars = '\x1b[200~sk-test123\x1b[201~';
    stdin.write(pasteWithControlChars);

    // 等待一段时间以完成处理
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 组件应过滤掉控制字符，仅保留 'sk-test123'
    expect(onSubmit).not.toHaveBeenCalled(); // 此时尚未提交
  });
});