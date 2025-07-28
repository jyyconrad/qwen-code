/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClientMetadata {
  ideType?: ClientMetadataIdeType;
  ideVersion?: string;
  pluginVersion?: string;
  platform?: ClientMetadataPlatform;
  updateChannel?: string;
  duetProject?: string;
  pluginType?: ClientMetadataPluginType;
  ideName?: string;
}

export type ClientMetadataIdeType =
  | 'IDE_UNSPECIFIED'
  | 'VSCODE'
  | 'INTELLIJ'
  | 'VSCODE_CLOUD_WORKSTATION'
  | 'INTELLIJ_CLOUD_WORKSTATION'
  | 'CLOUD_SHELL';
export type ClientMetadataPlatform =
  | 'PLATFORM_UNSPECIFIED'
  | 'DARWIN_AMD64'
  | 'DARWIN_ARM64'
  | 'LINUX_AMD64'
  | 'LINUX_ARM64'
  | 'WINDOWS_AMD64';
export type ClientMetadataPluginType =
  | 'PLUGIN_UNSPECIFIED'
  | 'CLOUD_CODE'
  | 'GEMINI'
  | 'AIPLUGIN_INTELLIJ'
  | 'AIPLUGIN_STUDIO';

export interface LoadCodeAssistRequest {
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

/**
 * 表示 LoadCodeAssistResponse proto json 字段
 * http://google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=224
 */
export interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier | null;
  allowedTiers?: GeminiUserTier[] | null;
  ineligibleTiers?: IneligibleTier[] | null;
  cloudaicompanionProject?: string | null;
}

/**
 * GeminiUserTier 反映了调用 LoadCodeAssist 时从 CodeAssist 接收到的结构。
 */
export interface GeminiUserTier {
  id: UserTierId;
  name: string;
  description: string;
  // 此值用于声明给定层级是否要求用户在 IDE 设置中配置项目设置。
  userDefinedCloudaicompanionProject?: boolean | null;
  isDefault?: boolean;
  privacyNotice?: PrivacyNotice;
  hasAcceptedTos?: boolean;
  hasOnboardedPreviously?: boolean;
}

/**
 * 包含指定用户不符合特定层级资格的原因信息。
 * @param reasonCode 表示不符合资格原因的助记代码。
 * @param reasonMessage 显示给用户的消息。
 * @param tierId 层级 ID。
 * @param tierName 层级名称。
 */
export interface IneligibleTier {
  reasonCode: IneligibleTierReasonCode;
  reasonMessage: string;
  tierId: UserTierId;
  tierName: string;
}

/**
 * 当层级被阻止时的预定义原因代码列表。
 * https://source.corp.google.com/piper///depot/google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=378
 */
export enum IneligibleTierReasonCode {
  // go/keep-sorted start
  DASHER_USER = 'DASHER_USER',
  INELIGIBLE_ACCOUNT = 'INELIGIBLE_ACCOUNT',
  NON_USER_ACCOUNT = 'NON_USER_ACCOUNT',
  RESTRICTED_AGE = 'RESTRICTED_AGE',
  RESTRICTED_NETWORK = 'RESTRICTED_NETWORK',
  UNKNOWN = 'UNKNOWN',
  UNKNOWN_LOCATION = 'UNKNOWN_LOCATION',
  UNSUPPORTED_LOCATION = 'UNSUPPORTED_LOCATION',
  // go/keep-sorted end
}
/**
 * UserTierId 表示从 Cloud Code 私有 API 返回的表示用户层级的 ID
 *
 * //depot/google3/cloud/developer_experience/cloudcode/pa/service/usertier.go;l=16
 */
export enum UserTierId {
  FREE = 'free-tier',
  LEGACY = 'legacy-tier',
  STANDARD = 'standard-tier',
}

/**
 * PrivacyNotice 反映了从 CodeAssist 接收到的关于层级隐私声明的结构。
 */
export interface PrivacyNotice {
  showNotice: boolean;
  noticeText?: string;
}

/**
 * OnboardUserRequest 的 Proto 签名，作为 OnboardUser 调用的载荷
 */
export interface OnboardUserRequest {
  tierId: string | undefined;
  cloudaicompanionProject: string | undefined;
  metadata: ClientMetadata | undefined;
}

/**
 * 表示 LongrunningOperation proto
 * http://google3/google/longrunning/operations.proto;rcl=698857719;l=107
 */
export interface LongrunningOperationResponse {
  name: string;
  done?: boolean;
  response?: OnboardUserResponse;
}

/**
 * 表示 OnboardUserResponse proto
 * http://google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=215
 */
export interface OnboardUserResponse {
  // tslint:disable-next-line:enforce-name-casing 这是 proto 中字段的名称。
  cloudaicompanionProject?: {
    id: string;
    name: string;
  };
}

/**
 * 用户许可证状态的状态码
 * 它不严格对应于 proto
 * Error 值是分配给 OnboardUser 错误响应的附加值
 */
export enum OnboardUserStatusCode {
  Default = 'DEFAULT',
  Notice = 'NOTICE',
  Warning = 'WARNING',
  Error = 'ERROR',
}

/**
 * 用户加入 gemini 的状态
 */
export interface OnboardUserStatus {
  statusCode: OnboardUserStatusCode;
  displayMessage: string;
  helpLink: HelpLinkUrl | undefined;
}

export interface HelpLinkUrl {
  description: string;
  url: string;
}

export interface SetCodeAssistGlobalUserSettingRequest {
  cloudaicompanionProject?: string;
  freeTierDataCollectionOptin: boolean;
}

export interface CodeAssistGlobalUserSettingResponse {
  cloudaicompanionProject?: string;
  freeTierDataCollectionOptin: boolean;
}