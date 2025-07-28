/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-node';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import {
  ConsoleMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Config } from '../config/config.js';
import { SERVICE_NAME } from './constants.js';
import { initializeMetrics } from './metrics.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';

// 用于故障排除，请将日志级别设置为 DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

let sdk: NodeSDK | undefined;
let telemetryInitialized = false;

export function isTelemetrySdkInitialized(): boolean {
  return telemetryInitialized;
}

function parseGrpcEndpoint(
  otlpEndpointSetting: string | undefined,
): string | undefined {
  if (!otlpEndpointSetting) {
    return undefined;
  }
  // 去除可能来自环境变量的前导/尾随引号
  const trimmedEndpoint = otlpEndpointSetting.replace(/^["']|["']$/g, '');

  try {
    const url = new URL(trimmedEndpoint);
    // OTLP gRPC 导出器期望的端点格式为 scheme://host:port
    // `origin` 属性提供此格式，去除任何路径、查询或哈希。
    return url.origin;
  } catch (error) {
    diag.error('提供的 OTLP 端点 URL 无效:', trimmedEndpoint, error);
    return undefined;
  }
}

export function initializeTelemetry(config: Config): void {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
    return;
  }

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.version,
    'session.id': config.getSessionId(),
  });

  const otlpEndpoint = config.getTelemetryOtlpEndpoint();
  const grpcParsedEndpoint = parseGrpcEndpoint(otlpEndpoint);
  const useOtlp = !!grpcParsedEndpoint;

  const spanExporter = useOtlp
    ? new OTLPTraceExporter({
        url: grpcParsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      })
    : new ConsoleSpanExporter();
  const logExporter = useOtlp
    ? new OTLPLogExporter({
        url: grpcParsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      })
    : new ConsoleLogRecordExporter();
  const metricReader = useOtlp
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: grpcParsedEndpoint,
          compression: CompressionAlgorithm.GZIP,
        }),
        exportIntervalMillis: 10000,
      })
    : new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: 10000,
      });

  sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(spanExporter)],
    logRecordProcessor: new BatchLogRecordProcessor(logExporter),
    metricReader,
    instrumentations: [new HttpInstrumentation()],
  });

  try {
    sdk.start();
    console.log('OpenTelemetry SDK 启动成功。');
    telemetryInitialized = true;
    initializeMetrics(config);
  } catch (error) {
    console.error('启动 OpenTelemetry SDK 时出错:', error);
  }

  process.on('SIGTERM', shutdownTelemetry);
  process.on('SIGINT', shutdownTelemetry);
}

export async function shutdownTelemetry(): Promise<void> {
  if (!telemetryInitialized || !sdk) {
    return;
  }
  try {
    ClearcutLogger.getInstance()?.shutdown();
    await sdk.shutdown();
    console.log('OpenTelemetry SDK 关闭成功。');
  } catch (error) {
    console.error('关闭 SDK 时出错:', error);
  } finally {
    telemetryInitialized = false;
  }
}