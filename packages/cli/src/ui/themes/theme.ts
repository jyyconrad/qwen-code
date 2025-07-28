/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CSSProperties } from 'react';

export type ThemeType = 'light' | 'dark' | 'ansi';

export interface ColorsTheme {
  type: ThemeType;
  Background: string;
  Foreground: string;
  LightBlue: string;
  AccentBlue: string;
  AccentPurple: string;
  AccentCyan: string;
  AccentGreen: string;
  AccentYellow: string;
  AccentRed: string;
  Comment: string;
  Gray: string;
  GradientColors?: string[];
}

export const lightTheme: ColorsTheme = {
  type: 'light',
  Background: '#FAFAFA',
  Foreground: '#3C3C43',
  LightBlue: '#89BDCD',
  AccentBlue: '#3B82F6',
  AccentPurple: '#8B5CF6',
  AccentCyan: '#06B6D4',
  AccentGreen: '#3CA84B',
  AccentYellow: '#D5A40A',
  AccentRed: '#DD4C4C',
  Comment: '#008000',
  Gray: '#B7BECC',
  GradientColors: ['#4796E4', '#847ACE', '#C3677F'],
};

export const darkTheme: ColorsTheme = {
  type: 'dark',
  Background: '#1E1E2E',
  Foreground: '#CDD6F4',
  LightBlue: '#ADD8E6',
  AccentBlue: '#89B4FA',
  AccentPurple: '#CBA6F7',
  AccentCyan: '#89DCEB',
  AccentGreen: '#A6E3A1',
  AccentYellow: '#F9E2AF',
  AccentRed: '#F38BA8',
  Comment: '#6C7086',
  Gray: '#6C7086',
  GradientColors: ['#4796E4', '#847ACE', '#C3677F'],
};

export const ansiTheme: ColorsTheme = {
  type: 'ansi',
  Background: 'black',
  Foreground: 'white',
  LightBlue: 'blue',
  AccentBlue: 'blue',
  AccentPurple: 'magenta',
  AccentCyan: 'cyan',
  AccentGreen: 'green',
  AccentYellow: 'yellow',
  AccentRed: 'red',
  Comment: 'gray',
  Gray: 'gray',
};

export class Theme {
  /**
   * 当没有特定高亮规则适用时，文本的默认前景色。
   * 这是一个与 Ink 兼容的颜色字符串（十六进制或名称）。
   */
  readonly defaultColor: string;
  /**
   * 存储从 highlight.js 类名（例如 'hljs-keyword'）
   * 到与 Ink 兼容的颜色字符串（十六进制或名称）的映射。
   */
  protected readonly _colorMap: Readonly<Record<string, string>>;

  // --- 静态辅助数据 ---

  // 常见 CSS 颜色名称（小写）到十六进制代码（小写）的映射
  // 不包括 Ink 直接支持的名称
  private static readonly cssNameToHexMap: Readonly<Record<string, string>> = {
    aliceblue: '#f0f8ff',
    antiquewhite: '#faebd7',
    aqua: '#00ffff',
    aquamarine: '#7fffd4',
    azure: '#f0ffff',
    beige: '#f5f5dc',
    bisque: '#ffe4c4',
    blanchedalmond: '#ffebcd',
    blueviolet: '#8a2be2',
    brown: '#a52a2a',
    burlywood: '#deb887',
    cadetblue: '#5f9ea0',
    chartreuse: '#7fff00',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    cornflowerblue: '#6495ed',
    cornsilk: '#fff8dc',
    crimson: '#dc143c',
    darkblue: '#00008b',
    darkcyan: '#008b8b',
    darkgoldenrod: '#b8860b',
    darkgray: '#a9a9a9',
    darkgrey: '#a9a9a9',
    darkgreen: '#006400',
    darkkhaki: '#bdb76b',
    darkmagenta: '#8b008b',
    darkolivegreen: '#556b2f',
    darkorange: '#ff8c00',
    darkorchid: '#9932cc',
    darkred: '#8b0000',
    darksalmon: '#e9967a',
    darkseagreen: '#8fbc8f',
    darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f',
    darkslategrey: '#2f4f4f',
    darkturquoise: '#00ced1',
    darkviolet: '#9400d3',
    deeppink: '#ff1493',
    deepskyblue: '#00bfff',
    dimgray: '#696969',
    dimgrey: '#696969',
    dodgerblue: '#1e90ff',
    firebrick: '#b22222',
    floralwhite: '#fffaf0',
    forestgreen: '#228b22',
    fuchsia: '#ff00ff',
    gainsboro: '#dcdcdc',
    ghostwhite: '#f8f8ff',
    gold: '#ffd700',
    goldenrod: '#daa520',
    greenyellow: '#adff2f',
    honeydew: '#f0fff0',
    hotpink: '#ff69b4',
    indianred: '#cd5c5c',
    indigo: '#4b0082',
    ivory: '#fffff0',
    khaki: '#f0e68c',
    lavender: '#e6e6fa',
    lavenderblush: '#fff0f5',
    lawngreen: '#7cfc00',
    lemonchiffon: '#fffacd',
    lightblue: '#add8e6',
    lightcoral: '#f08080',
    lightcyan: '#e0ffff',
    lightgoldenrodyellow: '#fafad2',
    lightgray: '#d3d3d3',
    lightgrey: '#d3d3d3',
    lightgreen: '#90ee90',
    lightpink: '#ffb6c1',
    lightsalmon: '#ffa07a',
    lightseagreen: '#20b2aa',
    lightskyblue: '#87cefa',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#b0c4de',
    lightyellow: '#ffffe0',
    lime: '#00ff00',
    limegreen: '#32cd32',
    linen: '#faf0e6',
    maroon: '#800000',
    mediumaquamarine: '#66cdaa',
    mediumblue: '#0000cd',
    mediumorchid: '#ba55d3',
    mediumpurple: '#9370db',
    mediumseagreen: '#3cb371',
    mediumslateblue: '#7b68ee',
    mediumspringgreen: '#00fa9a',
    mediumturquoise: '#48d1cc',
    mediumvioletred: '#c71585',
    midnightblue: '#191970',
    mintcream: '#f5fffa',
    mistyrose: '#ffe4e1',
    moccasin: '#ffe4b5',
    navajowhite: '#ffdead',
    navy: '#000080',
    oldlace: '#fdf5e6',
    olive: '#808000',
    olivedrab: '#6b8e23',
    orange: '#ffa500',
    orangered: '#ff4500',
    orchid: '#da70d6',
    palegoldenrod: '#eee8aa',
    palegreen: '#98fb98',
    paleturquoise: '#afeeee',
    palevioletred: '#db7093',
    papayawhip: '#ffefd5',
    peachpuff: '#ffdab9',
    peru: '#cd853f',
    pink: '#ffc0cb',
    plum: '#dda0dd',
    powderblue: '#b0e0e6',
    purple: '#800080',
    rebeccapurple: '#663399',
    rosybrown: '#bc8f8f',
    royalblue: '#4169e1',
    saddlebrown: '#8b4513',
    salmon: '#fa8072',
    sandybrown: '#f4a460',
    seagreen: '#2e8b57',
    seashell: '#fff5ee',
    sienna: '#a0522d',
    silver: '#c0c0c0',
    skyblue: '#87ceeb',
    slateblue: '#6a5acd',
    slategray: '#708090',
    slategrey: '#708090',
    snow: '#fffafa',
    springgreen: '#00ff7f',
    steelblue: '#4682b4',
    tan: '#d2b48c',
    teal: '#008080',
    thistle: '#d8bfd8',
    tomato: '#ff6347',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    wheat: '#f5deb3',
    whitesmoke: '#f5f5f5',
    yellowgreen: '#9acd32',
  };

  // 定义 Ink 的命名颜色集合，用于快速查找
  private static readonly inkSupportedNames = new Set([
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'cyan',
    'magenta',
    'white',
    'gray',
    'grey',
    'blackbright',
    'redbright',
    'greenbright',
    'yellowbright',
    'bluebright',
    'cyanbright',
    'magentabright',
    'whitebright',
  ]);

  /**
   * 创建一个新的 Theme 实例。
   * @param name 主题的名称。
   * @param rawMappings 来自 react-syntax-highlighter 主题对象的原始 CSSProperties 映射。
   */
  constructor(
    readonly name: string,
    readonly type: ThemeType,
    rawMappings: Record<string, CSSProperties>,
    readonly colors: ColorsTheme,
  ) {
    this._colorMap = Object.freeze(this._buildColorMap(rawMappings)); // 构建并冻结映射

    // 确定默认前景色
    const rawDefaultColor = rawMappings['hljs']?.color;
    this.defaultColor =
      (rawDefaultColor ? Theme._resolveColor(rawDefaultColor) : undefined) ??
      ''; // 如果未找到或无法解析，则默认为空字符串
  }

  /**
   * 获取给定 highlight.js 类名的与 Ink 兼容的颜色字符串。
   * @param hljsClass highlight.js 类名（例如 'hljs-keyword', 'hljs-string'）。
   * @returns 对应的 Ink 颜色字符串（十六进制或名称），如果存在的话。
   */
  getInkColor(hljsClass: string): string | undefined {
    return this._colorMap[hljsClass];
  }

  /**
   * 将 CSS 颜色值（名称或十六进制）解析为与 Ink 兼容的颜色字符串。
   * @param colorValue 原始颜色字符串（例如 'blue', '#ff0000', 'darkkhaki'）。
   * @returns 与 Ink 兼容的颜色字符串（十六进制或名称），如果无法解析则返回 undefined。
   */
  private static _resolveColor(colorValue: string): string | undefined {
    const lowerColor = colorValue.toLowerCase();

    // 1. 检查是否已经是十六进制代码
    if (lowerColor.startsWith('#')) {
      return lowerColor; // 直接使用十六进制
    }
    // 2. 检查是否是 Ink 支持的名称（小写）
    else if (Theme.inkSupportedNames.has(lowerColor)) {
      return lowerColor; // 直接使用 Ink 名称
    }
    // 3. 检查是否是我们可以映射到十六进制的已知 CSS 名称
    else if (Theme.cssNameToHexMap[lowerColor]) {
      return Theme.cssNameToHexMap[lowerColor]; // 使用映射的十六进制
    }

    // 4. 无法解析
    console.warn(
      `[Theme] 无法将颜色 "${colorValue}" 解析为与 Ink 兼容的格式。`,
    );
    return undefined;
  }

  /**
   * 构建从 highlight.js 类名到与 Ink 兼容的颜色字符串的内部映射。
   * 此方法是受保护的，主要供构造函数使用。
   * @param hljsTheme 来自 react-syntax-highlighter 主题对象的原始 CSSProperties 映射。
   * @returns 与 Ink 兼容的主题映射（Record<string, string>）。
   */
  protected _buildColorMap(
    hljsTheme: Record<string, CSSProperties>,
  ): Record<string, string> {
    const inkTheme: Record<string, string> = {};
    for (const key in hljsTheme) {
      // 确保键以 'hljs-' 开头或为 'hljs' 以表示基础样式
      if (!key.startsWith('hljs-') && key !== 'hljs') {
        continue; // 跳过与高亮类无关的键
      }

      const style = hljsTheme[key];
      if (style?.color) {
        const resolvedColor = Theme._resolveColor(style.color);
        if (resolvedColor !== undefined) {
          // 使用 hljsTheme 中的原始键（例如 'hljs-keyword'）
          inkTheme[key] = resolvedColor;
        }
        // 如果颜色无法解析，则从映射中省略，
        // 允许回退到默认前景色。
      }
      // 我们目前只关心用于 Ink 渲染的 'color' 属性。
      // 忽略其他属性如 background、fontStyle 等。
    }
    return inkTheme;
  }
}