/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ClientMetadata,
  GeminiUserTier,
  LoadCodeAssistResponse,
  OnboardUserRequest,
  UserTierId,
} from './types.js';
import { CodeAssistServer } from './server.js';
import { OAuth2Client } from 'google-auth-library';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      '此账户需要设置 GOOGLE_CLOUD_PROJECT 环境变量。请参阅 https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
  }
}

/**
 *
 * @param projectId 用户的项目 ID（如有）
 * @returns 用户的实际项目 ID
 */
export async function setupUser(client: OAuth2Client): Promise<string> {
  let projectId = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const caServer = new CodeAssistServer(client, projectId);

  const clientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
    duetProject: projectId,
  };

  const loadRes = await caServer.loadCodeAssist({
    cloudaicompanionProject: projectId,
    metadata: clientMetadata,
  });

  if (!projectId && loadRes.cloudaicompanionProject) {
    projectId = loadRes.cloudaicompanionProject;
  }

  const tier = getOnboardTier(loadRes);
  if (tier.userDefinedCloudaicompanionProject && !projectId) {
    throw new ProjectIdRequiredError();
  }

  const onboardReq: OnboardUserRequest = {
    tierId: tier.id,
    cloudaicompanionProject: projectId,
    metadata: clientMetadata,
  };

  // 持续轮询 onboardUser 直到长时间运行的操作完成。
  let lroRes = await caServer.onboardUser(onboardReq);
  while (!lroRes.done) {
    await new Promise((f) => setTimeout(f, 5000));
    lroRes = await caServer.onboardUser(onboardReq);
  }
  return lroRes.response?.cloudaicompanionProject?.id || '';
}

function getOnboardTier(res: LoadCodeAssistResponse): GeminiUserTier {
  if (res.currentTier) {
    return res.currentTier;
  }
  for (const tier of res.allowedTiers || []) {
    if (tier.isDefault) {
      return tier;
    }
  }
  return {
    name: '',
    description: '',
    id: UserTierId.LEGACY,
    userDefinedCloudaicompanionProject: true,
  };
}