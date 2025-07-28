/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AyuDark } from './ayu.js';
import { AyuLight } from './ayu-light.js';
import { AtomOneDark } from './atom-one-dark.js';
import { Dracula } from './dracula.js';
import { GitHubDark } from './github-dark.js';
import { GitHubLight } from './github-light.js';
import { GoogleCode } from './googlecode.js';
import { DefaultLight } from './default-light.js';
import { DefaultDark } from './default.js';
import { ShadesOfPurple } from './shades-of-purple.js';
import { XCode } from './xcode.js';
import { iFlyCodeLight } from './iflycode-light.js';
import { iFlyCodeDark } from './iflycode-dark.js';
import { Theme, ThemeType } from './theme.js';
import { ANSI } from './ansi.js';
import { ANSILight } from './ansi-light.js';
import { NoColorTheme } from './no-color.js';
import process from 'node:process';

export interface ThemeDisplay {
  name: string;
  type: ThemeType;
}

export const DEFAULT_THEME: Theme = iFlyCodeDark;

class ThemeManager {
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;

  constructor() {
    this.availableThemes = [
      AyuDark,
      AyuLight,
      AtomOneDark,
      Dracula,
      DefaultLight,
      DefaultDark,
      GitHubDark,
      GitHubLight,
      GoogleCode,
      iFlyCodeLight,
      iFlyCodeDark,
      ShadesOfPurple,
      XCode,
      ANSI,
      ANSILight,
    ];
    this.activeTheme = DEFAULT_THEME;
  }

  /**
   * 返回可用主题名称列表。
   */
  getAvailableThemes(): ThemeDisplay[] {
    // 分离 iFlyCode 主题
    const iflycodeThemes = this.availableThemes.filter(
      (theme) => theme.name === iFlyCodeLight.name || theme.name === iFlyCodeDark.name,
    );
    const otherThemes = this.availableThemes.filter(
      (theme) => theme.name !== iFlyCodeLight.name && theme.name !== iFlyCodeDark.name,
    );

    // 按类型和名称对其他主题进行排序
    const sortedOtherThemes = otherThemes.sort((a, b) => {
      const typeOrder = (type: ThemeType): number => {
        switch (type) {
          case 'dark':
            return 1;
          case 'light':
            return 2;
          default:
            return 3;
        }
      };

      const typeComparison = typeOrder(a.type) - typeOrder(b.type);
      if (typeComparison !== 0) {
        return typeComparison;
      }
      return a.name.localeCompare(b.name);
    });

    // 将 iFlyCode 主题放在前面，然后是排序后的其他主题
    const sortedThemes = [...iflycodeThemes, ...sortedOtherThemes];

    return sortedThemes.map((theme) => ({
      name: theme.name,
      type: theme.type,
    }));
  }

  /**
   * 设置活动主题。
   * @param themeName 要激活的主题名称。
   * @returns 如果主题设置成功则返回 true，否则返回 false。
   */
  setActiveTheme(themeName: string | undefined): boolean {
    const foundTheme = this.findThemeByName(themeName);

    if (foundTheme) {
      this.activeTheme = foundTheme;
      return true;
    } else {
      // 如果 themeName 为 undefined，表示我们想要设置默认主题。
      // 如果 findThemeByName 返回 undefined（例如由于某种原因默认主题也未找到）
      // 那么这将返回 false。
      if (themeName === undefined) {
        this.activeTheme = DEFAULT_THEME;
        return true;
      }
      return false;
    }
  }

  findThemeByName(themeName: string | undefined): Theme | undefined {
    if (!themeName) {
      return DEFAULT_THEME;
    }
    return this.availableThemes.find((theme) => theme.name === themeName);
  }

  /**
   * 返回当前活动的主题对象。
   */
  getActiveTheme(): Theme {
    if (process.env.NO_COLOR) {
      return NoColorTheme;
    }
    return this.activeTheme;
  }
}

// 导出 ThemeManager 的实例
export const themeManager = new ThemeManager();