/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import licenseHeader from 'eslint-plugin-license-header';
import noRelativeCrossPackageImports from './eslint-rules/no-relative-cross-package-imports.js';
import path from 'node:path'; // 使用 node: 前缀表示内置模块
import url from 'node:url';

// --- ESM 方式获取 __dirname ---
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- ---

// 确定 monorepo 根目录（假设 eslint.config.js 位于根目录）
const projectRoot = __dirname;

export default tseslint.config(
  {
    // 全局忽略
    ignores: [
      'node_modules/*',
      'eslint.config.js',
      'packages/cli/dist/**',
      'packages/core/dist/**',
      'packages/server/dist/**',
      'packages/vscode-ide-companion/dist/**',
      'eslint-rules/*',
      'bundle/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs['recommended-latest'],
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'], // 如果你使用 React 17+，请添加此项
  {
    // eslint-plugin-react 的设置
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // 导入特定配置
    files: ['packages/cli/src/**/*.{ts,tsx}'], // 仅针对 cli 包中的 TS/TSX 文件
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: true,
      },
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      'import/no-default-export': 'warn',
      'import/no-unresolved': 'off', // 暂时禁用，在 monorepo/paths 中可能会产生干扰
    },
  },
  {
    // 项目的通用覆盖和规则（TS/TSX 文件）
    files: ['packages/*/src/**/*.{ts,tsx}'], // 仅针对 cli 包中的 TS/TSX 文件
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // 通用最佳实践规则（为 flat config 调整的子集）
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      'arrow-body-style': ['error', 'as-needed'],
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as' },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'no-public' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-inferrable-types': [
        'error',
        { ignoreParameters: true, ignoreProperties: true },
      ],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-cond-assign': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: '避免使用 require()。请改用 ES6 导入。',
        },
        {
          selector: 'ThrowStatement > Literal:not([value=/^\\w+Error:/])',
          message:
            '不要抛出字符串字面量或非 Error 对象。请改用 throw new Error("...")。',
        },
      ],
      'no-unsafe-finally': 'error',
      'no-unused-expressions': 'off', // 禁用基础规则
      '@typescript-eslint/no-unused-expressions': [
        // 启用 TS 版本
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      'no-var': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-arrow-callback': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      radix: 'error',
      'default-case': 'error',
    },
  },
  {
    files: ['./**/*.{tsx,ts,js}'],
    plugins: {
      'license-header': licenseHeader,
    },
    rules: {
      'license-header/header': [
        'error',
        [
          '/**',
          ' * @license',
          ' * 版权所有 2025 Google LLC',
          ' * SPDX-License-Identifier: Apache-2.0',
          ' */',
        ],
      ],
    },
  },
  // 为直接使用 node 运行的脚本添加额外设置
  {
    files: ['./scripts/**/*.js', 'esbuild.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['packages/vscode-ide-companion/esbuild.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Prettier 配置必须放在最后
  prettierConfig,
  // 为直接使用 node 运行的脚本添加额外设置
  {
    files: ['./integration-tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // 此仓库的自定义 eslint 规则
  {
    files: ['packages/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      custom: {
        rules: {
          'no-relative-cross-package-imports': noRelativeCrossPackageImports,
        },
      },
    },
    rules: {
      // 启用并配置你的自定义规则
      'custom/no-relative-cross-package-imports': [
        'error',
        {
          root: path.join(projectRoot, 'packages'),
        },
      ],
    },
  },
);