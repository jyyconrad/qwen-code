/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GaxiosError } from 'gaxios';
import { useState, useEffect, useCallback } from 'react';
import {
  Config,
  CodeAssistServer,
  UserTierId,
} from '@iflytek/iflycode-core';

export interface PrivacyState {
  isLoading: boolean;
  error?: string;
  isFreeTier?: boolean;
  dataCollectionOptIn?: boolean;
}

export const usePrivacySettings = (config: Config) => {
  const [privacyState, setPrivacyState] = useState<PrivacyState>({
    isLoading: true,
  });

  useEffect(() => {
    const fetchInitialState = async () => {
      setPrivacyState({
        isLoading: true,
      });
      try {
        const server = getCodeAssistServer(config);
        const tier = await getTier(server);
        if (tier !== UserTierId.FREE) {
          // 我们无需获取退出信息，因为非免费层级的数据收集已通过其他方式解决。
          setPrivacyState({
            isLoading: false,
            isFreeTier: false,
          });
          return;
        }

        const optIn = await getRemoteDataCollectionOptIn(server);
        setPrivacyState({
          isLoading: false,
          isFreeTier: true,
          dataCollectionOptIn: optIn,
        });
      } catch (e) {
        setPrivacyState({
          isLoading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };
    fetchInitialState();
  }, [config]);

  const updateDataCollectionOptIn = useCallback(
    async (optIn: boolean) => {
      try {
        const server = getCodeAssistServer(config);
        const updatedOptIn = await setRemoteDataCollectionOptIn(server, optIn);
        setPrivacyState({
          isLoading: false,
          isFreeTier: true,
          dataCollectionOptIn: updatedOptIn,
        });
      } catch (e) {
        setPrivacyState({
          isLoading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [config],
  );

  return {
    privacyState,
    updateDataCollectionOptIn,
  };
};

function getCodeAssistServer(config: Config): CodeAssistServer {
  const server = config.getGeminiClient().getContentGenerator();
  // 这两种情况都不应该发生。
  if (!(server instanceof CodeAssistServer)) {
    throw new Error('未使用 OAuth');
  } else if (!server.projectId) {
    throw new Error('未使用 OAuth');
  }
  return server;
}

async function getTier(server: CodeAssistServer): Promise<UserTierId> {
  const loadRes = await server.loadCodeAssist({
    cloudaicompanionProject: server.projectId,
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
      duetProject: server.projectId,
    },
  });
  if (!loadRes.currentTier) {
    throw new Error('用户没有当前层级');
  }
  return loadRes.currentTier.id;
}

async function getRemoteDataCollectionOptIn(
  server: CodeAssistServer,
): Promise<boolean> {
  try {
    const resp = await server.getCodeAssistGlobalUserSetting();
    return resp.freeTierDataCollectionOptin;
  } catch (e) {
    if (e instanceof GaxiosError) {
      if (e.response?.status === 404) {
        return true;
      }
    }
    throw e;
  }
}

async function setRemoteDataCollectionOptIn(
  server: CodeAssistServer,
  optIn: boolean,
): Promise<boolean> {
  const resp = await server.setCodeAssistGlobalUserSetting({
    cloudaicompanionProject: server.projectId,
    freeTierDataCollectionOptin: optIn,
  });
  return resp.freeTierDataCollectionOptin;
}