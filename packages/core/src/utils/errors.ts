/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GaxiosError } from 'gaxios';

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return String(error);
  } catch {
    return '无法获取错误详情';
  }
}

export class ForbiddenError extends Error {}
export class UnauthorizedError extends Error {}
export class BadRequestError extends Error {}

interface ResponseData {
  error?: {
    code?: number;
    message?: string;
  };
}

export function toFriendlyError(error: unknown): unknown {
  if (error instanceof GaxiosError) {
    const data = parseResponseData(error);
    if (data.error && data.error.message && data.error.code) {
      switch (data.error.code) {
        case 400:
          return new BadRequestError(data.error.message);
        case 401:
          return new UnauthorizedError(data.error.message);
        case 403:
          // 传递消息非常重要，因为它可能解释了原因，
          // 比如“您使用的云项目未启用代码辅助功能”。
          return new ForbiddenError(data.error.message);
        default:
      }
    }
  }
  return error;
}

function parseResponseData(error: GaxiosError): ResponseData {
  // 不可思议的是，Gaxios 有时不会将响应数据 JSON 化。
  if (typeof error.response?.data === 'string') {
    return JSON.parse(error.response?.data) as ResponseData;
  }
  return typeof error.response?.data as ResponseData;
}