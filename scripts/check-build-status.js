/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os'; // 导入 os 模块

// --- 配置 ---
const cliPackageDir = path.resolve('packages', 'cli'); // CLI 包的基础目录
const buildTimestampPath = path.join(cliPackageDir, 'dist', '.last_build'); // CLI 包中时间戳文件的路径
const sourceDirs = [path.join(cliPackageDir, 'src')]; // CLI 包中的源代码目录
const filesToWatch = [
  path.join(cliPackageDir, 'package.json'),
  path.join(cliPackageDir, 'tsconfig.json'),
]; // CLI 包中的特定文件
const buildDir = path.join(cliPackageDir, 'dist'); // CLI 包中的构建输出目录
const warningsFilePath = path.join(os.tmpdir(), 'gemini-cli-warnings.txt'); // 警告信息的临时文件
// ---------------------

function getMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs; // 使用 mtimeMs 以获得更高精度
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // 文件不存在
    }
    console.error(`获取 ${filePath} 状态时出错:`, err);
    process.exit(1); // 获取状态时出现意外错误则退出
  }
}

function findSourceFiles(dir, allFiles = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    // 简单检查以避免递归进入 node_modules 或构建目录本身
    if (
      entry.isDirectory() &&
      entry.name !== 'node_modules' &&
      fullPath !== buildDir
    ) {
      findSourceFiles(fullPath, allFiles);
    } else if (entry.isFile()) {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

console.log('正在检查构建状态...');

// 检查前清理旧的警告文件
try {
  if (fs.existsSync(warningsFilePath)) {
    fs.unlinkSync(warningsFilePath);
  }
} catch (err) {
  console.warn(
    `[检查脚本] 警告: 无法删除之前的警告文件: ${err.message}`,
  );
}

const buildMtime = getMtime(buildTimestampPath);
if (!buildMtime) {
  // 如果构建缺失，将其作为警告写入并退出(0)，以便应用程序可以显示它
  const errorMessage = `错误: 未找到构建时间戳文件 (${path.relative(process.cwd(), buildTimestampPath)})。请先运行 \`npm run build\`。`;
  console.error(errorMessage); // 仍在此处记录错误
  try {
    fs.writeFileSync(warningsFilePath, errorMessage);
  } catch (writeErr) {
    console.error(
      `[检查脚本] 写入缺失构建警告文件时出错: ${writeErr.message}`,
    );
  }
  process.exit(0); // 允许应用程序启动并显示错误
}

let newerSourceFileFound = false;
const warningMessages = []; // 在此处收集警告
const allSourceFiles = [];

// 从指定目录收集文件
sourceDirs.forEach((dir) => {
  const dirPath = path.resolve(dir);
  if (fs.existsSync(dirPath)) {
    findSourceFiles(dirPath, allSourceFiles);
  } else {
    console.warn(`警告: 未找到源代码目录 "${dir}"。`);
  }
});

// 添加特定文件
filesToWatch.forEach((file) => {
  const filePath = path.resolve(file);
  if (fs.existsSync(filePath)) {
    allSourceFiles.push(filePath);
  } else {
    console.warn(`警告: 未找到监视的文件 "${file}"。`);
  }
});

// 检查修改时间
for (const file of allSourceFiles) {
  const sourceMtime = getMtime(file);
  const relativePath = path.relative(process.cwd(), file);
  const isNewer = sourceMtime && sourceMtime > buildMtime;

  if (isNewer) {
    const warning = `警告: 源文件 "${relativePath}" 在上次构建后已被修改。`;
    console.warn(warning); // 保留控制台警告以便脚本调试
    warningMessages.push(warning);
    newerSourceFileFound = true;
    // break; // 取消注释以在找到第一个较新的文件后停止检查
  }
}

if (newerSourceFileFound) {
  const finalWarning =
    '\n请运行 "npm run build" 以在启动前包含更改。';
  warningMessages.push(finalWarning);
  console.warn(finalWarning);

  // 将警告写入临时文件
  try {
    fs.writeFileSync(warningsFilePath, warningMessages.join('\n'));
    // 移除了调试日志
  } catch (err) {
    console.error(`[检查脚本] 写入警告文件时出错: ${err.message}`);
    // 即使无法写入也继续执行，应用程序将不会显示警告
  }
} else {
  console.log('构建已是最新。');
  // 如果构建正常，确保没有过期的警告文件存在
  try {
    if (fs.existsSync(warningsFilePath)) {
      fs.unlinkSync(warningsFilePath);
    }
  } catch (err) {
    console.warn(
      `[检查脚本] 警告: 无法删除之前的警告文件: ${err.message}`,
    );
  }
}

process.exit(0); // 始终成功退出以便应用程序启动