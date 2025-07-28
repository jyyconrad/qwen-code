/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schema } from '@google/genai';
import * as ajv from 'ajv';

const ajValidator = new ajv.Ajv();

/**
 * 用于根据 JSON Schema 验证对象的简单工具
 */
export class SchemaValidator {
  /**
   * 如果数据符合 schema 所描述的结构（或 schema 为 null）则返回 null。
   * 否则，返回描述错误的字符串。
   */
  static validate(schema: Schema | undefined, data: unknown): string | null {
    if (!schema) {
      return null;
    }
    if (typeof data !== 'object' || data === null) {
      return '参数值必须为对象';
    }
    const validate = ajValidator.compile(this.toObjectSchema(schema));
    const valid = validate(data);
    if (!valid && validate.errors) {
      return ajValidator.errorsText(validate.errors, { dataVar: 'params' });
    }
    return null;
  }

  /**
   * 将 @google/genai 的 Schema 转换为与 avj 兼容的对象。
   * 这是必要的，因为它将类型表示为枚举（使用大写值），
   * 并将 minItems 和 minLength 表示为字符串，而它们应为数字。
   */
  private static toObjectSchema(schema: Schema): object {
    const newSchema: Record<string, unknown> = { ...schema };
    if (newSchema.anyOf && Array.isArray(newSchema.anyOf)) {
      newSchema.anyOf = newSchema.anyOf.map((v) => this.toObjectSchema(v));
    }
    if (newSchema.items) {
      newSchema.items = this.toObjectSchema(newSchema.items);
    }
    if (newSchema.properties && typeof newSchema.properties === 'object') {
      const newProperties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(newSchema.properties)) {
        newProperties[key] = this.toObjectSchema(value as Schema);
      }
      newSchema.properties = newProperties;
    }
    if (newSchema.type) {
      newSchema.type = String(newSchema.type).toLowerCase();
    }
    if (newSchema.minItems) {
      newSchema.minItems = Number(newSchema.minItems);
    }
    if (newSchema.minLength) {
      newSchema.minLength = Number(newSchema.minLength);
    }
    return newSchema;
  }
}