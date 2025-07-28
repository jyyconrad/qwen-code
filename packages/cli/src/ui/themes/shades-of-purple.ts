/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shades of Purple 主题 — 用于 Highlightjs。
 * @author Ahmad Awais <https://twitter.com/mrahmadawais/>
 */
import { type ColorsTheme, Theme } from './theme.js';

const shadesOfPurpleColors: ColorsTheme = {
  type: 'dark',
  // ColorsTheme 接口所需的配色
  Background: '#2d2b57', // 主背景色
  Foreground: '#e3dfff', // 默认文本颜色（hljs, hljs-subst）
  LightBlue: '#847ace', // 浅蓝/紫色强调色
  AccentBlue: '#a599e9', // 边框、次级蓝色
  AccentPurple: '#ac65ff', // 注释（主紫色）
  AccentCyan: '#a1feff', // 名称
  AccentGreen: '#A5FF90', // 字符串及其他多项
  AccentYellow: '#fad000', // 标题、主黄色
  AccentRed: '#ff628c', // 错误/删除强调色
  Comment: '#B362FF', // 注释颜色（与 AccentPurple 相同）
  Gray: '#726c86', // 灰色
  GradientColors: ['#4d21fc', '#847ace', '#ff628c'],
};

// CSS 中额外的颜色，不适用于 ColorsTheme 接口
const additionalColors = {
  AccentYellowAlt: '#f8d000', // 属性黄色（略有不同）
  AccentOrange: '#fb9e00', // 关键字、built_in、meta
  AccentPink: '#fa658d', // 数字、字面量
  AccentLightPurple: '#c991ff', // 用于参数和属性
  AccentDarkPurple: '#6943ff', // 用于操作符
  AccentTeal: '#2ee2fa', // 用于特殊结构
};

export const ShadesOfPurple = new Theme(
  'Shades Of Purple',
  'dark',
  {
    // 基础样式
    hljs: {
      display: 'block',
      overflowX: 'auto',
      background: shadesOfPurpleColors.Background,
      color: shadesOfPurpleColors.Foreground,
    },

    // 标题元素
    'hljs-title': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'normal',
    },

    // 名称
    'hljs-name': {
      color: shadesOfPurpleColors.AccentCyan,
      fontWeight: 'normal',
    },

    // 标签
    'hljs-tag': {
      color: shadesOfPurpleColors.Foreground,
    },

    // 属性
    'hljs-attr': {
      color: additionalColors.AccentYellowAlt,
      fontStyle: 'italic',
    },

    // 内置元素、选择器标签、章节
    'hljs-built_in': {
      color: additionalColors.AccentOrange,
    },
    'hljs-selector-tag': {
      color: additionalColors.AccentOrange,
      fontWeight: 'normal',
    },
    'hljs-section': {
      color: additionalColors.AccentOrange,
    },

    // 关键字
    'hljs-keyword': {
      color: additionalColors.AccentOrange,
      fontWeight: 'normal',
    },

    // 默认文本和替换
    'hljs-subst': {
      color: shadesOfPurpleColors.Foreground,
    },

    // 字符串及相关元素（均为绿色）
    'hljs-string': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-attribute': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-symbol': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-bullet': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-addition': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-code': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-regexp': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-selector-class': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-selector-attr': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-selector-pseudo': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-template-tag': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-quote': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-deletion': {
      color: shadesOfPurpleColors.AccentRed,
    },

    // 元数据元素
    'hljs-meta': {
      color: additionalColors.AccentOrange,
    },
    'hljs-meta-string': {
      color: additionalColors.AccentOrange,
    },

    // 注释
    'hljs-comment': {
      color: shadesOfPurpleColors.AccentPurple,
    },

    // 字面量和数字
    'hljs-literal': {
      color: additionalColors.AccentPink,
      fontWeight: 'normal',
    },
    'hljs-number': {
      color: additionalColors.AccentPink,
    },

    // 强调和加粗
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },

    // 差异类（diff-specific）
    'hljs-diff': {
      color: shadesOfPurpleColors.Foreground,
    },
    'hljs-meta.hljs-diff': {
      color: shadesOfPurpleColors.AccentBlue,
    },
    'hljs-ln': {
      color: shadesOfPurpleColors.Gray,
    },

    // 可能需要的额外元素
    'hljs-type': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'normal',
    },
    'hljs-variable': {
      color: shadesOfPurpleColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-function .hljs-keyword': {
      color: additionalColors.AccentOrange,
    },
    'hljs-link': {
      color: shadesOfPurpleColors.LightBlue,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },

    // 函数参数
    'hljs-params': {
      color: additionalColors.AccentLightPurple,
      fontStyle: 'italic',
    },

    // 类定义
    'hljs-class': {
      color: shadesOfPurpleColors.AccentCyan,
      fontWeight: 'bold',
    },

    // 函数定义
    'hljs-function': {
      color: shadesOfPurpleColors.AccentCyan,
    },

    // 对象属性
    'hljs-property': {
      color: shadesOfPurpleColors.AccentBlue,
    },

    // 操作符
    'hljs-operator': {
      color: additionalColors.AccentDarkPurple,
    },

    // 标点符号（如解析器支持）
    'hljs-punctuation': {
      color: shadesOfPurpleColors.Gray,
    },

    // CSS ID 选择器
    'hljs-selector-id': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'bold',
    },

    // 字符字面量
    'hljs-char': {
      color: shadesOfPurpleColors.AccentGreen,
    },

    // 转义序列
    'hljs-escape': {
      color: additionalColors.AccentPink,
      fontWeight: 'bold',
    },

    // 元关键字
    'hljs-meta-keyword': {
      color: additionalColors.AccentOrange,
      fontWeight: 'bold',
    },

    // 内置名称
    'hljs-builtin-name': {
      color: additionalColors.AccentTeal,
    },

    // 模块
    'hljs-module': {
      color: shadesOfPurpleColors.AccentCyan,
    },

    // 命名空间
    'hljs-namespace': {
      color: shadesOfPurpleColors.LightBlue,
    },

    // 重要注解
    'hljs-important': {
      color: shadesOfPurpleColors.AccentRed,
      fontWeight: 'bold',
    },

    // 公式（用于 LaTeX 等）
    'hljs-formula': {
      color: shadesOfPurpleColors.AccentCyan,
      fontStyle: 'italic',
    },

    // 特定语言的扩展
    // Python 装饰器
    'hljs-decorator': {
      color: additionalColors.AccentTeal,
      fontWeight: 'bold',
    },

    // Ruby 符号
    'hljs-symbol.ruby': {
      color: additionalColors.AccentPink,
    },

    // SQL 关键字
    'hljs-keyword.sql': {
      color: additionalColors.AccentOrange,
      textTransform: 'uppercase',
    },

    // Markdown 特定样式
    'hljs-section.markdown': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'bold',
    },

    // JSON 键
    'hljs-attr.json': {
      color: shadesOfPurpleColors.AccentCyan,
    },

    // XML/HTML 特定样式
    'hljs-tag .hljs-name': {
      color: shadesOfPurpleColors.AccentRed,
    },
    'hljs-tag .hljs-attr': {
      color: additionalColors.AccentYellowAlt,
    },

    // 行高亮（启用行号时）
    'hljs.hljs-line-numbers': {
      borderRight: `1px solid ${shadesOfPurpleColors.Gray}`,
    },
    'hljs.hljs-line-numbers .hljs-ln-numbers': {
      color: shadesOfPurpleColors.Gray,
      paddingRight: '1em',
    },
    'hljs.hljs-line-numbers .hljs-ln-code': {
      paddingLeft: '1em',
    },

    // 选中样式
    'hljs::selection': {
      background: shadesOfPurpleColors.AccentBlue + '40', // 40 = 25% 不透明度
    },
    'hljs ::-moz-selection': {
      background: shadesOfPurpleColors.AccentBlue + '40',
    },

    // 高亮行（用于强调）
    'hljs .hljs-highlight': {
      background: shadesOfPurpleColors.AccentPurple + '20', // 20 = 12.5% 不透明度
      display: 'block',
      width: '100%',
    },
  },
  shadesOfPurpleColors,
);