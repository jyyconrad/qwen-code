/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import readline from 'readline';
import { PassThrough } from 'stream';

export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  sequence: string;
}

/**
 * 一个监听 stdin 按键事件的 hook，提供一个与 Node 的 `readline` 模块中类似的
 * key 对象，并为以括号粘贴模式（bracketed paste）输入的字符添加 'paste' 标志。
 *
 * 当前粘贴内容作为单个按键事件发送，完整粘贴内容位于 sequence 字段中。
 *
 * @param onKeypress - 每次按键时执行的回调函数。
 * @param options - 控制 hook 行为的选项。
 * @param options.isActive - hook 是否应主动监听输入。
 */
export function useKeypress(
  onKeypress: (key: Key) => void,
  { isActive }: { isActive: boolean },
) {
  const { stdin, setRawMode } = useStdin();
  const onKeypressRef = useRef(onKeypress);

  useEffect(() => {
    onKeypressRef.current = onKeypress;
  }, [onKeypress]);

  useEffect(() => {
    if (!isActive || !stdin.isTTY) {
      return;
    }

    setRawMode(true);

    const keypressStream = new PassThrough();
    let usePassthrough = false;
    const nodeMajorVersion = parseInt(process.versions.node.split('.')[0], 10);
    if (
      nodeMajorVersion < 20 ||
      process.env['PASTE_WORKAROUND'] === '1' ||
      process.env['PASTE_WORKAROUND'] === 'true'
    ) {
      // 在 node 20 之前，Node 内建的 readline 不支持括号粘贴模式。
      // 我们通过自己的处理程序检测它来进行 hack。
      usePassthrough = true;
    }

    let isPaste = false;
    let pasteBuffer = Buffer.alloc(0);

    const handleKeypress = (_: unknown, key: Key) => {
      if (key.name === 'paste-start') {
        isPaste = true;
      } else if (key.name === 'paste-end') {
        isPaste = false;
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer.toString(),
        });
        pasteBuffer = Buffer.alloc(0);
      } else {
        if (isPaste) {
          pasteBuffer = Buffer.concat([pasteBuffer, Buffer.from(key.sequence)]);
        } else {
          // 处理特殊按键
          if (key.name === 'return' && key.sequence === '\x1B\r') {
            key.meta = true;
          }
          onKeypressRef.current({ ...key, paste: isPaste });
        }
      }
    };

    const handleRawKeypress = (data: Buffer) => {
      const PASTE_MODE_PREFIX = Buffer.from('\x1B[200~');
      const PASTE_MODE_SUFFIX = Buffer.from('\x1B[201~');

      let pos = 0;
      while (pos < data.length) {
        const prefixPos = data.indexOf(PASTE_MODE_PREFIX, pos);
        const suffixPos = data.indexOf(PASTE_MODE_SUFFIX, pos);

        // 确定哪个标记先出现（如果有的话）。
        const isPrefixNext =
          prefixPos !== -1 && (suffixPos === -1 || prefixPos < suffixPos);
        const isSuffixNext =
          suffixPos !== -1 && (prefixPos === -1 || suffixPos < prefixPos);

        let nextMarkerPos = -1;
        let markerLength = 0;

        if (isPrefixNext) {
          nextMarkerPos = prefixPos;
        } else if (isSuffixNext) {
          nextMarkerPos = suffixPos;
        }
        markerLength = PASTE_MODE_SUFFIX.length;

        if (nextMarkerPos === -1) {
          keypressStream.write(data.slice(pos));
          return;
        }

        const nextData = data.slice(pos, nextMarkerPos);
        if (nextData.length > 0) {
          keypressStream.write(nextData);
        }
        const createPasteKeyEvent = (
          name: 'paste-start' | 'paste-end',
        ): Key => ({
          name,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '',
        });
        if (isPrefixNext) {
          handleKeypress(undefined, createPasteKeyEvent('paste-start'));
        } else if (isSuffixNext) {
          handleKeypress(undefined, createPasteKeyEvent('paste-end'));
        }
        pos = nextMarkerPos + markerLength;
      }
    };

    let rl: readline.Interface;
    if (usePassthrough) {
      rl = readline.createInterface({ input: keypressStream });
      readline.emitKeypressEvents(keypressStream, rl);
      keypressStream.on('keypress', handleKeypress);
      stdin.on('data', handleRawKeypress);
    } else {
      rl = readline.createInterface({ input: stdin });
      readline.emitKeypressEvents(stdin, rl);
      stdin.on('keypress', handleKeypress);
    }

    return () => {
      if (usePassthrough) {
        keypressStream.removeListener('keypress', handleKeypress);
        stdin.removeListener('data', handleRawKeypress);
      } else {
        stdin.removeListener('keypress', handleKeypress);
      }
      rl.close();
      setRawMode(false);

      // 如果我们正处于粘贴过程中，则发送已有的内容。
      if (isPaste) {
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer.toString(),
        });
        pasteBuffer = Buffer.alloc(0);
      }
    };
  }, [isActive, stdin, setRawMode]);
}