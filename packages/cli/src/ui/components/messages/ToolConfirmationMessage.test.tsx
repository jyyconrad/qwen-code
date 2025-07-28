/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import { ToolCallConfirmationDetails } from '@iflytek/iflycode-core';

describe('ToolConfirmationMessage', () => {
  it('如果提示和URL相同，则不应显示URL', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: '确认网络获取',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = render(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).not.toContain('要获取的URL:');
  });

  it('如果提示和URL不同，则应显示URL', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: '确认网络获取',
      prompt:
        '获取 https://github.com/google/gemini-react/blob/main/README.md',
      urls: [
        'https://raw.githubusercontent.com/google/gemini-react/main/README.md',
      ],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = render(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('要获取的URL:');
    expect(lastFrame()).toContain(
      '- https://raw.githubusercontent.com/google/gemini-react/main/README.md',
    );
  });
});