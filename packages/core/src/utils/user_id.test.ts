/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getInstallationId } from './user_id.js';

describe('user_id', () => {
  describe('getInstallationId', () => {
    it('应返回一个有效的 UUID 格式字符串', () => {
      const installationId = getInstallationId();

      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);

      // 后续调用应返回相同的 ID（一致性）
      const secondCall = getInstallationId();
      expect(secondCall).toBe(installationId);
    });
  });
});