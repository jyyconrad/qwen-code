/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopDetectionService } from './loopDetectionService.js';
import {
  GeminiEventType,
  ServerGeminiContentEvent,
  ServerGeminiToolCallRequestEvent,
} from '../core/turn.js';
import { ServerGeminiStreamEvent } from '../core/turn.js';
import { Config } from '../config/config.js';
import * as loggers from '../telemetry/loggers.js';

vi.mock('../telemetry/loggers.js', () => ({
  logLoopDetected: vi.fn(),
}));

const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;

describe('LoopDetectionService', () => {
  let service: LoopDetectionService;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getTelemetryEnabled: () => true,
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    vi.clearAllMocks();
  });

  const createToolCallRequestEvent = (
    name: string,
    args: Record<string, unknown>,
  ): ServerGeminiToolCallRequestEvent => ({
    type: GeminiEventType.ToolCallRequest,
    value: {
      name,
      args,
      callId: 'test-id',
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    },
  });

  const createContentEvent = (content: string): ServerGeminiContentEvent => ({
    type: GeminiEventType.Content,
    value: content,
  });

  describe('工具调用循环检测', () => {
    it(`对于少于 TOOL_CALL_LOOP_THRESHOLD 次相同调用不应检测到循环`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(event)).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it(`应在第 TOOL_CALL_LOOP_THRESHOLD 次相同调用时检测到循环`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });

    it('应在后续相同调用时检测到循环', () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(2);
    });

    it('对于不同的工具调用不应检测到循环', () => {
      const event1 = createToolCallRequestEvent('testTool', {
        param: 'value1',
      });
      const event2 = createToolCallRequestEvent('testTool', {
        param: 'value2',
      });
      const event3 = createToolCallRequestEvent('anotherTool', {
        param: 'value1',
      });

      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 2; i++) {
        expect(service.addAndCheck(event1)).toBe(false);
        expect(service.addAndCheck(event2)).toBe(false);
        expect(service.addAndCheck(event3)).toBe(false);
      }
    });
  });

  describe('内容循环检测', () => {
    it(`对于少于 CONTENT_LOOP_THRESHOLD 次相同内容字符串不应检测到循环`, () => {
      const event = createContentEvent('This is a test sentence.');
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(event)).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it(`应在第 CONTENT_LOOP_THRESHOLD 次相同内容字符串时检测到循环`, () => {
      const event = createContentEvent('This is a test sentence.');
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });

    it('对于不同的内容字符串不应检测到循环', () => {
      const event1 = createContentEvent('Sentence A');
      const event2 = createContentEvent('Sentence B');
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 2; i++) {
        expect(service.addAndCheck(event1)).toBe(false);
        expect(service.addAndCheck(event2)).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });
  });

  describe('句子提取和标点符号', () => {
    it('当内容没有句末标点符号时不应检查循环', () => {
      const eventNoPunct = createContentEvent('This has no punctuation');
      expect(service.addAndCheck(eventNoPunct)).toBe(false);

      const eventWithPunct = createContentEvent('This has punctuation!');
      expect(service.addAndCheck(eventWithPunct)).toBe(false);
    });

    it('不应将函数调用或方法调用视为句末', () => {
      // 这些不应触发句子检测，所以重复多次也永远不会导致循环
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(service.addAndCheck(createContentEvent('console.log()'))).toBe(
          false,
        );
      }

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(service.addAndCheck(createContentEvent('obj.method()'))).toBe(
          false,
        );
      }

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(
          service.addAndCheck(createContentEvent('arr.filter().map()')),
        ).toBe(false);
      }

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(
          service.addAndCheck(
            createContentEvent('if (condition) { return true; }'),
          ),
        ).toBe(false);
      }
    });

    it('应正确识别实际的句末并触发循环检测', () => {
      // 这些应触发句子检测，所以重复它们最终应导致循环
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(
          service.addAndCheck(createContentEvent('This is a sentence.')),
        ).toBe(false);
      }
      expect(
        service.addAndCheck(createContentEvent('This is a sentence.')),
      ).toBe(true);

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(
          service.addAndCheck(createContentEvent('Is this a question? ')),
        ).toBe(false);
      }
      expect(
        service.addAndCheck(createContentEvent('Is this a question? ')),
      ).toBe(true);

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(
          service.addAndCheck(createContentEvent('What excitement!\n')),
        ).toBe(false);
      }
      expect(
        service.addAndCheck(createContentEvent('What excitement!\n')),
      ).toBe(true);
    });

    it('应处理包含混合标点符号的内容', () => {
      service.addAndCheck(createContentEvent('Question?'));
      service.addAndCheck(createContentEvent('Exclamation!'));
      service.addAndCheck(createContentEvent('Period.'));

      // 重复其中一个多次
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent('Period.'));
      }
      expect(service.addAndCheck(createContentEvent('Period.'))).toBe(true);
    });

    it('应处理修剪后为空的句子', () => {
      service.addAndCheck(createContentEvent('   .'));
      expect(service.addAndCheck(createContentEvent('Normal sentence.'))).toBe(
        false,
      );
    });

    it('循环检测至少需要两个句子', () => {
      const event = createContentEvent('Only one sentence.');
      expect(service.addAndCheck(event)).toBe(false);

      // 即使重复相同的单个句子也不应触发检测
      for (let i = 0; i < 5; i++) {
        expect(service.addAndCheck(event)).toBe(false);
      }
    });
  });

  describe('性能优化', () => {
    it('应缓存句子提取，仅在内容显著增长时重新提取', () => {
      // 添加初始内容
      service.addAndCheck(createContentEvent('First sentence.'));
      service.addAndCheck(createContentEvent('Second sentence.'));

      // 添加少量内容（不应触发重新提取）
      for (let i = 0; i < 10; i++) {
        service.addAndCheck(createContentEvent('X'));
      }
      service.addAndCheck(createContentEvent('.'));

      // 应仍能正常工作
      expect(service.addAndCheck(createContentEvent('Test.'))).toBe(false);
    });

    it('当内容增长超过100个字符时应重新提取句子', () => {
      service.addAndCheck(createContentEvent('Initial sentence.'));

      // 添加足够内容以触发重新提取
      const longContent = 'X'.repeat(101);
      service.addAndCheck(createContentEvent(longContent + '.'));

      // 重新提取后应能正常工作
      expect(service.addAndCheck(createContentEvent('Test.'))).toBe(false);
    });

    it('应使用indexOf进行高效计数而不是正则表达式', () => {
      const repeatedSentence = 'This is a repeated sentence.';

      // 构建包含重复句子的内容
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent(repeatedSentence));
      }

      // 应达到阈值
      expect(service.addAndCheck(createContentEvent(repeatedSentence))).toBe(
        true,
      );
    });
  });

  describe('边缘情况', () => {
    it('应处理空内容', () => {
      const event = createContentEvent('');
      expect(service.addAndCheck(event)).toBe(false);
    });
  });

  describe('重置功能', () => {
    it('工具调用应重置内容计数', () => {
      const contentEvent = createContentEvent('Some content.');
      const toolEvent = createToolCallRequestEvent('testTool', {
        param: 'value',
      });
      for (let i = 0; i < 9; i++) {
        service.addAndCheck(contentEvent);
      }

      service.addAndCheck(toolEvent);

      // 应重新开始
      expect(service.addAndCheck(createContentEvent('Fresh content.'))).toBe(
        false,
      );
    });
  });

  describe('通用行为', () => {
    it('对于未处理的事件类型应返回false', () => {
      const otherEvent = {
        type: 'unhandled_event',
      } as unknown as ServerGeminiStreamEvent;
      expect(service.addAndCheck(otherEvent)).toBe(false);
      expect(service.addAndCheck(otherEvent)).toBe(false);
    });
  });
});