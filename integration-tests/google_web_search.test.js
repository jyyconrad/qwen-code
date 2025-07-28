/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to search the web', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);

  const prompt = `我们住在哪个星球上`;
  const result = await rig.run(prompt);

  assert.ok(result.toLowerCase().includes('earth'));
});