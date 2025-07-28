/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 用于在单元测试中模拟 429 错误的测试工具
 */

let requestCounter = 0;
let simulate429Enabled = false;
let simulate429AfterRequests = 0;
let simulate429ForAuthType: string | undefined;
let fallbackOccurred = false;

/**
 * 检查是否应为当前请求模拟 429 错误
 */
export function shouldSimulate429(authType?: string): boolean {
  if (!simulate429Enabled || fallbackOccurred) {
    return false;
  }

  // 如果设置了身份验证类型过滤器，则仅针对该身份验证类型模拟
  if (simulate429ForAuthType && authType !== simulate429ForAuthType) {
    return false;
  }

  requestCounter++;

  // 如果设置了 afterRequests，则在达到该请求数之后才模拟
  if (simulate429AfterRequests > 0) {
    return requestCounter > simulate429AfterRequests;
  }

  // 否则，为每个请求模拟
  return true;
}

/**
 * 重置请求计数器（对测试有用）
 */
export function resetRequestCounter(): void {
  requestCounter = 0;
}

/**
 * 在成功回退后禁用 429 模拟
 */
export function disableSimulationAfterFallback(): void {
  fallbackOccurred = true;
}

/**
 * 创建一个模拟的 429 错误响应
 */
export function createSimulated429Error(): Error {
  const error = new Error('超出速率限制（模拟）') as Error & {
    status: number;
  };
  error.status = 429;
  return error;
}

/**
 * 切换身份验证方法时重置模拟状态
 */
export function resetSimulationState(): void {
  fallbackOccurred = false;
  resetRequestCounter();
}

/**
 * 以编程方式启用/禁用 429 模拟（用于测试）
 */
export function setSimulate429(
  enabled: boolean,
  afterRequests = 0,
  forAuthType?: string,
): void {
  simulate429Enabled = enabled;
  simulate429AfterRequests = afterRequests;
  simulate429ForAuthType = forAuthType;
  fallbackOccurred = false; // 重新启用模拟时重置回退状态
  resetRequestCounter();
}