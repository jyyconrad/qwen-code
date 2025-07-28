/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Colors } from '../colors.js';
import { formatDuration } from '../utils/formatters.js';
import { useSessionStats, ModelMetrics } from '../contexts/SessionContext.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';

// 更灵活且功能强大的 StatRow 组件
interface StatRowProps {
  title: string;
  children: React.ReactNode; // 使用 children 来允许复杂的、带颜色的值
}

const StatRow: React.FC<StatRowProps> = ({ title, children }) => (
  <Box>
    {/* 固定标签宽度，为对齐创建清晰的“装订线” */}
    <Box width={28}>
      <Text color={Colors.LightBlue}>{title}</Text>
    </Box>
    {children}
  </Box>
);

// 用于缩进的次级信息 SubStatRow
interface SubStatRowProps {
  title: string;
  children: React.ReactNode;
}

const SubStatRow: React.FC<SubStatRowProps> = ({ title, children }) => (
  <Box paddingLeft={2}>
    {/* 为 "» " 前缀调整宽度 */}
    <Box width={26}>
      <Text>» {title}</Text>
    </Box>
    {children}
  </Box>
);

// 用于分组相关统计信息的 Section 组件
interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column" width="100%" marginBottom={1}>
    <Text bold>{title}</Text>
    {children}
  </Box>
);

const ModelUsageTable: React.FC<{
  models: Record<string, ModelMetrics>;
  totalCachedTokens: number;
  cacheEfficiency: number;
}> = ({ models, totalCachedTokens, cacheEfficiency }) => {
  const nameWidth = 25;
  const requestsWidth = 8;
  const inputTokensWidth = 15;
  const outputTokensWidth = 15;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* 表头 */}
      <Box>
        <Box width={nameWidth}>
          <Text bold>模型使用情况</Text>
        </Box>
        <Box width={requestsWidth} justifyContent="flex-end">
          <Text bold>请求数</Text>
        </Box>
        <Box width={inputTokensWidth} justifyContent="flex-end">
          <Text bold>输入 Token</Text>
        </Box>
        <Box width={outputTokensWidth} justifyContent="flex-end">
          <Text bold>输出 Token</Text>
        </Box>
      </Box>
      {/* 分隔线 */}
      <Box
        borderStyle="round"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width={nameWidth + requestsWidth + inputTokensWidth + outputTokensWidth}
      ></Box>

      {/* 数据行 */}
      {Object.entries(models).map(([name, modelMetrics]) => (
        <Box key={name}>
          <Box width={nameWidth}>
            <Text>{name.replace('-001', '')}</Text>
          </Box>
          <Box width={requestsWidth} justifyContent="flex-end">
            <Text>{modelMetrics.api.totalRequests}</Text>
          </Box>
          <Box width={inputTokensWidth} justifyContent="flex-end">
            <Text color={Colors.AccentYellow}>
              {modelMetrics.tokens.prompt.toLocaleString()}
            </Text>
          </Box>
          <Box width={outputTokensWidth} justifyContent="flex-end">
            <Text color={Colors.AccentYellow}>
              {modelMetrics.tokens.candidates.toLocaleString()}
            </Text>
          </Box>
        </Box>
      ))}
      {cacheEfficiency > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={Colors.AccentGreen}>节省亮点：</Text>{' '}
            {totalCachedTokens.toLocaleString()} ({cacheEfficiency.toFixed(1)}
            %) 的输入 token 来自缓存，降低了成本。
          </Text>
          <Box height={1} />
          <Text color={Colors.Gray}>
            » 提示：要查看完整的 token 明细，请运行 `/stats model`。
          </Text>
        </Box>
      )}
    </Box>
  );
};

interface StatsDisplayProps {
  duration: string;
  title?: string;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  title,
}) => {
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const { models, tools } = metrics;
  const computed = computeSessionStats(metrics);

  const successThresholds = {
    green: TOOL_SUCCESS_RATE_HIGH,
    yellow: TOOL_SUCCESS_RATE_MEDIUM,
  };
  const agreementThresholds = {
    green: USER_AGREEMENT_RATE_HIGH,
    yellow: USER_AGREEMENT_RATE_MEDIUM,
  };
  const successColor = getStatusColor(computed.successRate, successThresholds);
  const agreementColor = getStatusColor(
    computed.agreementRate,
    agreementThresholds,
  );

  const renderTitle = () => {
    if (title) {
      return Colors.GradientColors && Colors.GradientColors.length > 0 ? (
        <Gradient colors={Colors.GradientColors}>
          <Text bold>{title}</Text>
        </Gradient>
      ) : (
        <Text bold color={Colors.AccentPurple}>
          {title}
        </Text>
      );
    }
    return (
      <Text bold color={Colors.AccentPurple}>
        会话统计
      </Text>
    );
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      {renderTitle()}
      <Box height={1} />

      {tools.totalCalls > 0 && (
        <Section title="交互摘要">
          <StatRow title="工具调用：">
            <Text>
              {tools.totalCalls} ({' '}
              <Text color={Colors.AccentGreen}>✔ {tools.totalSuccess}</Text>{' '}
              <Text color={Colors.AccentRed}>✖ {tools.totalFail}</Text> )
            </Text>
          </StatRow>
          <StatRow title="成功率：">
            <Text color={successColor}>{computed.successRate.toFixed(1)}%</Text>
          </StatRow>
          {computed.totalDecisions > 0 && (
            <StatRow title="用户同意率：">
              <Text color={agreementColor}>
                {computed.agreementRate.toFixed(1)}%{' '}
                <Text color={Colors.Gray}>
                  ({computed.totalDecisions} 已审核)
                </Text>
              </Text>
            </StatRow>
          )}
        </Section>
      )}

      <Section title="性能">
        <StatRow title="总耗时：">
          <Text>{duration}</Text>
        </StatRow>
        <StatRow title="代理活跃时间：">
          <Text>{formatDuration(computed.agentActiveTime)}</Text>
        </StatRow>
        <SubStatRow title="API 时间：">
          <Text>
            {formatDuration(computed.totalApiTime)}{' '}
            <Text color={Colors.Gray}>
              ({computed.apiTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
        <SubStatRow title="工具时间：">
          <Text>
            {formatDuration(computed.totalToolTime)}{' '}
            <Text color={Colors.Gray}>
              ({computed.toolTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
      </Section>

      {Object.keys(models).length > 0 && (
        <ModelUsageTable
          models={models}
          totalCachedTokens={computed.totalCachedTokens}
          cacheEfficiency={computed.cacheEfficiency}
        />
      )}
    </Box>
  );
};