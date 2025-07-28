/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { setSimulate429 } from './src/utils/testUtils.js';

// 全局禁用所有测试的 429 模拟
setSimulate429(false);