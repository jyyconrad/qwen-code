/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const iflycodeLightColors: ColorsTheme = {
  type: 'light',
  Background: '#f8f9fa',
  Foreground: '#1b1c1dff',
  LightBlue: '#199eeaff',
  AccentBlue: '#2f70e8ff',
  AccentPurple: '#9653daff',
  AccentCyan: '#12dfb2ff',
  AccentGreen: '#86b300',
  AccentYellow: '#f2ae49',
  AccentRed: '#f07171',
  Comment: '#757779ff',
  Gray: '#9f9fa2ff',
  GradientColors: ['#399ee6', '#86b300'],
};

export const iFlyCodeLight: Theme = new Theme(
  'iFlyCode Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: iflycodeLightColors.Background,
      color: iflycodeLightColors.Foreground,
    },
    'hljs-comment': {
      color: iflycodeLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: iflycodeLightColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-string': {
      color: iflycodeLightColors.AccentGreen,
    },
    'hljs-constant': {
      color: iflycodeLightColors.AccentCyan,
    },
    'hljs-number': {
      color: iflycodeLightColors.AccentPurple,
    },
    'hljs-keyword': {
      color: iflycodeLightColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: iflycodeLightColors.AccentYellow,
    },
    'hljs-attribute': {
      color: iflycodeLightColors.AccentYellow,
    },
    'hljs-variable': {
      color: iflycodeLightColors.Foreground,
    },
    'hljs-variable.language': {
      color: iflycodeLightColors.LightBlue,
      fontStyle: 'italic',
    },
    'hljs-title': {
      color: iflycodeLightColors.AccentBlue,
    },
    'hljs-section': {
      color: iflycodeLightColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: iflycodeLightColors.LightBlue,
    },
    'hljs-class .hljs-title': {
      color: iflycodeLightColors.AccentBlue,
    },
    'hljs-tag': {
      color: iflycodeLightColors.LightBlue,
    },
    'hljs-name': {
      color: iflycodeLightColors.AccentBlue,
    },
    'hljs-builtin-name': {
      color: iflycodeLightColors.AccentYellow,
    },
    'hljs-meta': {
      color: iflycodeLightColors.AccentYellow,
    },
    'hljs-symbol': {
      color: iflycodeLightColors.AccentRed,
    },
    'hljs-bullet': {
      color: iflycodeLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: iflycodeLightColors.AccentCyan,
    },
    'hljs-link': {
      color: iflycodeLightColors.LightBlue,
    },
    'hljs-deletion': {
      color: iflycodeLightColors.AccentRed,
    },
    'hljs-addition': {
      color: iflycodeLightColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: iflycodeLightColors.AccentCyan,
    },
    'hljs-built_in': {
      color: iflycodeLightColors.AccentRed,
    },
    'hljs-doctag': {
      color: iflycodeLightColors.AccentRed,
    },
    'hljs-template-variable': {
      color: iflycodeLightColors.AccentCyan,
    },
    'hljs-selector-id': {
      color: iflycodeLightColors.AccentRed,
    },
  },
  iflycodeLightColors,
);