/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to save to memory', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);

  const prompt = `记住我最喜欢的颜色是蓝色。

  我最喜欢的颜色是什么？告诉我并用 $ 符号包围它`;
  const result = await rig.run(prompt);

  assert.ok(result.toLowerCase().includes('$blue$'));
});