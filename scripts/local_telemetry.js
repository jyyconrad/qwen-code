#!/usr/bin/env node

/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  BIN_DIR,
  OTEL_DIR,
  ensureBinary,
  fileExists,
  manageTelemetrySettings,
  registerCleanup,
  waitForPort,
} from './telemetry_utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OTEL_CONFIG_FILE = path.join(OTEL_DIR, 'collector-local.yaml');
const OTEL_LOG_FILE = path.join(OTEL_DIR, 'collector.log');
const JAEGER_LOG_FILE = path.join(OTEL_DIR, 'jaeger.log');
const JAEGER_PORT = 16686;

// 此配置用于主 otelcol-contrib 实例。
// 它从 CLI 接收端口 4317 上的数据，将追踪导出到端口 14317 上的 Jaeger，
// 并将指标/日志发送到调试日志。
const OTEL_CONFIG_CONTENT = `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "localhost:4317"
processors:
  batch:
    timeout: 1s
exporters:
  otlp:
    endpoint: "localhost:14317"
    tls:
      insecure: true
  debug:
    verbosity: detailed
service:
  telemetry:
    logs:
      level: "debug"
    metrics:
      level: "none"
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
`;

async function main() {
  // 1. 确保二进制文件可用，必要时进行下载。
  // 二进制文件存储在项目的 .iflycode/otel/bin 目录中
  // 以避免修改用户的系统。
  if (!fileExists(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  const otelcolPath = await ensureBinary(
    'otelcol-contrib',
    'open-telemetry/opentelemetry-collector-releases',
    (version, platform, arch, ext) =>
      `otelcol-contrib_${version}_${platform}_${arch}.${ext}`,
    'otelcol-contrib',
    false, // isJaeger = false
  ).catch((e) => {
    console.error(`🛑 获取 otelcol-contrib 时出错: ${e.message}`);
    return null;
  });
  if (!otelcolPath) process.exit(1);

  const jaegerPath = await ensureBinary(
    'jaeger',
    'jaegertracing/jaeger',
    (version, platform, arch, ext) =>
      `jaeger-${version}-${platform}-${arch}.${ext}`,
    'jaeger',
    true, // isJaeger = true
  ).catch((e) => {
    console.error(`🛑 获取 jaeger 时出错: ${e.message}`);
    return null;
  });
  if (!jaegerPath) process.exit(1);

  // 2. 终止任何现有进程以确保干净启动。
  console.log('🧹 清理旧进程和日志...');
  try {
    execSync('pkill -f "otelcol-contrib"');
    console.log('✅ 已停止现有的 otelcol-contrib 进程。');
  } catch (_e) {} // eslint-disable-line no-empty
  try {
    execSync('pkill -f "jaeger"');
    console.log('✅ 已停止现有的 jaeger 进程。');
  } catch (_e) {} // eslint-disable-line no-empty
  try {
    if (fileExists(OTEL_LOG_FILE)) fs.unlinkSync(OTEL_LOG_FILE);
    console.log('✅ 已删除旧的 collector 日志。');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }
  try {
    if (fileExists(JAEGER_LOG_FILE)) fs.unlinkSync(JAEGER_LOG_FILE);
    console.log('✅ 已删除旧的 jaeger 日志。');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }

  let jaegerProcess, collectorProcess;
  let jaegerLogFd, collectorLogFd;

  const originalSandboxSetting = manageTelemetrySettings(
    true,
    'http://localhost:4317',
    'local',
  );

  registerCleanup(
    () => [jaegerProcess, collectorProcess],
    () => [jaegerLogFd, collectorLogFd],
    originalSandboxSetting,
  );

  if (!fileExists(OTEL_DIR)) fs.mkdirSync(OTEL_DIR, { recursive: true });
  fs.writeFileSync(OTEL_CONFIG_FILE, OTEL_CONFIG_CONTENT);
  console.log('📄 已写入 OTEL collector 配置。');

  // 启动 Jaeger
  console.log(`🚀 正在启动 Jaeger 服务... 日志: ${JAEGER_LOG_FILE}`);
  jaegerLogFd = fs.openSync(JAEGER_LOG_FILE, 'a');
  jaegerProcess = spawn(
    jaegerPath,
    ['--set=receivers.otlp.protocols.grpc.endpoint=localhost:14317'],
    { stdio: ['ignore', jaegerLogFd, jaegerLogFd] },
  );
  console.log(`⏳ 等待 Jaeger 启动 (PID: ${jaegerProcess.pid})...`);

  try {
    await waitForPort(JAEGER_PORT);
    console.log(`✅ Jaeger 启动成功。`);
  } catch (_) {
    console.error(`🛑 错误: Jaeger 未能在端口 ${JAEGER_PORT} 上启动。`);
    if (jaegerProcess && jaegerProcess.pid) {
      process.kill(jaegerProcess.pid, 'SIGKILL');
    }
    if (fileExists(JAEGER_LOG_FILE)) {
      console.error('📄 Jaeger 日志输出:');
      console.error(fs.readFileSync(JAEGER_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  // 启动主 OTEL collector
  console.log(`🚀 正在启动 OTEL collector... 日志: ${OTEL_LOG_FILE}`);
  collectorLogFd = fs.openSync(OTEL_LOG_FILE, 'a');
  collectorProcess = spawn(otelcolPath, ['--config', OTEL_CONFIG_FILE], {
    stdio: ['ignore', collectorLogFd, collectorLogFd],
  });
  console.log(
    `⏳ 等待 OTEL collector 启动 (PID: ${collectorProcess.pid})...`,
  );

  try {
    await waitForPort(4317);
    console.log(`✅ OTEL collector 启动成功。`);
  } catch (_) {
    console.error(`🛑 错误: OTEL collector 未能在端口 4317 上启动。`);
    if (collectorProcess && collectorProcess.pid) {
      process.kill(collectorProcess.pid, 'SIGKILL');
    }
    if (fileExists(OTEL_LOG_FILE)) {
      console.error('📄 OTEL Collector 日志输出:');
      console.error(fs.readFileSync(OTEL_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  [jaegerProcess, collectorProcess].forEach((proc) => {
    if (proc) {
      proc.on('error', (err) => {
        console.error(`${proc.spawnargs[0]} 进程错误:`, err);
        process.exit(1);
      });
    }
  });

  console.log(`
✨ 本地遥测环境正在运行。`);
  console.log(
    `
🔎 在 Jaeger UI 中查看追踪: http://localhost:${JAEGER_PORT}`,
  );
  console.log(`📊 在日志和指标中查看指标: ${OTEL_LOG_FILE}`);
  console.log(
    `
📄 在另一个终端中查看日志和指标: tail -f ${OTEL_LOG_FILE}`,
  );
  console.log(`
按 Ctrl+C 退出。`);
}

main();