/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { safeJsonStringify } from './safeJsonStringify.js';

describe('safeJsonStringify', () => {
  it('应能正常序列化普通对象', () => {
    const obj = { name: 'test', value: 42 };
    const result = safeJsonStringify(obj);
    expect(result).toBe('{"name":"test","value":42}');
  });

  it('应通过将循环引用替换为 [Circular] 来处理循环引用', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { name: 'test' };
    obj.circular = obj; // 创建循环引用

    const result = safeJsonStringify(obj);
    expect(result).toBe('{"name":"test","circular":"[Circular]"}');
  });

  it('应能处理像 HttpsProxyAgent 这样的复杂循环结构', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent: any = {
      sockets: {},
      options: { host: 'example.com' },
    };
    agent.sockets['example.com'] = [{ agent }];

    const result = safeJsonStringify(agent);
    expect(result).toContain('[Circular]');
    expect(result).toContain('example.com');
  });

  it('应根据 space 参数进行格式化', () => {
    const obj = { name: 'test', value: 42 };
    const result = safeJsonStringify(obj, 2);
    expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}');
  });

  it('应能处理带格式化的循环引用', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { name: 'test' };
    obj.circular = obj;

    const result = safeJsonStringify(obj, 2);
    expect(result).toBe('{\n  "name": "test",\n  "circular": "[Circular]"\n}');
  });

  it('应能处理包含循环引用的数组', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = [{ id: 1 }];
    arr[0].parent = arr; // 创建循环引用

    const result = safeJsonStringify(arr);
    expect(result).toBe('[{"id":1,"parent":"[Circular]"}]');
  });

  it('应能处理 null 和 undefined 值', () => {
    expect(safeJsonStringify(null)).toBe('null');
    expect(safeJsonStringify(undefined)).toBe(undefined);
  });

  it('应能处理基本类型值', () => {
    expect(safeJsonStringify('test')).toBe('"test"');
    expect(safeJsonStringify(42)).toBe('42');
    expect(safeJsonStringify(true)).toBe('true');
  });
});