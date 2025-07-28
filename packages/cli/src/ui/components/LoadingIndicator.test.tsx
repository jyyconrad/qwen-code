/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { vi } from 'vitest';

// 模拟 GeminiRespondingSpinner
vi.mock('./GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: ({
    nonRespondingDisplay,
  }: {
    nonRespondingDisplay?: string;
  }) => {
    const streamingState = React.useContext(StreamingContext)!;
    if (streamingState === StreamingState.Responding) {
      return <Text>MockRespondingSpinner</Text>;
    } else if (nonRespondingDisplay) {
      return <Text>{nonRespondingDisplay}</Text>;
    }
    return null;
  },
}));

const renderWithContext = (
  ui: React.ReactElement,
  streamingStateValue: StreamingState,
) => {
  const contextValue: StreamingState = streamingStateValue;
  return render(
    <StreamingContext.Provider value={contextValue}>
      {ui}
    </StreamingContext.Provider>,
  );
};

describe('<LoadingIndicator />', () => {
  const defaultProps = {
    currentLoadingPhrase: '加载中...',
    elapsedTime: 5,
  };

  it('当 streamingState 为 Idle 时不应渲染', () => {
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...defaultProps} />,
      StreamingState.Idle,
    );
    expect(lastFrame()).toBe('');
  });

  it('当 streamingState 为 Responding 时应渲染旋转器、短语和时间', () => {
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...defaultProps} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toContain('MockRespondingSpinner');
    expect(output).toContain('加载中...');
    expect(output).toContain('(按 esc 取消, 5s)');
  });

  it('当 streamingState 为 WaitingForConfirmation 时应渲染旋转器(静态)、短语但不显示时间/取消', () => {
    const props = {
      currentLoadingPhrase: '确认操作',
      elapsedTime: 10,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.WaitingForConfirmation,
    );
    const output = lastFrame();
    expect(output).toContain('⠏'); // WaitingForConfirmation 的静态字符
    expect(output).toContain('确认操作');
    expect(output).not.toContain('(按 esc 取消)');
    expect(output).not.toContain(', 10s');
  });

  it('应正确显示 currentLoadingPhrase', () => {
    const props = {
      currentLoadingPhrase: '处理数据...',
      elapsedTime: 3,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('处理数据...');
  });

  it('当 Responding 时应正确显示 elapsedTime', () => {
    const props = {
      currentLoadingPhrase: '工作中...',
      elapsedTime: 60,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('(按 esc 取消, 1m)');
  });

  it('应以人类可读格式正确显示 elapsedTime', () => {
    const props = {
      currentLoadingPhrase: '工作中...',
      elapsedTime: 125,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('(按 esc 取消, 2m 5s)');
  });

  it('当提供 rightContent 时应渲染', () => {
    const rightContent = <Text>额外信息</Text>;
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...defaultProps} rightContent={rightContent} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('额外信息');
  });

  it('使用 rerender 在状态间正确转换', () => {
    const { lastFrame, rerender } = renderWithContext(
      <LoadingIndicator {...defaultProps} />,
      StreamingState.Idle,
    );
    expect(lastFrame()).toBe(''); // 初始: Idle

    // 转换到 Responding
    rerender(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <LoadingIndicator
          currentLoadingPhrase="现在响应中"
          elapsedTime={2}
        />
      </StreamingContext.Provider>,
    );
    let output = lastFrame();
    expect(output).toContain('MockRespondingSpinner');
    expect(output).toContain('现在响应中');
    expect(output).toContain('(按 esc 取消, 2s)');

    // 转换到 WaitingForConfirmation
    rerender(
      <StreamingContext.Provider value={StreamingState.WaitingForConfirmation}>
        <LoadingIndicator
          currentLoadingPhrase="请确认"
          elapsedTime={15}
        />
      </StreamingContext.Provider>,
    );
    output = lastFrame();
    expect(output).toContain('⠏');
    expect(output).toContain('请确认');
    expect(output).not.toContain('(按 esc 取消)');
    expect(output).not.toContain(', 15s');

    // 转换回 Idle
    rerender(
      <StreamingContext.Provider value={StreamingState.Idle}>
        <LoadingIndicator {...defaultProps} />
      </StreamingContext.Provider>,
    );
    expect(lastFrame()).toBe('');
  });

  it('当 thought 为空时应显示备用短语', () => {
    const props = {
      thought: null,
      currentLoadingPhrase: '加载中...',
      elapsedTime: 5,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toContain('加载中...');
  });

  it('应显示 thought 的主题', () => {
    const props = {
      thought: {
        subject: '正在思考某事...',
        description: '和其他内容。',
      },
      elapsedTime: 5,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toBeDefined();
    if (output) {
      expect(output).toContain('正在思考某事...');
      expect(output).not.toContain('和其他内容。');
    }
  });

  it('应优先显示 thought.subject 而不是 currentLoadingPhrase', () => {
    const props = {
      thought: {
        subject: '这应该被显示',
        description: '一个描述',
      },
      currentLoadingPhrase: '这不应该被显示',
      elapsedTime: 5,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toContain('这应该被显示');
    expect(output).not.toContain('这不应该被显示');
  });
});