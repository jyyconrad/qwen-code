/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  shortenPath,
  tildeifyPath,
  tokenLimit,
} from '@iflytek/iflycode-core';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';
import process from 'node:process';
import Gradient from 'ink-gradient';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';
import { SessionStatsState } from '../contexts/SessionContext.js';

interface FooterProps {
  model: string;
  targetDir: string;
  branchName?: string;
  debugMode: boolean;
  debugMessage: string;
  corgiMode: boolean;
  errorCount: number;
  showErrorDetails: boolean;
  showMemoryUsage?: boolean;
  promptTokenCount: number;
  sessionStats: SessionStatsState;
  nightly: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  model,
  targetDir,
  branchName,
  debugMode,
  debugMessage,
  corgiMode,
  errorCount,
  showErrorDetails,
  showMemoryUsage,
  promptTokenCount,
  nightly,
  sessionStats
}) => {
  const limit = tokenLimit(model);
  const percentage = promptTokenCount / limit;
  const needLimit = model.indexOf("gemini") > -1;
  const totalUsed = sessionStats?.metrics?.models[model]?.tokens.total || 0;
  const formatFriendlyNumber = (num: number): string => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + '千';
    } else {
      return num.toString();
    }
  }

  return (
    <Box marginTop={1} justifyContent="space-between" width="100%">
      <Box marginRight={3}>
        {nightly ? (
          <Gradient colors={Colors.GradientColors}>
            <Text>
              {shortenPath(tildeifyPath(targetDir), 70)}
              {branchName && <Text> ({branchName}*)</Text>}
            </Text>
          </Gradient>
        ) : (
          <Text color={Colors.LightBlue}>
            {shortenPath(tildeifyPath(targetDir), 70)}
            {branchName && <Text color={Colors.Gray}> ({branchName}*)</Text>}
          </Text>
        )}
        <Text color={Colors.AccentPurple}>
          {' ' + (debugMessage || '--debug')}
        </Text>
      </Box>

      {/* 中间部分：居中的沙箱信息 */}
      <Box
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        display="flex"
        marginRight={3}
      >
        {process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec' ? (
          <Text color="green">
            {process.env.SANDBOX.replace(/^gemini-(?:cli-)?/, '')}
          </Text>
        ) : process.env.SANDBOX === 'sandbox-exec' ? (
          <Text color={Colors.AccentYellow}>
            MacOS Seatbelt{' '}
            <Text color={Colors.Gray}>({process.env.SEATBELT_PROFILE})</Text>
          </Text>
        ) : (
          <Text color={Colors.AccentRed}>
            无沙箱 <Text color={Colors.Gray}>(参见 /docs)</Text>
          </Text>
        )}
      </Box>

      {/* 右侧部分：Gemini 标签和控制台摘要 */}
      <Box flexGrow={1}
        alignItems="center"
        justifyContent="center"
        display="flex" >
        <Text color={Colors.AccentBlue}>
          <Text>{model}{' '}</Text>
          {needLimit && (
            <Text color={Colors.Gray}>
              {'剩余'}{((1 - percentage) * 100).toFixed(0)}{'%上下文 '}
            
          </Text>)}
          <Text color={Colors.Gray}>
            (已使用 {formatFriendlyNumber(totalUsed)} 上下文)
          </Text>
        </Text>
        {corgiMode && (
          <Text>
            <Text color={Colors.Gray}>| </Text>
            <Text color={Colors.AccentRed}>▼</Text>
            <Text color={Colors.Foreground}>(´</Text>
            <Text color={Colors.AccentRed}>ᴥ</Text>
            <Text color={Colors.Foreground}>`)</Text>
            <Text color={Colors.AccentRed}>▼ </Text>
          </Text>
        )}
        {!showErrorDetails && errorCount > 0 && (
          <Box>
            <Text color={Colors.Gray}>| </Text>
            <ConsoleSummaryDisplay errorCount={errorCount} />
          </Box>
        )}
        {showMemoryUsage && <MemoryUsageDisplay />}
      </Box>
    </Box>
  );
};