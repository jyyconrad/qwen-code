/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { ToolMessage, ToolMessageProps } from './ToolMessage.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { Text } from 'ink';
import { StreamingContext } from '../../contexts/StreamingContext.js';

// 如果子组件或工具复杂或有副作用，则进行模拟
vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: ({
    nonRespondingDisplay,
  }: {
    nonRespondingDisplay?: string;
  }) => {
    const streamingState = React.useContext(StreamingContext)!;
    if (streamingState === StreamingState.Responding) {
      return <Text>MockRespondingSpinner</Text>;
    }
    return nonRespondingDisplay ? <Text>{nonRespondingDisplay}</Text> : null;
  },
}));
vi.mock('./DiffRenderer.js', () => ({
  DiffRenderer: function MockDiffRenderer({
    diffContent,
  }: {
    diffContent: string;
  }) {
    return <Text>MockDiff:{diffContent}</Text>;
  },
}));
vi.mock('../../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: function MockMarkdownDisplay({ text }: { text: string }) {
    return <Text>MockMarkdown:{text}</Text>;
  },
}));

// 带上下文的渲染辅助函数
const renderWithContext = (
  ui: React.ReactElement,
  streamingState: StreamingState,
) => {
  const contextValue: StreamingState = streamingState;
  return render(
    <StreamingContext.Provider value={contextValue}>
      {ui}
    </StreamingContext.Provider>,
  );
};

describe('<ToolMessage />', () => {
  const baseProps: ToolMessageProps = {
    callId: 'tool-123',
    name: 'test-tool',
    description: '用于测试的工具',
    resultDisplay: '测试结果',
    status: ToolCallStatus.Success,
    terminalWidth: 80,
    confirmationDetails: undefined,
    emphasis: 'medium',
  };

  it('渲染基本工具信息', () => {
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} />,
      StreamingState.Idle,
    );
    const output = lastFrame();
    expect(output).toContain('✔'); // 成功指示器
    expect(output).toContain('test-tool');
    expect(output).toContain('用于测试的工具');
    expect(output).toContain('MockMarkdown:测试结果');
  });

  describe('ToolStatusIndicator 渲染', () => {
    it('成功状态显示 ✔', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Success} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('✔');
    });

    it('待处理状态显示 o', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Pending} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('o');
    });

    it('确认状态显示 ?', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Confirming} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('?');
    });

    it('已取消状态显示 -', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Canceled} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('-');
    });

    it('错误状态显示 x', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Error} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('x');
    });

    it('执行状态且流状态为 Idle 时显示暂停的旋转器', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.Idle,
      );
      expect(lastFrame()).toContain('⊷');
      expect(lastFrame()).not.toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✔');
    });

    it('执行状态且流状态为 WaitingForConfirmation 时显示暂停的旋转器', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.WaitingForConfirmation,
      );
      expect(lastFrame()).toContain('⊷');
      expect(lastFrame()).not.toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✔');
    });

    it('执行状态且流状态为 Responding 时显示 MockRespondingSpinner', () => {
      const { lastFrame } = renderWithContext(
        <ToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        StreamingState.Responding, // 模拟应用仍在响应中
      );
      expect(lastFrame()).toContain('MockRespondingSpinner');
      expect(lastFrame()).not.toContain('✔');
    });
  });

  it('为差异结果渲染 DiffRenderer', () => {
    const diffResult = {
      fileDiff: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
      fileName: 'file.txt',
    };
    const { lastFrame } = renderWithContext(
      <ToolMessage {...baseProps} resultDisplay={diffResult} />,
      StreamingState.Idle,
    );
    // 检查输出是否包含 MockDiff 内容作为整个消息的一部分
    expect(lastFrame()).toMatch(/MockDiff:--- a\/file\.txt/);
  });

  it('正确渲染强调', () => {
    const { lastFrame: highEmphasisFrame } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="high" />,
      StreamingState.Idle,
    );
    // 检查是否有尾部指示器或特定颜色（如果适用）（颜色在此处难以测试）
    expect(highEmphasisFrame()).toContain('←'); // 高强调的尾部指示器

    const { lastFrame: lowEmphasisFrame } = renderWithContext(
      <ToolMessage {...baseProps} emphasis="low" />,
      StreamingState.Idle,
    );
    // 对于低强调，名称和描述可能会变暗（如果可能，检查 dimColor）
    // 在没有颜色检查的文本输出中很难直接断言。
    // 至少可以确保它没有高强调指示器。
    expect(lowEmphasisFrame()).not.toContain('←');
  });
});