/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '@iflytek/iflycode-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const EXTENSIONS_DIRECTORY_NAME = path.join('.iflycode', 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

export interface Extension {
  config: ExtensionConfig;
  contextFiles: string[];
}

export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

export function loadExtensions(workspaceDir: string): Extension[] {
  const allExtensions = [
    ...loadExtensionsFromDir(workspaceDir),
    ...loadExtensionsFromDir(os.homedir()),
  ];

  const uniqueExtensions = new Map<string, Extension>();
  for (const extension of allExtensions) {
    if (!uniqueExtensions.has(extension.config.name)) {
      console.log(
        `正在加载扩展: ${extension.config.name} (版本: ${extension.config.version})`,
      );
      uniqueExtensions.set(extension.config.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

function loadExtensionsFromDir(dir: string): Extension[] {
  const extensionsDir = path.join(dir, EXTENSIONS_DIRECTORY_NAME);
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: Extension[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    const extension = loadExtension(extensionDir);
    if (extension != null) {
      extensions.push(extension);
    }
  }
  return extensions;
}

function loadExtension(extensionDir: string): Extension | null {
  if (!fs.statSync(extensionDir).isDirectory()) {
    console.error(
      `警告: 扩展目录中存在异常文件 ${extensionDir}。`,
    );
    return null;
  }

  const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (!fs.existsSync(configFilePath)) {
    console.error(
      `警告: 扩展目录 ${extensionDir} 中未包含配置文件 ${configFilePath}。`,
    );
    return null;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = JSON.parse(configContent) as ExtensionConfig;
    if (!config.name || !config.version) {
      console.error(
        `扩展配置 ${configFilePath} 无效: 缺少名称或版本。`,
      );
      return null;
    }

    const contextFiles = getContextFileNames(config)
      .map((contextFileName) => path.join(extensionDir, contextFileName))
      .filter((contextFilePath) => fs.existsSync(contextFilePath));

    return {
      config,
      contextFiles,
    };
  } catch (e) {
    console.error(
      `警告: 解析扩展配置文件 ${configFilePath} 时出错: ${e}`,
    );
    return null;
  }
}

function getContextFileNames(config: ExtensionConfig): string[] {
  if (!config.contextFileName) {
    return ['IFLYCODE.md'];
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

export function filterActiveExtensions(
  extensions: Extension[],
  enabledExtensionNames: string[],
): Extension[] {
  if (enabledExtensionNames.length === 0) {
    return extensions;
  }

  const lowerCaseEnabledExtensions = new Set(
    enabledExtensionNames.map((e) => e.trim().toLowerCase()),
  );

  if (
    lowerCaseEnabledExtensions.size === 1 &&
    lowerCaseEnabledExtensions.has('none')
  ) {
    if (extensions.length > 0) {
      console.log('所有扩展已禁用。');
    }
    return [];
  }

  const activeExtensions: Extension[] = [];
  const notFoundNames = new Set(lowerCaseEnabledExtensions);

  for (const extension of extensions) {
    const lowerCaseName = extension.config.name.toLowerCase();
    if (lowerCaseEnabledExtensions.has(lowerCaseName)) {
      console.log(
        `已激活扩展: ${extension.config.name} (版本: ${extension.config.version})`,
      );
      activeExtensions.push(extension);
      notFoundNames.delete(lowerCaseName);
    } else {
      console.log(`已禁用扩展: ${extension.config.name}`);
    }
  }

  for (const requestedName of notFoundNames) {
    console.log(`未找到扩展: ${requestedName}`);
  }

  return activeExtensions;
}