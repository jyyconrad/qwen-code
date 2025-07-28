/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'crypto';
import { GeminiEventType, ServerGeminiStreamEvent } from '../core/turn.js';
import { logLoopDetected } from '../telemetry/loggers.js';
import { LoopDetectedEvent, LoopType } from '../telemetry/types.js';
import { Config } from '../config/config.js';

const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;
const SENTENCE_ENDING_PUNCTUATION_REGEX = /[.!?]+(?=\s|$)/;

/**
 * 用于检测和防止 AI 响应中无限循环的服务。
 * 监控工具调用重复和内容句子重复。
 */
export class LoopDetectionService {
  // 工具调用跟踪
  private lastToolCallKey: string | null = null;
  private toolCallRepetitionCount: number = 0;

  // 内容流式传输跟踪
  private lastRepeatedSentence: string = '';
  private sentenceRepetitionCount: number = 0;
  private partialContent: string = '';
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getToolCallKey(toolCall: { name: string; args: object }): string {
    const argsString = JSON.stringify(toolCall.args);
    const keyString = `${toolCall.name}:${argsString}`;
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * 处理流事件并检查循环条件。
   * @param event - 要处理的流事件
   * @returns 如果检测到循环则返回 true，否则返回 false
   */
  addAndCheck(event: ServerGeminiStreamEvent): boolean {
    switch (event.type) {
      case GeminiEventType.ToolCallRequest:
        // 内容吟唱只发生在单一的流中，如果中间有工具调用则重置
        this.resetSentenceCount();
        return this.checkToolCallLoop(event.value);
      case GeminiEventType.Content:
        return this.checkContentLoop(event.value);
      default:
        this.reset();
        return false;
    }
  }

  private checkToolCallLoop(toolCall: { name: string; args: object }): boolean {
    const key = this.getToolCallKey(toolCall);
    if (this.lastToolCallKey === key) {
      this.toolCallRepetitionCount++;
    } else {
      this.lastToolCallKey = key;
      this.toolCallRepetitionCount = 1;
    }
    if (this.toolCallRepetitionCount >= TOOL_CALL_LOOP_THRESHOLD) {
      logLoopDetected(
        this.config,
        new LoopDetectedEvent(LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS),
      );
      return true;
    }
    return false;
  }

  private checkContentLoop(content: string): boolean {
    this.partialContent += content;

    if (!SENTENCE_ENDING_PUNCTUATION_REGEX.test(this.partialContent)) {
      return false;
    }

    const completeSentences =
      this.partialContent.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
    if (completeSentences.length === 0) {
      return false;
    }

    const lastSentence = completeSentences[completeSentences.length - 1];
    const lastCompleteIndex = this.partialContent.lastIndexOf(lastSentence);
    const endOfLastSentence = lastCompleteIndex + lastSentence.length;
    this.partialContent = this.partialContent.slice(endOfLastSentence);

    for (const sentence of completeSentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence === '') {
        continue;
      }

      if (this.lastRepeatedSentence === trimmedSentence) {
        this.sentenceRepetitionCount++;
      } else {
        this.lastRepeatedSentence = trimmedSentence;
        this.sentenceRepetitionCount = 1;
      }

      if (this.sentenceRepetitionCount >= CONTENT_LOOP_THRESHOLD) {
        logLoopDetected(
          this.config,
          new LoopDetectedEvent(LoopType.CHANTING_IDENTICAL_SENTENCES),
        );
        return true;
      }
    }
    return false;
  }

  /**
   * 重置所有循环检测状态。
   */
  reset(): void {
    this.resetToolCallCount();
    this.resetSentenceCount();
  }

  private resetToolCallCount(): void {
    this.lastToolCallKey = null;
    this.toolCallRepetitionCount = 0;
  }

  private resetSentenceCount(): void {
    this.lastRepeatedSentence = '';
    this.sentenceRepetitionCount = 0;
    this.partialContent = '';
  }
}