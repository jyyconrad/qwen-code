/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { HistoryItem, MessageType } from '../types.js';
import { SessionStatsProvider } from '../contexts/SessionContext.js';

// 模拟子组件
vi.mock('./messages/ToolGroupMessage.js', () => ({
  ToolGroupMessage: () => <div />,
}));

describe('<HistoryItemDisplay />', () => {
  const baseItem = {
    id: 1,
    timestamp: 12345,
    isPending: false,
    terminalWidth: 80,
  };

  it('为 "user" 类型渲染 UserMessage', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: 'Hello',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('Hello');
  });

  it('为 "stats" 类型渲染 StatsDisplay', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.STATS,
      duration: '1s',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain('Stats');
  });

  it('为 "about" 类型渲染 AboutBox', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.ABOUT,
      cliVersion: '1.0.0',
      osVersion: 'test-os',
      sandboxEnv: 'test-env',
      modelVersion: 'test-model',
      selectedAuthType: 'test-auth',
      gcpProject: 'test-project',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('About Gemini CLI');
  });

  it('为 "model_stats" 类型渲染 ModelStatsDisplay', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'model_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain(
      'No API calls have been made in this session.',
    );
  });

  it('为 "tool_stats" 类型渲染 ToolStatsDisplay', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'tool_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain(
      'No tool calls have been made in this session.',
    );
  });

  it('为 "quit" 类型渲染 SessionSummaryDisplay', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'quit',
      duration: '1s',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain('Agent powering down. Goodbye!');
  });
});