/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  DOMElement,
  measureElement,
  Static,
  Text,
  useStdin,
  useStdout,
  useInput,
  type Key as InkKeyType,
} from 'ink';
import { StreamingState, type HistoryItem, MessageType } from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useAuthCommand } from './hooks/useAuthCommand.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { Header } from './components/Header.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { AutoAcceptIndicator } from './components/AutoAcceptIndicator.js';
import { ShellModeIndicator } from './components/ShellModeIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { AuthDialog } from './components/AuthDialog.js';
import { AuthInProgress } from './components/AuthInProgress.js';
import { EditorSettingsDialog } from './components/EditorSettingsDialog.js';
import { Colors } from './colors.js';
import { Help } from './components/Help.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import { LoadedSettings } from '../config/settings.js';
import { Tips } from './components/Tips.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';
import { registerCleanup } from '../utils/cleanup.js';
import { DetailedMessagesDisplay } from './components/DetailedMessagesDisplay.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { ContextSummaryDisplay } from './components/ContextSummaryDisplay.js';
import { useHistory } from './hooks/useHistoryManager.js';
import process from 'node:process';
import {
  getErrorMessage,
  type Config,
  getAllGeminiMdFilenames,
  ApprovalMode,
  isEditorAvailable,
  EditorType,
  FlashFallbackEvent,
  logFlashFallback,
} from '@iflytek/iflycode-core';
import { validateAuthMethod } from '../config/auth.js';
import { useLogger } from './hooks/useLogger.js';
import { StreamingContext } from './contexts/StreamingContext.js';
import {
  SessionStatsProvider,
  useSessionStats,
} from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import * as fs from 'fs';
import { UpdateNotification } from './components/UpdateNotification.js';
import {
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  UserTierId,
} from '@iflytek/iflycode-core';
import { checkForUpdates } from './utils/updateCheck.js';
import ansiEscapes from 'ansi-escapes';
import { OverflowProvider } from './contexts/OverflowContext.js';
import { ShowMoreLines } from './components/ShowMoreLines.js';
import { PrivacyNotice } from './privacy/PrivacyNotice.js';

const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

interface AppProps {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
}

export const AppWrapper = (props: AppProps) => (
  <SessionStatsProvider>
    <App {...props} />
  </SessionStatsProvider>
);

const App = ({ config, settings, startupWarnings = [], version }: AppProps) => {
  useBracketedPaste();
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const { stdout } = useStdout();
  const nightly = version.includes('nightly');

  useEffect(() => {
    checkForUpdates().then(setUpdateMessage);
  }, []);

  const { history, addItem, clearItems, loadHistory } = useHistory();
  const {
    consoleMessages,
    handleNewMessage,
    clearConsoleMessages: clearConsoleMessagesState,
  } = useConsoleMessages();

  useEffect(() => {
    const consolePatcher = new ConsolePatcher({
      onNewMessage: handleNewMessage,
      debugMode: config.getDebugMode(),
    });
    consolePatcher.patch();
    registerCleanup(consolePatcher.cleanup);
  }, [handleNewMessage, config]);

  const { stats: sessionStats } = useSessionStats();
  const [staticNeedsRefresh, setStaticNeedsRefresh] = useState(false);
  const [staticKey, setStaticKey] = useState(0);
  const refreshStatic = useCallback(() => {
    stdout.write(ansiEscapes.clearTerminal);
    setStaticKey((prev) => prev + 1);
  }, [setStaticKey, stdout]);

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(0);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState<number>(0);
  const [corgiMode, setCorgiMode] = useState(false);
  const [currentModel, setCurrentModel] = useState(config.getModel());
  const [shellModeActive, setShellModeActive] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [showToolDescriptions, setShowToolDescriptions] =
    useState<boolean>(false);
  const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
  const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
  const ctrlCTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
  const ctrlDTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState<boolean>(false);
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [userTier, setUserTier] = useState<UserTierId | undefined>(undefined);

  const openPrivacyNotice = useCallback(() => {
    setShowPrivacyNotice(true);
  }, []);
  const initialPromptSubmitted = useRef(false);

  const errorCount = useMemo(
    () => consoleMessages.filter((msg) => msg.type === 'error').length,
    [consoleMessages],
  );

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(settings, setThemeError, addItem);

  const {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    cancelAuthentication,
  } = useAuthCommand(settings, setAuthError, config);

  useEffect(() => {
    if (settings.merged.selectedAuthType) {
      const error = validateAuthMethod(settings.merged.selectedAuthType);
      if (error) {
        setAuthError(error);
        openAuthDialog();
      }
    }
  }, [settings.merged.selectedAuthType, openAuthDialog, setAuthError]);

  // 同步用户层级配置当认证改变时
  useEffect(() => {
    const syncUserTier = async () => {
      try {
        const configUserTier = await config.getUserTier();
        if (configUserTier !== userTier) {
          setUserTier(configUserTier);
        }
      } catch (error) {
        // 静默失败 - 这不是关键功能
        // 仅在调试模式下记录以避免控制台混乱
        if (config.getDebugMode()) {
          console.debug('同步用户层级失败:', error);
        }
      }
    };

    // 仅在未认证时同步
    if (!isAuthenticating) {
      syncUserTier();
    }
  }, [config, userTier, isAuthenticating]);

  const {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  } = useEditorSettings(settings, setEditorError, addItem);

  const toggleCorgiMode = useCallback(() => {
    setCorgiMode((prev) => !prev);
  }, []);

  const performMemoryRefresh = useCallback(async () => {
    addItem(
      {
        type: MessageType.INFO,
        text: '正在刷新分层记忆 (IFLYCODE.md 或其他上下文文件)...',
      },
      Date.now(),
    );
    try {
      const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
        process.cwd(),
        config.getDebugMode(),
        config.getFileService(),
        config.getExtensionContextFilePaths(),
      );
      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      addItem(
        {
          type: MessageType.INFO,
          text: `记忆刷新成功。${memoryContent.length > 0 ? `从 ${fileCount} 个文件加载了 ${memoryContent.length} 个字符。` : '未找到记忆内容。'}`,
        },
        Date.now(),
      );
      if (config.getDebugMode()) {
        console.log(
          `[DEBUG] 配置中刷新的记忆内容: ${memoryContent.substring(0, 200)}...`,
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      addItem(
        {
          type: MessageType.ERROR,
          text: `刷新记忆时出错: ${errorMessage}`,
        },
        Date.now(),
      );
      console.error('刷新记忆时出错:', error);
    }
  }, [config, addItem]);

  // 监听模型变化 (例如, 来自 Flash 回退)
  useEffect(() => {
    const checkModelChange = () => {
      const configModel = config.getModel();
      if (configModel !== currentModel) {
        setCurrentModel(configModel);
      }
    };

    // 立即检查然后定期检查
    checkModelChange();
    const interval = setInterval(checkModelChange, 1000); // 每秒检查一次

    return () => clearInterval(interval);
  }, [config, currentModel]);

  // 设置 Flash 回退处理器
  useEffect(() => {
    const flashFallbackHandler = async (
      currentModel: string,
      fallbackModel: string,
      error?: unknown,
    ): Promise<boolean> => {
      let message: string;

      // 如果可用则使用实际用户层级，否则默认为免费层级行为（安全默认值）
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

      // 检查这是否是 Pro 配额超限错误
      if (error && isProQuotaExceededError(error)) {
        if (isPaidTier) {
          message = `⚡ 您已达到每日 ${currentModel} 配额限制。
⚡ 自动从 ${currentModel} 切换到 ${fallbackModel} 以完成本次会话。
⚡ 要继续访问 ${currentModel} 模型，请考虑使用 /auth 切换到使用 AI Studio 的付费 API 密钥 https://aistudio.google.com/apikey`;
        } else {
          message = `⚡ 您已达到每日 ${currentModel} 配额限制。
⚡ 自动从 ${currentModel} 切换到 ${fallbackModel} 以完成本次会话。
⚡ 要增加您的限制，请升级到具有更高限制的 Gemini Code Assist 标准版或企业版计划 https://goo.gle/set-up-gemini-code-assist
⚡ 或者您可以使用 Gemini API 密钥。请参见: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ 您可以通过输入 /auth 切换认证方式`;
        }
      } else if (error && isGenericQuotaExceededError(error)) {
        if (isPaidTier) {
          message = `⚡ 您已达到每日配额限制。
⚡ 自动从 ${currentModel} 切换到 ${fallbackModel} 以完成本次会话。
⚡ 要继续访问 ${currentModel} 模型，请考虑使用 /auth 切换到使用 AI Studio 的付费 API 密钥 https://aistudio.google.com/apikey`;
        } else {
          message = `⚡ 您已达到每日配额限制。
⚡ 自动从 ${currentModel} 切换到 ${fallbackModel} 以完成本次会话。
⚡ 要增加您的限制，请升级到具有更高限制的 Gemini Code Assist 标准版或企业版计划 https://goo.gle/set-up-gemini-code-assist
⚡ 或者您可以使用 Gemini API 密钥。请参见: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ 您可以通过输入 /auth 切换认证方式`;
        }
      } else {
        if (isPaidTier) {
          // 其他情况的默认回退消息（如连续 429 错误）
          message = `⚡ 自动从 ${currentModel} 切换到 ${fallbackModel} 以获得更快的响应，本次会话剩余时间有效。
⚡ 可能的原因是您收到了多个连续的容量错误或已达到每日 ${currentModel} 配额限制
⚡ 要继续访问 ${currentModel} 模型，请考虑使用 /auth 切换到使用 AI Studio 的付费 API 密钥 https://aistudio.google.com/apikey`;
        } else {
          // 其他情况的默认回退消息（如连续 429 错误）
          message = `⚡ 自动从 ${currentModel} 切换到 ${fallbackModel} 以获得更快的响应，本次会话剩余时间有效。
⚡ 可能的原因是您收到了多个连续的容量错误或已达到每日 ${currentModel} 配额限制
⚡ 要增加您的限制，请升级到具有更高限制的 Gemini Code Assist 标准版或企业版计划 https://goo.gle/set-up-gemini-code-assist
⚡ 或者您可以使用 Gemini API 密钥。请参见: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ 您可以通过输入 /auth 切换认证方式`;
        }
      }

      // 添加消息到 UI 历史记录
      addItem(
        {
          type: MessageType.INFO,
          text: message,
        },
        Date.now(),
      );

      // 设置标志以防止工具继续
      setModelSwitchedFromQuotaError(true);
      // 设置全局配额错误标志以防止 Flash 模型调用
      config.setQuotaErrorOccurred(true);
      // 切换模型供未来使用但返回 false 以停止当前重试
      config.setModel(fallbackModel);
      logFlashFallback(
        config,
        new FlashFallbackEvent(config.getContentGeneratorConfig().authType!),
      );
      return false; // 不继续当前提示
    };

    config.setFlashFallbackHandler(flashFallbackHandler);
  }, [config, addItem, userTier]);

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    commandContext,
  } = useSlashCommandProcessor(
    config,
    settings,
    history,
    addItem,
    clearItems,
    loadHistory,
    refreshStatic,
    setShowHelp,
    setDebugMessage,
    openThemeDialog,
    openAuthDialog,
    openEditorDialog,
    toggleCorgiMode,
    showToolDescriptions,
    setQuittingMessages,
    openPrivacyNotice,
  );
  const pendingHistoryItems = [...pendingSlashCommandHistoryItems];

  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
  const isInitialMount = useRef(true);
  const { stdin, setRawMode } = useStdin();
  const isValidPath = useCallback((filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (_e) {
      return false;
    }
  }, []);

  const widthFraction = 0.9;
  const inputWidth = Math.max(
    20,
    Math.floor(terminalWidth * widthFraction) - 3,
  );
  const suggestionsWidth = Math.max(60, Math.floor(terminalWidth * 0.8));

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height: 10, width: inputWidth },
    stdin,
    setRawMode,
    isValidPath,
    shellModeActive,
  });

  const handleExit = useCallback(
    (
      pressedOnce: boolean,
      setPressedOnce: (value: boolean) => void,
      timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    ) => {
      if (pressedOnce) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        const quitCommand = slashCommands.find(
          (cmd) => cmd.name === 'quit' || cmd.altName === 'exit',
        );
        if (quitCommand && quitCommand.action) {
          quitCommand.action(commandContext, '');
        } else {
          // 这不太可能需要，但添加作为额外的后备。
          process.exit(0);
        }
      } else {
        setPressedOnce(true);
        timerRef.current = setTimeout(() => {
          setPressedOnce(false);
          timerRef.current = null;
        }, CTRL_EXIT_PROMPT_DURATION_MS);
      }
    },
    // 在这里将 commandContext 添加到依赖数组！
    [slashCommands, commandContext],
  );

  useInput((input: string, key: InkKeyType) => {
    let enteringConstrainHeightMode = false;
    if (!constrainHeight) {
      // 如果用户输入任何内容，自动重新进入约束高度模式。
      // 当 constrainHeight==false 时，用户会经历显著的闪烁，
      // 因此最好在用户开始与应用程序交互时立即禁用它。
      enteringConstrainHeightMode = true;
      setConstrainHeight(true);
    }

    if (key.ctrl && input === 'o') {
      setShowErrorDetails((prev) => !prev);
    } else if (key.ctrl && input === 't') {
      const newValue = !showToolDescriptions;
      setShowToolDescriptions(newValue);

      const mcpServers = config.getMcpServers();
      if (Object.keys(mcpServers || {}).length > 0) {
        handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
      }
    } else if (key.ctrl && (input === 'c' || input === 'C')) {
      handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
    } else if (key.ctrl && (input === 'd' || input === 'D')) {
      if (buffer.text.length > 0) {
        // 如果输入中有文本则不执行任何操作。
        return;
      }
      handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
    } else if (key.ctrl && input === 's' && !enteringConstrainHeightMode) {
      setConstrainHeight(false);
    }
  });

  useEffect(() => {
    if (config) {
      setGeminiMdFileCount(config.getGeminiMdFileCount());
    }
  }, [config]);

  const getPreferredEditor = useCallback(() => {
    const editorType = settings.merged.preferredEditor;
    const isValidEditor = isEditorAvailable(editorType);
    if (!isValidEditor) {
      openEditorDialog();
      return;
    }
    return editorType as EditorType;
  }, [settings, openEditorDialog]);

  const onAuthError = useCallback(() => {
    setAuthError('需要重新认证');
    openAuthDialog();
  }, [openAuthDialog, setAuthError]);

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
  } = useGeminiStream(
    config.getGeminiClient(),
    history,
    addItem,
    setShowHelp,
    config,
    setDebugMessage,
    handleSlashCommand,
    shellModeActive,
    getPreferredEditor,
    onAuthError,
    performMemoryRefresh,
    modelSwitchedFromQuotaError,
    setModelSwitchedFromQuotaError,
  );
  pendingHistoryItems.push(...pendingGeminiHistoryItems);
  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);
  const showAutoAcceptIndicator = useAutoAcceptIndicator({ config });

  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      const trimmedValue = submittedValue.trim();
      if (trimmedValue.length > 0) {
        submitQuery(trimmedValue);
      }
    },
    [submitQuery],
  );

  const logger = useLogger();
  const [userMessages, setUserMessages] = useState<string[]>([]);

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || []; // 最新的在前

      const currentSessionUserMessages = history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' &&
            typeof item.text === 'string' &&
            item.text.trim() !== '',
        )
        .map((item) => item.text)
        .reverse(); // 最新的在前，以匹配 pastMessagesRaw 排序

      // 合并，当前会话消息更新
      const combinedMessages = [
        ...currentSessionUserMessages,
        ...pastMessagesRaw,
      ];

      // 从合并列表中去重连续的相同消息（仍然最新的在前）
      const deduplicatedMessages: string[] = [];
      if (combinedMessages.length > 0) {
        deduplicatedMessages.push(combinedMessages[0]); // 无条件添加最新的一个
        for (let i = 1; i < combinedMessages.length; i++) {
          if (combinedMessages[i] !== combinedMessages[i - 1]) {
            deduplicatedMessages.push(combinedMessages[i]);
          }
        }
      }
      // 反转为最旧的在前以供 useInputHistory 使用
      setUserMessages(deduplicatedMessages.reverse());
    };
    fetchUserMessages();
  }, [history, logger]);

  const isInputActive = streamingState === StreamingState.Idle && !initError;

  const handleClearScreen = useCallback(() => {
    clearItems();
    clearConsoleMessagesState();
    console.clear();
    refreshStatic();
  }, [clearItems, clearConsoleMessagesState, refreshStatic]);

  const mainControlsRef = useRef<DOMElement>(null);
  const pendingHistoryItemRef = useRef<DOMElement>(null);

  useEffect(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      setFooterHeight(fullFooterMeasurement.height);
    }
  }, [terminalHeight, consoleMessages, showErrorDetails]);

  const staticExtraHeight = /* 边距和填充 */ 3;
  const availableTerminalHeight = useMemo(
    () => terminalHeight - footerHeight - staticExtraHeight,
    [terminalHeight, footerHeight],
  );

  useEffect(() => {
    // 跳过首次挂载时刷新 Static
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // 防抖动，使其在调整大小时不会过于频繁触发
    const handler = setTimeout(() => {
      setStaticNeedsRefresh(false);
      refreshStatic();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalWidth, terminalHeight, refreshStatic]);

  useEffect(() => {
    if (streamingState === StreamingState.Idle && staticNeedsRefresh) {
      setStaticNeedsRefresh(false);
      refreshStatic();
    }
  }, [streamingState, refreshStatic, staticNeedsRefresh]);

  const filteredConsoleMessages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  const branchName = useGitBranchName(config.getTargetDir());

  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.contextFileName;
    if (fromSettings) {
      return Array.isArray(fromSettings) ? fromSettings : [fromSettings];
    }
    return getAllGeminiMdFilenames();
  }, [settings.merged.contextFileName]);

  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const geminiClient = config.getGeminiClient();

  useEffect(() => {
    if (
      initialPrompt &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isAuthDialogOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !showPrivacyNotice &&
      geminiClient?.isInitialized?.()
    ) {
      submitQuery(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    submitQuery,
    isAuthenticating,
    isAuthDialogOpen,
    isThemeDialogOpen,
    isEditorDialogOpen,
    showPrivacyNotice,
    geminiClient,
  ]);

  if (quittingMessages) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {quittingMessages.map((item) => (
          <HistoryItemDisplay
            key={item.id}
            availableTerminalHeight={
              constrainHeight ? availableTerminalHeight : undefined
            }
            terminalWidth={terminalWidth}
            item={item}
            isPending={false}
            config={config}
          />
        ))}
      </Box>
    );
  }
  const mainAreaWidth = Math.floor(terminalWidth * 0.9);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalHeight * 0.2, 5));
  // 任意阈值以确保静态区域中的项目足够大
  // 但又不会太大而使终端难以使用。
  const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);
  return (
    <StreamingContext.Provider value={streamingState}>
      <Box flexDirection="column" marginBottom={1} width="90%">
        {/* 将 UpdateNotification 移到 Static 外部，以便当 updateMessage 改变时可以重新渲染 */}
        {updateMessage && <UpdateNotification message={updateMessage} />}

        {/*
         * Static 组件是 Ink 中的应用程序只能有一个的内在组件。
         * 由于此限制，我们稍微进行了黑客处理，通过在这里放置一个 'header' 项目来
         * 确保它是静态渲染的。
         *
         * 关于 Static 项目的背景：Static 组件中的任何内容都只写入一次
         * 到控制台。可以将其视为执行 console.log 然后永远不使用 ANSI 代码来
         * 清除该内容。实际上它有一个移动框架，每次设置新的静态
         * 内容时，它都会将内容刷新到终端并将它"清除"的区域
         * 向下移动一个位置。没有 Static，被擦除和重绘的区域会持续增长。
         */}
        <Static
          key={staticKey}
          items={[
            <Box flexDirection="column" key="header">
              {!settings.merged.hideBanner && (
                <Header
                  terminalWidth={terminalWidth}
                  version={version}
                  nightly={nightly}
                />
              )}
              {!settings.merged.hideTips && <Tips config={config} />}
            </Box>,
            ...history.map((h) => (
              <HistoryItemDisplay
                terminalWidth={mainAreaWidth}
                availableTerminalHeight={staticAreaMaxItemHeight}
                key={h.id}
                item={h}
                isPending={false}
                config={config}
              />
            )),
          ]}
        >
          {(item) => item}
        </Static>
        <OverflowProvider>
          <Box ref={pendingHistoryItemRef} flexDirection="column">
            {pendingHistoryItems.map((item, i) => (
              <HistoryItemDisplay
                key={i}
                availableTerminalHeight={
                  constrainHeight ? availableTerminalHeight : undefined
                }
                terminalWidth={mainAreaWidth}
                // TODO(taehykim): 看起来 HistoryItemDisplay 中对 id 的引用似乎不是必需的。
                // 稍后重构。现在使用假 id。
                item={{ ...item, id: 0 }}
                isPending={true}
                config={config}
                isFocused={!isEditorDialogOpen}
              />
            ))}
            <ShowMoreLines constrainHeight={constrainHeight} />
          </Box>
        </OverflowProvider>

        {showHelp && <Help commands={slashCommands} />}

        <Box flexDirection="column" ref={mainControlsRef}>
          {startupWarnings.length > 0 && (
            <Box
              borderStyle="round"
              borderColor={Colors.AccentYellow}
              paddingX={1}
              marginY={1}
              flexDirection="column"
            >
              {startupWarnings.map((warning, index) => (
                <Text key={index} color={Colors.AccentYellow}>
                  {warning}
                </Text>
              ))}
            </Box>
          )}

          {isThemeDialogOpen ? (
            <Box flexDirection="column">
              {themeError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{themeError}</Text>
                </Box>
              )}
              <ThemeDialog
                onSelect={handleThemeSelect}
                onHighlight={handleThemeHighlight}
                settings={settings}
                availableTerminalHeight={
                  constrainHeight
                    ? terminalHeight - staticExtraHeight
                    : undefined
                }
                terminalWidth={mainAreaWidth}
              />
            </Box>
          ) : isAuthenticating ? (
            <>
              <AuthInProgress
                onTimeout={() => {
                  setAuthError('认证超时。请重试。');
                  cancelAuthentication();
                  openAuthDialog();
                }}
              />
              {showErrorDetails && (
                <OverflowProvider>
                  <Box flexDirection="column">
                    <DetailedMessagesDisplay
                      messages={filteredConsoleMessages}
                      maxHeight={
                        constrainHeight ? debugConsoleMaxHeight : undefined
                      }
                      width={inputWidth}
                    />
                    <ShowMoreLines constrainHeight={constrainHeight} />
                  </Box>
                </OverflowProvider>
              )}
            </>
          ) : isAuthDialogOpen ? (
            <Box flexDirection="column">
              <AuthDialog
                onSelect={handleAuthSelect}
                settings={settings}
                initialErrorMessage={authError}
              />
            </Box>
          ) : isEditorDialogOpen ? (
            <Box flexDirection="column">
              {editorError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{editorError}</Text>
                </Box>
              )}
              <EditorSettingsDialog
                onSelect={handleEditorSelect}
                settings={settings}
                onExit={exitEditorDialog}
              />
            </Box>
          ) : showPrivacyNotice ? (
            <PrivacyNotice
              onExit={() => setShowPrivacyNotice(false)}
              config={config}
            />
          ) : (
            <>
              <LoadingIndicator
                thought={
                  streamingState === StreamingState.WaitingForConfirmation ||
                  config.getAccessibility()?.disableLoadingPhrases
                    ? undefined
                    : thought
                }
                currentLoadingPhrase={
                  config.getAccessibility()?.disableLoadingPhrases
                    ? undefined
                    : currentLoadingPhrase
                }
                elapsedTime={elapsedTime}
              />
              <Box
                marginTop={1}
                display="flex"
                justifyContent="space-between"
                width="100%"
              >
                <Box>
                  {process.env.GEMINI_SYSTEM_MD && (
                    <Text color={Colors.AccentRed}>|⌐■_■| </Text>
                  )}
                  {ctrlCPressedOnce ? (
                    <Text color={Colors.AccentYellow}>
                      再次按 Ctrl+C 退出。
                    </Text>
                  ) : ctrlDPressedOnce ? (
                    <Text color={Colors.AccentYellow}>
                      再次按 Ctrl+D 退出。
                    </Text>
                  ) : (
                    <ContextSummaryDisplay
                      geminiMdFileCount={geminiMdFileCount}
                      contextFileNames={contextFileNames}
                      mcpServers={config.getMcpServers()}
                      showToolDescriptions={showToolDescriptions}
                    />
                  )}
                </Box>
                <Box>
                  {showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
                    !shellModeActive && (
                      <AutoAcceptIndicator
                        approvalMode={showAutoAcceptIndicator}
                      />
                    )}
                  {shellModeActive && <ShellModeIndicator />}
                </Box>
              </Box>

              {showErrorDetails && (
                <OverflowProvider>
                  <Box flexDirection="column">
                    <DetailedMessagesDisplay
                      messages={filteredConsoleMessages}
                      maxHeight={
                        constrainHeight ? debugConsoleMaxHeight : undefined
                      }
                      width={inputWidth}
                    />
                    <ShowMoreLines constrainHeight={constrainHeight} />
                  </Box>
                </OverflowProvider>
              )}

              {isInputActive && (
                <InputPrompt
                  buffer={buffer}
                  inputWidth={inputWidth}
                  suggestionsWidth={suggestionsWidth}
                  onSubmit={handleFinalSubmit}
                  userMessages={userMessages}
                  onClearScreen={handleClearScreen}
                  config={config}
                  slashCommands={slashCommands}
                  commandContext={commandContext}
                  shellModeActive={shellModeActive}
                  setShellModeActive={setShellModeActive}
                />
              )}
            </>
          )}

          {initError && streamingState !== StreamingState.Responding && (
            <Box
              borderStyle="round"
              borderColor={Colors.AccentRed}
              paddingX={1}
              marginBottom={1}
            >
              {history.find(
                (item) =>
                  item.type === 'error' && item.text?.includes(initError),
              )?.text ? (
                <Text color={Colors.AccentRed}>
                  {
                    history.find(
                      (item) =>
                        item.type === 'error' && item.text?.includes(initError),
                    )?.text
                  }
                </Text>
              ) : (
                <>
                  <Text color={Colors.AccentRed}>
                    初始化错误: {initError}
                  </Text>
                  <Text color={Colors.AccentRed}>
                    {' '}
                    请检查 API 密钥和配置。
                  </Text>
                </>
              )}
            </Box>
          )}
          <Footer
            model={currentModel}
            targetDir={config.getTargetDir()}
            debugMode={config.getDebugMode()}
            branchName={branchName}
            debugMessage={debugMessage}
            corgiMode={corgiMode}
            errorCount={errorCount}
            showErrorDetails={showErrorDetails}
            showMemoryUsage={
              config.getDebugMode() || config.getShowMemoryUsage()
            }
            sessionStats={sessionStats}
            promptTokenCount={sessionStats.lastPromptTokenCount}
            nightly={nightly}
          />
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};