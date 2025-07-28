/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import { Logger, MessageSenderType, LogEntry } from './logger.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Content } from '@google/genai';

import crypto from 'node:crypto';
import os from 'node:os';

const GEMINI_DIR_NAME = '.iflycode';
const TMP_DIR_NAME = 'tmp';
const LOG_FILE_NAME = 'logs.json';
const CHECKPOINT_FILE_NAME = 'checkpoint.json';

const projectDir = process.cwd();
const hash = crypto.createHash('sha256').update(projectDir).digest('hex');
const TEST_GEMINI_DIR = path.join(
  os.homedir(),
  GEMINI_DIR_NAME,
  TMP_DIR_NAME,
  hash,
);

const TEST_LOG_FILE_PATH = path.join(TEST_GEMINI_DIR, LOG_FILE_NAME);
const TEST_CHECKPOINT_FILE_PATH = path.join(
  TEST_GEMINI_DIR,
  CHECKPOINT_FILE_NAME,
);

async function cleanupLogAndCheckpointFiles() {
  try {
    await fs.rm(TEST_GEMINI_DIR, { recursive: true, force: true });
  } catch (_error) {
    // 忽略错误，因为目录可能不存在，这是可以接受的。
  }
}

async function readLogFile(): Promise<LogEntry[]> {
  try {
    const content = await fs.readFile(TEST_LOG_FILE_PATH, 'utf-8');
    return JSON.parse(content) as LogEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

vi.mock('../utils/session.js', () => ({
  sessionId: 'test-session-id',
}));

describe('Logger', () => {
  let logger: Logger;
  const testSessionId = 'test-session-id';

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    // 测试前清理
    await cleanupLogAndCheckpointFiles();
    // 确保测试目录存在
    await fs.mkdir(TEST_GEMINI_DIR, { recursive: true });
    logger = new Logger(testSessionId);
    await logger.initialize();
  });

  afterEach(async () => {
    if (logger) {
      logger.close();
    }
    // 测试后清理
    await cleanupLogAndCheckpointFiles();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // 最终清理
    await cleanupLogAndCheckpointFiles();
  });

  describe('initialize', () => {
    it('如果不存在，应创建 .gemini 目录和空日志文件', async () => {
      const dirExists = await fs
        .access(TEST_GEMINI_DIR)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);

      const fileExists = await fs
        .access(TEST_LOG_FILE_PATH)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
    });

    it('应加载现有日志并为当前会话设置正确的 messageId', async () => {
      const currentSessionId = 'session-123';
      const anotherSessionId = 'session-456';
      const existingLogs: LogEntry[] = [
        {
          sessionId: currentSessionId,
          messageId: 0,
          timestamp: new Date('2025-01-01T10:00:05.000Z').toISOString(),
          type: MessageSenderType.USER,
          message: 'Msg1',
        },
        {
          sessionId: anotherSessionId,
          messageId: 5,
          timestamp: new Date('2025-01-01T09:00:00.000Z').toISOString(),
          type: MessageSenderType.USER,
          message: 'OldMsg',
        },
        {
          sessionId: currentSessionId,
          messageId: 1,
          timestamp: new Date('2025-01-01T10:00:10.000Z').toISOString(),
          type: MessageSenderType.USER,
          message: 'Msg2',
        },
      ];
      await fs.writeFile(
        TEST_LOG_FILE_PATH,
        JSON.stringify(existingLogs, null, 2),
      );
      const newLogger = new Logger(currentSessionId);
      await newLogger.initialize();
      expect(newLogger['messageId']).toBe(2);
      expect(newLogger['logs']).toEqual(existingLogs);
      newLogger.close();
    });

    it('如果日志文件存在但当前会话没有日志，则应为新会话将 messageId 设置为 0', async () => {
      const existingLogs: LogEntry[] = [
        {
          sessionId: 'some-other-session',
          messageId: 5,
          timestamp: new Date().toISOString(),
          type: MessageSenderType.USER,
          message: 'OldMsg',
        },
      ];
      await fs.writeFile(
        TEST_LOG_FILE_PATH,
        JSON.stringify(existingLogs, null, 2),
      );
      const newLogger = new Logger('a-new-session');
      await newLogger.initialize();
      expect(newLogger['messageId']).toBe(0);
      newLogger.close();
    });

    it('应该是幂等的', async () => {
      await logger.logMessage(MessageSenderType.USER, 'test message');
      const initialMessageId = logger['messageId'];
      const initialLogCount = logger['logs'].length;

      await logger.initialize(); // 第二次调用不应改变状态

      expect(logger['messageId']).toBe(initialMessageId);
      expect(logger['logs'].length).toBe(initialLogCount);
      const logsFromFile = await readLogFile();
      expect(logsFromFile.length).toBe(1);
    });

    it('应通过备份无效 JSON 并重新开始来处理日志文件中的无效 JSON', async () => {
      await fs.writeFile(TEST_LOG_FILE_PATH, 'invalid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const newLogger = new Logger(testSessionId);
      await newLogger.initialize();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('日志文件中的 JSON 无效'),
        expect.any(SyntaxError),
      );
      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
      const dirContents = await fs.readdir(TEST_GEMINI_DIR);
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(LOG_FILE_NAME + '.invalid_json') && f.endsWith('.bak'),
        ),
      ).toBe(true);
      newLogger.close();
    });

    it('应通过备份非数组 JSON 并重新开始来处理日志文件中的非数组 JSON', async () => {
      await fs.writeFile(
        TEST_LOG_FILE_PATH,
        JSON.stringify({ not: 'an array' }),
      );
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const newLogger = new Logger(testSessionId);
      await newLogger.initialize();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        `位于 ${TEST_LOG_FILE_PATH} 的日志文件不是有效的 JSON 数组。从空日志开始。`,
      );
      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
      const dirContents = await fs.readdir(TEST_GEMINI_DIR);
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(LOG_FILE_NAME + '.malformed_array') &&
            f.endsWith('.bak'),
        ),
      ).toBe(true);
      newLogger.close();
    });
  });

  describe('logMessage', () => {
    it('应将消息追加到日志文件并更新内存中的日志', async () => {
      await logger.logMessage(MessageSenderType.USER, 'Hello, world!');
      const logsFromFile = await readLogFile();
      expect(logsFromFile.length).toBe(1);
      expect(logsFromFile[0]).toMatchObject({
        sessionId: testSessionId,
        messageId: 0,
        type: MessageSenderType.USER,
        message: 'Hello, world!',
        timestamp: new Date('2025-01-01T12:00:00.000Z').toISOString(),
      });
      expect(logger['logs'].length).toBe(1);
      expect(logger['logs'][0]).toEqual(logsFromFile[0]);
      expect(logger['messageId']).toBe(1);
    });

    it('应为同一会话中的后续消息正确递增 messageId', async () => {
      await logger.logMessage(MessageSenderType.USER, 'First');
      vi.advanceTimersByTime(1000);
      await logger.logMessage(MessageSenderType.USER, 'Second');
      const logs = await readLogFile();
      expect(logs.length).toBe(2);
      expect(logs[0].messageId).toBe(0);
      expect(logs[1].messageId).toBe(1);
      expect(logs[1].timestamp).not.toBe(logs[0].timestamp);
      expect(logger['messageId']).toBe(2);
    });

    it('应处理未初始化的日志记录器', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close(); // 确保被视为未初始化
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      await uninitializedLogger.logMessage(MessageSenderType.USER, 'test');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '日志记录器未初始化或缺少会话 ID。无法记录消息。',
      );
      expect((await readLogFile()).length).toBe(0);
      uninitializedLogger.close();
    });

    it('应模拟来自不同日志记录器实例对同一文件的并发写入', async () => {
      const concurrentSessionId = 'concurrent-session';
      const logger1 = new Logger(concurrentSessionId);
      await logger1.initialize();

      const logger2 = new Logger(concurrentSessionId);
      await logger2.initialize();
      expect(logger2['sessionId']).toEqual(logger1['sessionId']);

      await logger1.logMessage(MessageSenderType.USER, 'L1M1');
      vi.advanceTimersByTime(10);
      await logger2.logMessage(MessageSenderType.USER, 'L2M1');
      vi.advanceTimersByTime(10);
      await logger1.logMessage(MessageSenderType.USER, 'L1M2');
      vi.advanceTimersByTime(10);
      await logger2.logMessage(MessageSenderType.USER, 'L2M2');

      const logsFromFile = await readLogFile();
      expect(logsFromFile.length).toBe(4);
      const messageIdsInFile = logsFromFile
        .map((log) => log.messageId)
        .sort((a, b) => a - b);
      expect(messageIdsInFile).toEqual([0, 1, 2, 3]);

      const messagesInFile = logsFromFile
        .sort((a, b) => a.messageId - b.messageId)
        .map((l) => l.message);
      expect(messagesInFile).toEqual(['L1M1', 'L2M1', 'L1M2', 'L2M2']);

      // 检查内部状态（每个记录器在该会话中将使用的下一个 messageId）
      expect(logger1['messageId']).toBe(3);
      expect(logger2['messageId']).toBe(4);

      logger1.close();
      logger2.close();
    });

    it('如果写入文件失败，不应抛出异常，不递增 messageId，并记录错误', async () => {
      vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('磁盘已满'));
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      const initialMessageId = logger['messageId'];
      const initialLogCount = logger['logs'].length;

      await logger.logMessage(MessageSenderType.USER, 'test fail write');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '写入日志文件时出错:',
        expect.any(Error),
      );
      expect(logger['messageId']).toBe(initialMessageId); // 未递增
      expect(logger['logs'].length).toBe(initialLogCount); // 未添加到内存缓存中
    });
  });

  describe('getPreviousUserMessages', () => {
    it('应从日志中检索所有用户消息，按最新排序', async () => {
      const loggerSort = new Logger('session-1');
      await loggerSort.initialize();
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M0_ts100000');
      vi.advanceTimersByTime(1000);
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M1_ts101000');
      vi.advanceTimersByTime(1000);
      // 切换到不同会话进行记录
      const loggerSort2 = new Logger('session-2');
      await loggerSort2.initialize();
      await loggerSort2.logMessage(MessageSenderType.USER, 'S2M0_ts102000');
      vi.advanceTimersByTime(1000);
      await loggerSort2.logMessage(
        'model' as MessageSenderType,
        'S2_Model_ts103000',
      );
      vi.advanceTimersByTime(1000);
      await loggerSort2.logMessage(MessageSenderType.USER, 'S2M1_ts104000');
      loggerSort.close();
      loggerSort2.close();

      const finalLogger = new Logger('final-session');
      await finalLogger.initialize();

      const messages = await finalLogger.getPreviousUserMessages();
      expect(messages).toEqual([
        'S2M1_ts104000',
        'S2M0_ts102000',
        'S1M1_ts101000',
        'S1M0_ts100000',
      ]);
      finalLogger.close();
    });

    it('如果没有用户消息存在，应返回空数组', async () => {
      await logger.logMessage('system' as MessageSenderType, 'System boot');
      const messages = await logger.getPreviousUserMessages();
      expect(messages).toEqual([]);
    });

    it('如果日志记录器未初始化，应返回空数组', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const messages = await uninitializedLogger.getPreviousUserMessages();
      expect(messages).toEqual([]);
      uninitializedLogger.close();
    });
  });

  describe('saveCheckpoint', () => {
    const conversation: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];

    it('当提供标签时，应将检查点保存到标记文件中', async () => {
      const tag = 'my-test-tag';
      await logger.saveCheckpoint(conversation, tag);
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `${CHECKPOINT_FILE_NAME.replace('.json', '')}-${tag}.json`,
      );
      const fileContent = await fs.readFile(taggedFilePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual(conversation);
    });

    it('如果日志记录器未初始化，不应抛出异常', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        uninitializedLogger.saveCheckpoint(conversation, 'tag'),
      ).resolves.not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '日志记录器未初始化或未设置检查点文件路径。无法保存检查点。',
      );
    });
  });

  describe('loadCheckpoint', () => {
    const conversation: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];

    beforeEach(async () => {
      await fs.writeFile(
        TEST_CHECKPOINT_FILE_PATH,
        JSON.stringify(conversation, null, 2),
      );
    });

    it('当提供标签时，应从标记的检查点文件加载', async () => {
      const tag = 'my-load-tag';
      const taggedConversation = [
        ...conversation,
        { role: 'user', parts: [{ text: 'Another message' }] },
      ];
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `${CHECKPOINT_FILE_NAME.replace('.json', '')}-${tag}.json`,
      );
      await fs.writeFile(
        taggedFilePath,
        JSON.stringify(taggedConversation, null, 2),
      );

      const loaded = await logger.loadCheckpoint(tag);
      expect(loaded).toEqual(taggedConversation);
    });

    it('如果标记的检查点文件不存在，应返回空数组', async () => {
      const loaded = await logger.loadCheckpoint('non-existent-tag');
      expect(loaded).toEqual([]);
    });

    it('如果检查点文件不存在，应返回空数组', async () => {
      await fs.unlink(TEST_CHECKPOINT_FILE_PATH); // 确保文件已删除
      const loaded = await logger.loadCheckpoint('missing');
      expect(loaded).toEqual([]);
    });

    it('如果文件包含无效 JSON，应返回空数组', async () => {
      await fs.writeFile(TEST_CHECKPOINT_FILE_PATH, 'invalid json');
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const loadedCheckpoint = await logger.loadCheckpoint('missing');
      expect(loadedCheckpoint).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('读取或解析检查点文件失败'),
        expect.any(Error),
      );
    });

    it('如果日志记录器未初始化，应返回空数组', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const loadedCheckpoint = await uninitializedLogger.loadCheckpoint('tag');
      expect(loadedCheckpoint).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '日志记录器未初始化或未设置检查点文件路径。无法加载检查点。',
      );
    });
  });

  describe('close', () => {
    it('应重置日志记录器状态', async () => {
      await logger.logMessage(MessageSenderType.USER, 'A message');
      logger.close();
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      await logger.logMessage(MessageSenderType.USER, 'Another message');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '日志记录器未初始化或缺少会话 ID。无法记录消息。',
      );
      const messages = await logger.getPreviousUserMessages();
      expect(messages).toEqual([]);
      expect(logger['initialized']).toBe(false);
      expect(logger['logFilePath']).toBeUndefined();
      expect(logger['logs']).toEqual([]);
      expect(logger['sessionId']).toBeUndefined();
      expect(logger['messageId']).toBe(0);
    });
  });
});
