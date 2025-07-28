/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const iflycodeDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#0b0e14',
  Foreground: '#bfbdb6',
  LightBlue: '#59C2FF',
  AccentBlue: '#39BAE6',
  AccentPurple: '#D2A6FF',
  AccentCyan: '#95E6CB',
  AccentGreen: '#AAD94C',
  AccentYellow: '#FFD700',
  AccentRed: '#F26D78',
  Comment: '#646A71',
  Gray: '#3D4149',
  GradientColors: ['#FFD700', '#da7959'],
};

export const iFlyCodeDark: Theme = new Theme(
  'iFlyCode Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: iflycodeDarkColors.Background,
      color: iflycodeDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-literal': {
      color: iflycodeDarkColors.AccentPurple,
    },
    'hljs-symbol': {
      color: iflycodeDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: iflycodeDarkColors.LightBlue,
    },
    'hljs-link': {
      color: iflycodeDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-subst': {
      color: iflycodeDarkColors.Foreground,
    },
    'hljs-string': {
      color: iflycodeDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: iflycodeDarkColors.AccentBlue,
    },
    'hljs-attribute': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-bullet': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: iflycodeDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: iflycodeDarkColors.Foreground,
    },
    'hljs-template-tag': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-comment': {
      color: iflycodeDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: iflycodeDarkColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: iflycodeDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: iflycodeDarkColors.AccentYellow,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  iflycodeDarkColors,
);