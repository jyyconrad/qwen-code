/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview 禁止在指定的 monorepo 包之间使用相对导入。
 */
'use strict';

import path from 'node:path';
import fs from 'node:fs';

/**
 * 通过在目录层级中搜索最近的 `package.json` 文件来查找包名，
 * 从给定文件的目录开始向上搜索，直到到达指定的根目录为止。
 * 它读取 `package.json` 并提取 `name` 属性。
 *
 * @requires module:path Node.js path 模块
 * @requires module:fs Node.js fs 模块
 *
 * @param {string} filePath - 潜在包结构内某个文件的路径（绝对或相对）。
 * 搜索从包含该文件的目录开始。
 * @param {string} root - 项目/monorepo 根目录的绝对路径。
 * 向上的搜索会在到达此目录时停止。
 * @returns {string | undefined | null} 从找到的第一个 `package.json` 中提取的 `name` 字段值。
 * 如果找到的 `package.json` 中不存在 `name` 字段，则返回 `undefined`。
 * 如果在到达 `root` 目录之前未找到 `package.json`，则返回 `null`。
 * @throws {Error} 当 `fs.readFileSync` 失败（例如权限问题）或 `JSON.parse` 在无效 JSON 内容上失败时可能抛出错误。
 */
function findPackageName(filePath, root) {
  let currentDir = path.dirname(path.resolve(filePath));
  while (currentDir !== root) {
    const parentDir = path.dirname(currentDir);
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return pkg.name;
    }

    // 向上移动一级
    currentDir = parentDir;
    // 安全退出：如果以某种方式直接在循环条件中到达了根目录（使用 path.resolve 时不太可能发生）
    if (path.dirname(currentDir) === currentDir) break;
  }

  return null; // 在预期结构中未找到
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止包之间使用相对导入。',
      category: '最佳实践',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          root: {
            type: 'string',
            description:
              '所有相关包的根目录的绝对路径。',
          },
        },
        required: ['root'],
        additionalProperties: false,
      },
    ],
    messages: {
      noRelativePathsForCrossPackageImport:
        "相对导入 '{{importedPath}}' 跨越了从 '{{importingPackage}}' 到 '{{importedPackage}}' 的包边界。请使用直接包导入 ('{{importedPackage}}') 代替。",
      relativeImportIsInvalidPackage:
        "相对导入 '{{importedPath}}' 未引用有效包。所有源代码必须位于包目录中。",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allPackagesRoot = options.root;

    const currentFilePath = context.filename;
    if (
      !currentFilePath ||
      currentFilePath === '<input>' ||
      currentFilePath === '<text>'
    ) {
      // 如果文件名不可用（例如，对原始文本进行 lint），则跳过
      return {};
    }

    const currentPackage = findPackageName(currentFilePath, allPackagesRoot);

    // 如果当前文件不在包结构内，则不应用此规则
    if (!currentPackage) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        const importingPackage = currentPackage;
        const importedPath = node.source.value;

        // 只关注相对路径
        if (
          !importedPath ||
          typeof importedPath !== 'string' ||
          !importedPath.startsWith('.')
        ) {
          return;
        }

        // 解析导入模块的绝对路径
        const absoluteImportPath = path.resolve(
          path.dirname(currentFilePath),
          importedPath,
        );

        // 查找导入文件的包信息
        const importedPackage = findPackageName(
          absoluteImportPath,
          allPackagesRoot,
        );

        // 如果导入的文件不在已识别的包中，则报告问题
        if (!importedPackage) {
          context.report({
            node: node.source,
            messageId: 'relativeImportIsInvalidPackage',
            data: { importedPath: importedPath },
          });
          return;
        }

        // 核心检查：源包和目标包是否不同？
        if (currentPackage !== importedPackage) {
          // 我们发现了一个跨越包边界的相对导入
          context.report({
            node: node.source, // 在源字符串字面量上报告错误
            messageId: 'noRelativePathsForCrossPackageImport',
            data: {
              importedPath,
              importedPackage,
              importingPackage,
            },
            fix(fixer) {
              return fixer.replaceText(node.source, `'${importedPackage}'`);
            },
          });
        }
      },
    };
  },
};