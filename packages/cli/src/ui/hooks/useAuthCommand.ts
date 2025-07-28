/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import {
  AuthType,
  Config,
  clearCachedCredentialFile,
  getErrorMessage,
} from '@iflytek/iflycode-core';
import { runExitCleanup } from '../../utils/cleanup.js';

export const useAuthCommand = (
  settings: LoadedSettings,
  setAuthError: (error: string | null) => void,
  config: Config,
) => {
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(
    settings.merged.selectedAuthType === undefined,
  );

  const openAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(true);
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const authFlow = async () => {
      const authType = settings.merged.selectedAuthType;
      if (isAuthDialogOpen || !authType) {
        return;
      }

      try {
        setIsAuthenticating(true);
        await config.refreshAuth(authType);
        console.log(`通过 "${authType}" 认证。`);
      } catch (e) {
        setAuthError(`登录失败。消息: ${getErrorMessage(e)}`);
        openAuthDialog();
      } finally {
        setIsAuthenticating(false);
      }
    };

    void authFlow();
  }, [isAuthDialogOpen, settings, config, setAuthError, openAuthDialog]);

  const handleAuthSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        await clearCachedCredentialFile();
        settings.setValue(scope, 'selectedAuthType', authType);
        if (authType === AuthType.LOGIN_WITH_GOOGLE && config.getNoBrowser()) {
          runExitCleanup();
          console.log(
            `
----------------------------------------------------------------
正在使用 Google 登录... 请重启 Gemini CLI 以继续。
----------------------------------------------------------------
            `,
          );
          process.exit(0);
        }
      }
      setIsAuthDialogOpen(false);
      setAuthError(null);
    },
    [settings, setAuthError, config],
  );

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
  }, []);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    cancelAuthentication,
  };
};