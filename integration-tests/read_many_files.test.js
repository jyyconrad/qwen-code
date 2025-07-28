/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test.skip('应该能够读取多个文件', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('file1.txt', 'file 1 content');
  rig.createFile('file2.txt', 'file 2 content');

  const prompt = `读取此目录中的文件，列出它们并打印到屏幕上`;
  const result = await rig.run(prompt);

  assert.ok(result.includes('file 1 content'));
  assert.ok(result.includes('file 2 content'));
});