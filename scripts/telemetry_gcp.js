#!/usr/bin/env node

/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import {
  OTEL_DIR,
  BIN_DIR,
  fileExists,
  waitForPort,
  ensureBinary,
  manageTelemetrySettings,
  registerCleanup,
} from './telemetry_utils.js';

const OTEL_CONFIG_FILE = path.join(OTEL_DIR, 'collector-gcp.yaml');
const OTEL_LOG_FILE = path.join(OTEL_DIR, 'collector-gcp.log');

const getOtelConfigContent = (projectId) => `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "localhost:4317"
processors:
  batch:
    timeout: 1s
exporters:
  googlecloud:
    project: "${projectId}"
    metric:
      prefix: "custom.googleapis.com/gemini_cli"
    log:
      default_log_name: "gemini_cli"
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
      exporters: [googlecloud]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [googlecloud, debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [googlecloud, debug]
`;

async function main() {
  console.log('✨ 正在启动 Google Cloud 的本地遥测导出器 ✨');

  let collectorProcess;
  let collectorLogFd;

  const originalSandboxSetting = manageTelemetrySettings(
    true,
    'http://localhost:4317',
    'gcp',
  );
  registerCleanup(
    () => [collectorProcess].filter((p) => p), // 获取进程的函数
    () => [collectorLogFd].filter((fd) => fd), // 获取文件描述符的函数
    originalSandboxSetting,
  );

  const projectId = process.env.OTLP_GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error(
      '🛑 错误：未导出 OTLP_GOOGLE_CLOUD_PROJECT 环境变量。',
    );
    console.log(
      '   请将其设置为您的 Google Cloud 项目 ID 并重试。',
    );
    console.log('   `export OTLP_GOOGLE_CLOUD_PROJECT=your-project-id`');
    process.exit(1);
  }
  console.log(`✅ 使用 OTLP Google Cloud 项目 ID: ${projectId}`);

  console.log('\n🔑 请确保您已通过 Google Cloud 身份验证：');
  console.log(
    '  - 运行 `gcloud auth application-default login` 或确保 `GOOGLE_APPLICATION_CREDENTIALS` 环境变量指向有效的服务账户密钥。',
  );
  console.log(
    '  - 该账户需要 "Cloud Trace Agent"、"Monitoring Metric Writer" 和 "Logs Writer" 角色。',
  );

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

  console.log('🧹 正在清理旧进程和日志...');
  try {
    execSync('pkill -f "otelcol-contrib"');
    console.log('✅ 已停止现有的 otelcol-contrib 进程。');
  } catch (_e) {
    /* 无操作 */
  }
  try {
    fs.unlinkSync(OTEL_LOG_FILE);
    console.log('✅ 已删除旧的 GCP 收集器日志。');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }

  if (!fileExists(OTEL_DIR)) fs.mkdirSync(OTEL_DIR, { recursive: true });
  fs.writeFileSync(OTEL_CONFIG_FILE, getOtelConfigContent(projectId));
  console.log(`📄 已将 OTEL 收集器配置写入 ${OTEL_CONFIG_FILE}`);

  console.log(`🚀 正在启动 GCP 的 OTEL 收集器... 日志: ${OTEL_LOG_FILE}`);
  collectorLogFd = fs.openSync(OTEL_LOG_FILE, 'a');
  collectorProcess = spawn(otelcolPath, ['--config', OTEL_CONFIG_FILE], {
    stdio: ['ignore', collectorLogFd, collectorLogFd],
    env: { ...process.env },
  });

  console.log(
    `⏳ 正在等待 OTEL 收集器启动 (PID: ${collectorProcess.pid})...`,
  );

  try {
    await waitForPort(4317);
    console.log(`✅ OTEL 收集器已在端口 4317 上成功启动。`);
  } catch (err) {
    console.error(`🛑 错误：OTEL 收集器无法在端口 4317 上启动。`);
    console.error(err.message);
    if (collectorProcess && collectorProcess.pid) {
      process.kill(collectorProcess.pid, 'SIGKILL');
    }
    if (fileExists(OTEL_LOG_FILE)) {
      console.error('📄 OTEL 收集器日志输出：');
      console.error(fs.readFileSync(OTEL_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  collectorProcess.on('error', (err) => {
    console.error(`${collectorProcess.spawnargs[0]} 进程错误：`, err);
    process.exit(1);
  });

  console.log(`\n✨ GCP 的本地 OTEL 收集器正在运行。`);
  console.log(
    '\n🚀 要发送遥测数据，请在单独的终端窗口中运行 Gemini CLI。',
  );
  console.log(`\n📄 收集器日志正在写入：${OTEL_LOG_FILE}`);
  console.log(
    `📄 在另一个终端中查看收集器日志：tail -f ${OTEL_LOG_FILE}`,
  );
  console.log(`\n📊 在 Google Cloud Console 中查看您的遥测数据：`);
  console.log(
    `   - 日志: https://console.cloud.google.com/logs/query;query=logName%3D%22projects%2F${projectId}%2Flogs%2Fgemini_cli%22?project=${projectId}`,
  );
  console.log(
    `   - 指标: https://console.cloud.google.com/monitoring/metrics-explorer?project=${projectId}`,
  );
  console.log(
    `   - 跟踪: https://console.cloud.google.com/traces/list?project=${projectId}`,
  );
  console.log(`\n按 Ctrl+C 退出。`);
}

main();