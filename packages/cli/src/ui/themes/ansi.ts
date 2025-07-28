/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const ansiColors: ColorsTheme = {
  type: 'dark',
  Background: 'black',
  Foreground: 'white',
  LightBlue: 'bluebright',
  AccentBlue: 'blue',
  AccentPurple: 'magenta',
  AccentCyan: 'cyan',
  AccentGreen: 'green',
  AccentYellow: 'yellow',
  AccentRed: 'red',
  Comment: 'gray',
  Gray: 'gray',
  GradientColors: ['cyan', 'green'],
};

export const ANSI: Theme = new Theme(
  'ANSI',
  'dark', // 与其调色板基础一致
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: 'black', // 映射自 #1E1E1E
      color: 'white', // 映射自 #DCDCDC
    },
    'hljs-keyword': {
      color: 'blue', // 映射自 #569CD6
    },
    'hljs-literal': {
      color: 'blue', // 映射自 #569CD6
    },
    'hljs-symbol': {
      color: 'blue', // 映射自 #569CD6
    },
    'hljs-name': {
      color: 'blue', // 映射自 #569CD6
    },
    'hljs-link': {
      color: 'blue', // 映射自 #569CD6
      // textDecoration 被 Theme 类忽略
    },
    'hljs-built_in': {
      color: 'cyan', // 映射自 #4EC9B0
    },
    'hljs-type': {
      color: 'cyan', // 映射自 #4EC9B0
    },
    'hljs-number': {
      color: 'green', // 映射自 #B8D7A3
    },
    'hljs-class': {
      color: 'green', // 映射自 #B8D7A3
    },
    'hljs-string': {
      color: 'yellow', // 映射自 #D69D85
    },
    'hljs-meta-string': {
      color: 'yellow', // 映射自 #D69D85
    },
    'hljs-regexp': {
      color: 'red', // 映射自 #9A5334
    },
    'hljs-template-tag': {
      color: 'red', // 映射自 #9A5334
    },
    'hljs-subst': {
      color: 'white', // 映射自 #DCDCDC
    },
    'hljs-function': {
      color: 'white', // 映射自 #DCDCDC
    },
    'hljs-title': {
      color: 'white', // 映射自 #DCDCDC
    },
    'hljs-params': {
      color: 'white', // 映射自 #DCDCDC
    },
    'hljs-formula': {
      color: 'white', // 映射自 #DCDCDC
    },
    'hljs-comment': {
      color: 'green', // 映射自 #57A64A
      // fontStyle 被 Theme 类忽略
    },
    'hljs-quote': {
      color: 'green', // 映射自 #57A64A
      // fontStyle 被 Theme 类忽略
    },
    'hljs-doctag': {
      color: 'green', // 映射自 #608B4E
    },
    'hljs-meta': {
      color: 'gray', // 映射自 #9B9B9B
    },
    'hljs-meta-keyword': {
      color: 'gray', // 映射自 #9B9B9B
    },
    'hljs-tag': {
      color: 'gray', // 映射自 #9B9B9B
    },
    'hljs-variable': {
      color: 'magenta', // 映射自 #BD63C5
    },
    'hljs-template-variable': {
      color: 'magenta', // 映射自 #BD63C5
    },
    'hljs-attr': {
      color: 'bluebright', // 映射自 #9CDCFE
    },
    'hljs-attribute': {
      color: 'bluebright', // 映射自 #9CDCFE
    },
    'hljs-builtin-name': {
      color: 'bluebright', // 映射自 #9CDCFE
    },
    'hljs-section': {
      color: 'yellow', // 映射自 gold
    },
    'hljs-emphasis': {
      // fontStyle 被 Theme 类忽略
    },
    'hljs-strong': {
      // fontWeight 被 Theme 类忽略
    },
    'hljs-bullet': {
      color: 'yellow', // 映射自 #D7BA7D
    },
    'hljs-selector-tag': {
      color: 'yellow', // 映射自 #D7BA7D
    },
    'hljs-selector-id': {
      color: 'yellow', // 映射自 #D7BA7D
    },
    'hljs-selector-class': {
      color: 'yellow', // 映射自 #D7BA7D
    },
    'hljs-selector-attr': {
      color: 'yellow', // 映射自 #D7BA7D
    },
    'hljs-selector-pseudo': {
      color: 'yellow', // 映射自 #D7BA7D
    },
  },
  ansiColors,
);