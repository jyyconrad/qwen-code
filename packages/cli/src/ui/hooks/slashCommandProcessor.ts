/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useEffect, useState } from 'react';
import { type PartListUnion } from '@google/genai';
import open from 'open';
import process from 'node:process';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useStateAndRef } from './useStateAndRef.js';
import {
  Config,
  GitService,
  Logger,
  MCPDiscoveryState,
  MCPServerStatus,
  getMCPDiscoveryState,
  getMCPServerStatus,
} from '@iflytek/iflycode-core';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  Message,
  MessageType,
  HistoryItemWithoutId,
  HistoryItem,
  SlashCommandProcessorResult,
} from '../types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatDuration, formatMemoryUsage } from '../utils/formatters.js';
import { getCliVersion } from '../../utils/version.js';
import { LoadedSettings } from '../../config/settings.js';
import {
  type CommandContext,
  type SlashCommandActionReturn,
  type SlashCommand,
} from '../commands/types.js';
import { CommandService } from '../../services/CommandService.js';

// 此接口用于旧的内联命令定义。
// 一旦所有命令迁移到新系统后将被移除。
export interface LegacySlashCommand {
  name: string;
  altName?: string;
  description?: string;
  completion?: () => Promise<string[]>;
  action: (
    mainCommand: string,
    subCommand?: string,
    args?: string,
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>;
}

/**
 * 用于定义和处理斜杠命令的 Hook（例如，/help, /clear）。
 */
export const useSlashCommandProcessor = (
  config: Config | null,
  settings: LoadedSettings,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  clearItems: UseHistoryManagerReturn['clearItems'],
  loadHistory: UseHistoryManagerReturn['loadHistory'],
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  onDebugMessage: (message: string) => void,
  openThemeDialog: () => void,
  openAuthDialog: () => void,
  openEditorDialog: () => void,
  toggleCorgiMode: () => void,
  showToolDescriptions: boolean = false,
  setQuittingMessages: (message: HistoryItem[]) => void,
  openPrivacyNotice: () => void,
) => {
  const session = useSessionStats();
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const gitService = useMemo(() => {
    if (!config?.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot());
  }, [config]);

  const logger = useMemo(() => {
    const l = new Logger(config?.getSessionId() || '');
    // 日志记录器的初始化是异步的，但我们可以同步创建实例。
    // 使用它的命令将等待其初始化完成。
    return l;
  }, [config]);

  const [pendingCompressionItemRef, setPendingCompressionItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);

  const pendingHistoryItems = useMemo(() => {
    const items: HistoryItemWithoutId[] = [];
    if (pendingCompressionItemRef.current != null) {
      items.push(pendingCompressionItemRef.current);
    }
    return items;
  }, [pendingCompressionItemRef]);

  const addMessage = useCallback(
    (message: Message) => {
      // 将 Message 转换为 HistoryItemWithoutId
      let historyItemContent: HistoryItemWithoutId;
      if (message.type === MessageType.ABOUT) {
        historyItemContent = {
          type: 'about',
          cliVersion: message.cliVersion,
          osVersion: message.osVersion,
          sandboxEnv: message.sandboxEnv,
          modelVersion: message.modelVersion,
          selectedAuthType: message.selectedAuthType,
          gcpProject: message.gcpProject,
        };
      } else if (message.type === MessageType.STATS) {
        historyItemContent = {
          type: 'stats',
          duration: message.duration,
        };
      } else if (message.type === MessageType.MODEL_STATS) {
        historyItemContent = {
          type: 'model_stats',
        };
      } else if (message.type === MessageType.TOOL_STATS) {
        historyItemContent = {
          type: 'tool_stats',
        };
      } else if (message.type === MessageType.QUIT) {
        historyItemContent = {
          type: 'quit',
          duration: message.duration,
        };
      } else if (message.type === MessageType.COMPRESSION) {
        historyItemContent = {
          type: 'compression',
          compression: message.compression,
        };
      } else {
        historyItemContent = {
          type: message.type,
          text: message.content,
        };
      }
      addItem(historyItemContent, message.timestamp.getTime());
    },
    [addItem],
  );

  const commandContext = useMemo(
    (): CommandContext => ({
      services: {
        config,
        settings,
        git: gitService,
        logger,
      },
      ui: {
        addItem,
        clear: () => {
          clearItems();
          console.clear();
          refreshStatic();
        },
        setDebugMessage: onDebugMessage,
      },
      session: {
        stats: session.stats,
      },
    }),
    [
      config,
      settings,
      gitService,
      logger,
      addItem,
      clearItems,
      refreshStatic,
      session.stats,
      onDebugMessage,
    ],
  );

  const commandService = useMemo(() => new CommandService(), []);

  useEffect(() => {
    const load = async () => {
      await commandService.loadCommands();
      setCommands(commandService.getCommands());
    };

    load();
  }, [commandService]);

  const savedChatTags = useCallback(async () => {
    const geminiDir = config?.getProjectTempDir();
    if (!geminiDir) {
      return [];
    }
    try {
      const files = await fs.readdir(geminiDir);
      return files
        .filter(
          (file) => file.startsWith('checkpoint-') && file.endsWith('.json'),
        )
        .map((file) => file.replace('checkpoint-', '').replace('.json', ''));
    } catch (_err) {
      return [];
    }
  }, [config]);

  // 定义旧命令
  // 此列表包含尚未迁移到新系统的所有命令。随着命令的迁移，它们将从此列表中移除。
  const legacyCommands: LegacySlashCommand[] = useMemo(() => {
    const commands: LegacySlashCommand[] = [
      // `/help` 和 `/clear` 已迁移并从此列表中移除。
      {
        name: 'docs',
        description: '在浏览器中打开完整的 iFlyCode 文档',
        action: async (_mainCommand, _subCommand, _args) => {
          const docsUrl =
            'https://github.com/iFlyCodeLM/iFlyCode3-Coder/blob/main/README.md';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            addMessage({
              type: MessageType.INFO,
              content: `请在浏览器中打开以下 URL 查看文档：\n${docsUrl}`,
              timestamp: new Date(),
            });
          } else {
            addMessage({
              type: MessageType.INFO,
              content: `正在浏览器中打开文档：${docsUrl}`,
              timestamp: new Date(),
            });
            await open(docsUrl);
          }
        },
      },
      {
        name: 'editor',
        description: '设置外部编辑器偏好',
        action: (_mainCommand, _subCommand, _args) => openEditorDialog(),
      },
      {
        name: 'stats',
        altName: 'usage',
        description: '检查会话统计信息。用法：/stats [model|tools]',
        action: (_mainCommand, subCommand, _args) => {
          if (subCommand === 'model') {
            addMessage({
              type: MessageType.MODEL_STATS,
              timestamp: new Date(),
            });
            return;
          } else if (subCommand === 'tools') {
            addMessage({
              type: MessageType.TOOL_STATS,
              timestamp: new Date(),
            });
            return;
          }

          const now = new Date();
          const { sessionStartTime } = session.stats;
          const wallDuration = now.getTime() - sessionStartTime.getTime();

          addMessage({
            type: MessageType.STATS,
            duration: formatDuration(wallDuration),
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'mcp',
        description: '列出配置的 MCP 服务器和工具',
        action: async (_mainCommand, _subCommand, _args) => {
          // 检查 _subCommand 是否包含特定标志来控制描述可见性
          let useShowDescriptions = showToolDescriptions;
          if (_subCommand === 'desc' || _subCommand === 'descriptions') {
            useShowDescriptions = true;
          } else if (
            _subCommand === 'nodesc' ||
            _subCommand === 'nodescriptions'
          ) {
            useShowDescriptions = false;
          } else if (_args === 'desc' || _args === 'descriptions') {
            useShowDescriptions = true;
          } else if (_args === 'nodesc' || _args === 'nodescriptions') {
            useShowDescriptions = false;
          }
          // 检查 _subCommand 是否包含特定标志来显示详细的工具模式
          let useShowSchema = false;
          if (_subCommand === 'schema' || _args === 'schema') {
            useShowSchema = true;
          }

          const toolRegistry = await config?.getToolRegistry();
          if (!toolRegistry) {
            addMessage({
              type: MessageType.ERROR,
              content: '无法检索工具注册表。',
              timestamp: new Date(),
            });
            return;
          }

          const mcpServers = config?.getMcpServers() || {};
          const serverNames = Object.keys(mcpServers);

          if (serverNames.length === 0) {
            const docsUrl = 'https://goo.gle/gemini-cli-docs-mcp';
            if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
              addMessage({
                type: MessageType.INFO,
                content: `未配置 MCP 服务器。请在浏览器中打开以下 URL 查看文档：\n${docsUrl}`,
                timestamp: new Date(),
              });
            } else {
              addMessage({
                type: MessageType.INFO,
                content: `未配置 MCP 服务器。正在浏览器中打开文档：${docsUrl}`,
                timestamp: new Date(),
              });
              await open(docsUrl);
            }
            return;
          }

          // 检查是否有服务器仍在连接中
          const connectingServers = serverNames.filter(
            (name) => getMCPServerStatus(name) === MCPServerStatus.CONNECTING,
          );
          const discoveryState = getMCPDiscoveryState();

          let message = '';

          // 如果需要，添加整体发现状态消息
          if (
            discoveryState === MCPDiscoveryState.IN_PROGRESS ||
            connectingServers.length > 0
          ) {
            message += `\u001b[33m⏳ MCP 服务器正在启动 (${connectingServers.length} 个正在初始化)...\u001b[0m\n`;
            message += `\u001b[90m注意：首次启动可能需要更长时间。工具可用性将自动更新。\u001b[0m\n\n`;
          }

          message += '配置的 MCP 服务器：\n\n';

          for (const serverName of serverNames) {
            const serverTools = toolRegistry.getToolsByServer(serverName);
            const status = getMCPServerStatus(serverName);

            // 添加状态指示器和描述性文本
            let statusIndicator = '';
            let statusText = '';
            switch (status) {
              case MCPServerStatus.CONNECTED:
                statusIndicator = '🟢';
                statusText = '就绪';
                break;
              case MCPServerStatus.CONNECTING:
                statusIndicator = '🔄';
                statusText = '启动中...（首次启动可能需要更长时间）';
                break;
              case MCPServerStatus.DISCONNECTED:
              default:
                statusIndicator = '🔴';
                statusText = '已断开连接';
                break;
            }

            // 获取服务器描述（如果可用）
            const server = mcpServers[serverName];

            // 格式化服务器标题，包含粗体格式和状态
            message += `${statusIndicator} \u001b[1m${serverName}\u001b[0m - ${statusText}`;

            // 添加工具数量和条件消息
            if (status === MCPServerStatus.CONNECTED) {
              message += ` (${serverTools.length} 个工具)`;
            } else if (status === MCPServerStatus.CONNECTING) {
              message += ` (工具将在就绪时出现)`;
            } else {
              message += ` (${serverTools.length} 个工具已缓存)`;
            }

            // 添加服务器描述，正确处理多行描述
            if ((useShowDescriptions || useShowSchema) && server?.description) {
              const greenColor = '\u001b[32m';
              const resetColor = '\u001b[0m';

              const descLines = server.description.trim().split('\n');
              if (descLines) {
                message += ':\n';
                for (const descLine of descLines) {
                  message += `    ${greenColor}${descLine}${resetColor}\n`;
                }
              } else {
                message += '\n';
              }
            } else {
              message += '\n';
            }

            // 在服务器条目后重置格式
            message += '\u001b[0m';

            if (serverTools.length > 0) {
              serverTools.forEach((tool) => {
                if (
                  (useShowDescriptions || useShowSchema) &&
                  tool.description
                ) {
                  // 使用简单的 ANSI 青色格式化工具名称
                  message += `  - \u001b[36m${tool.name}\u001b[0m`;

                  // 对描述文本应用绿色
                  const greenColor = '\u001b[32m';
                  const resetColor = '\u001b[0m';

                  // 通过正确缩进和保留格式处理多行描述
                  const descLines = tool.description.trim().split('\n');
                  if (descLines) {
                    message += ':\n';
                    for (const descLine of descLines) {
                      message += `      ${greenColor}${descLine}${resetColor}\n`;
                    }
                  } else {
                    message += '\n';
                  }
                  // 现在每行内联处理重置
                } else {
                  // 即使不显示描述也使用青色格式化工具名称
                  message += `  - \u001b[36m${tool.name}\u001b[0m\n`;
                }
                if (useShowSchema) {
                  // 使用青色前缀参数
                  message += `    \u001b[36mParameters:\u001b[0m\n`;
                  // 对参数文本应用绿色
                  const greenColor = '\u001b[32m';
                  const resetColor = '\u001b[0m';

                  const paramsLines = JSON.stringify(
                    tool.schema.parameters,
                    null,
                    2,
                  )
                    .trim()
                    .split('\n');
                  if (paramsLines) {
                    for (const paramsLine of paramsLines) {
                      message += `      ${greenColor}${paramsLine}${resetColor}\n`;
                    }
                  }
                }
              });
            } else {
              message += '  无可用工具\n';
            }
            message += '\n';
          }

          // 确保在末尾重置任何 ANSI 格式，以防止影响终端
          message += '\u001b[0m';

          addMessage({
            type: MessageType.INFO,
            content: message,
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'extensions',
        description: '列出活动扩展',
        action: async () => {
          const activeExtensions = config?.getActiveExtensions();
          if (!activeExtensions || activeExtensions.length === 0) {
            addMessage({
              type: MessageType.INFO,
              content: '无活动扩展。',
              timestamp: new Date(),
            });
            return;
          }

          let message = '活动扩展：\n\n';
          for (const ext of activeExtensions) {
            message += `  - \u001b[36m${ext.name} (v${ext.version})\u001b[0m\n`;
          }
          // 确保在末尾重置任何 ANSI 格式，以防止影响终端
          message += '\u001b[0m';

          addMessage({
            type: MessageType.INFO,
            content: message,
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'tools',
        description: '列出可用的 iFlyCode 工具',
        action: async (_mainCommand, _subCommand, _args) => {
          // 检查 _subCommand 是否包含特定标志来控制描述可见性
          let useShowDescriptions = showToolDescriptions;
          if (_subCommand === 'desc' || _subCommand === 'descriptions') {
            useShowDescriptions = true;
          } else if (
            _subCommand === 'nodesc' ||
            _subCommand === 'nodescriptions'
          ) {
            useShowDescriptions = false;
          } else if (_args === 'desc' || _args === 'descriptions') {
            useShowDescriptions = true;
          } else if (_args === 'nodesc' || _args === 'nodescriptions') {
            useShowDescriptions = false;
          }

          const toolRegistry = await config?.getToolRegistry();
          const tools = toolRegistry?.getAllTools();
          if (!tools) {
            addMessage({
              type: MessageType.ERROR,
              content: '无法检索工具。',
              timestamp: new Date(),
            });
            return;
          }

          // 通过检查是否有 serverName 属性来过滤掉 MCP 工具
          const geminiTools = tools.filter((tool) => !('serverName' in tool));

          let message = '可用的 Gemini CLI 工具：\n\n';

          if (geminiTools.length > 0) {
            geminiTools.forEach((tool) => {
              if (useShowDescriptions && tool.description) {
                // 使用简单的 ANSI 青色格式化工具名称
                message += `  - \u001b[36m${tool.displayName} (${tool.name})\u001b[0m:\n`;

                // 对描述文本应用绿色
                const greenColor = '\u001b[32m';
                const resetColor = '\u001b[0m';

                // 通过正确缩进和保留格式处理多行描述
                const descLines = tool.description.trim().split('\n');

                // 如果有多行，为每行添加适当的缩进
                if (descLines) {
                  for (const descLine of descLines) {
                    message += `      ${greenColor}${descLine}${resetColor}\n`;
                  }
                }
              } else {
                // 即使不显示描述也使用青色格式化工具名称
                message += `  - \u001b[36m${tool.displayName}\u001b[0m\n`;
              }
            });
          } else {
            message += '  无可用工具\n';
          }
          message += '\n';

          // 确保在末尾重置任何 ANSI 格式，以防止影响终端
          message += '\u001b[0m';

          addMessage({
            type: MessageType.INFO,
            content: message,
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'corgi',
        action: (_mainCommand, _subCommand, _args) => {
          toggleCorgiMode();
        },
      },
      {
        name: 'bug',
        description: '提交错误报告',
        action: async (_mainCommand, _subCommand, args) => {
          let bugDescription = _subCommand || '';
          if (args) {
            bugDescription += ` ${args}`;
          }
          bugDescription = bugDescription.trim();

          const osVersion = `${process.platform} ${process.version}`;
          let sandboxEnv = '无沙箱';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            sandboxEnv = process.env.SANDBOX.replace(/^gemini-(?:code-)?/, '');
          } else if (process.env.SANDBOX === 'sandbox-exec') {
            sandboxEnv = `sandbox-exec (${
              process.env.SEATBELT_PROFILE || '未知'
            })`;
          }
          const modelVersion = config?.getModel() || '未知';
          const cliVersion = await getCliVersion();
          const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);

          const info = `
*   **CLI 版本：** ${cliVersion}
*   **Git 提交：** ${GIT_COMMIT_INFO}
*   **操作系统：** ${osVersion}
*   **沙箱环境：** ${sandboxEnv}
*   **模型版本：** ${modelVersion}
*   **内存使用：** ${memoryUsage}
`;

          let bugReportUrl =
            'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}';
          const bugCommand = config?.getBugCommand();
          if (bugCommand?.urlTemplate) {
            bugReportUrl = bugCommand.urlTemplate;
          }
          bugReportUrl = bugReportUrl
            .replace('{title}', encodeURIComponent(bugDescription))
            .replace('{info}', encodeURIComponent(info));

          addMessage({
            type: MessageType.INFO,
            content: `要提交错误报告，请在浏览器中打开以下 URL：\n${bugReportUrl}`,
            timestamp: new Date(),
          });
          (async () => {
            try {
              await open(bugReportUrl);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              addMessage({
                type: MessageType.ERROR,
                content: `无法在浏览器中打开 URL：${errorMessage}`,
                timestamp: new Date(),
              });
            }
          })();
        },
      },
      {
        name: 'chat',
        description:
          '管理对话历史。用法：/chat <list|save|resume> <tag>',
        action: async (_mainCommand, subCommand, args) => {
          const tag = (args || '').trim();
          const logger = new Logger(config?.getSessionId() || '');
          await logger.initialize();
          const chat = await config?.getGeminiClient()?.getChat();
          if (!chat) {
            addMessage({
              type: MessageType.ERROR,
              content: '无可用的聊天客户端来获取对话状态。',
              timestamp: new Date(),
            });
            return;
          }
          if (!subCommand) {
            addMessage({
              type: MessageType.ERROR,
              content: '缺少命令\n用法：/chat <list|save|resume> <tag>',
              timestamp: new Date(),
            });
            return;
          }
          switch (subCommand) {
            case 'save': {
              if (!tag) {
                addMessage({
                  type: MessageType.ERROR,
                  content: '缺少标签。用法：/chat save <tag>',
                  timestamp: new Date(),
                });
                return;
              }
              const history = chat.getHistory();
              if (history.length > 0) {
                await logger.saveCheckpoint(chat?.getHistory() || [], tag);
                addMessage({
                  type: MessageType.INFO,
                  content: `对话检查点已保存，标签：${tag}。`,
                  timestamp: new Date(),
                });
              } else {
                addMessage({
                  type: MessageType.INFO,
                  content: '未找到要保存的对话。',
                  timestamp: new Date(),
                });
              }
              return;
            }
            case 'resume':
            case 'restore':
            case 'load': {
              if (!tag) {
                addMessage({
                  type: MessageType.ERROR,
                  content: '缺少标签。用法：/chat resume <tag>',
                  timestamp: new Date(),
                });
                return;
              }
              const conversation = await logger.loadCheckpoint(tag);
              if (conversation.length === 0) {
                addMessage({
                  type: MessageType.INFO,
                  content: `未找到标签为 ${tag} 的已保存检查点。`,
                  timestamp: new Date(),
                });
                return;
              }

              clearItems();
              chat.clearHistory();
              const rolemap: { [key: string]: MessageType } = {
                user: MessageType.USER,
                model: MessageType.GEMINI,
              };
              let hasSystemPrompt = false;
              let i = 0;
              for (const item of conversation) {
                i += 1;

                // 无论是否显示，都将每个项目添加到历史中。
                chat.addHistory(item);

                const text =
                  item.parts
                    ?.filter((m) => !!m.text)
                    .map((m) => m.text)
                    .join('') || '';
                if (!text) {
                  // 将 Part[] 解析回各种非文本输出尚未实现。
                  continue;
                }
                if (i === 1 && text.match(/context for our chat/)) {
                  hasSystemPrompt = true;
                }
                if (i > 2 || !hasSystemPrompt) {
                  addItem(
                    {
                      type:
                        (item.role && rolemap[item.role]) || MessageType.GEMINI,
                      text,
                    } as HistoryItemWithoutId,
                    i,
                  );
                }
              }
              console.clear();
              refreshStatic();
              return;
            }
            case 'list':
              addMessage({
                type: MessageType.INFO,
                content:
                  '已保存的对话列表：' +
                  (await savedChatTags()).join(', '),
                timestamp: new Date(),
              });
              return;
            default:
              addMessage({
                type: MessageType.ERROR,
                content: `未知的 /chat 命令：${subCommand}。可用命令：list, save, resume`,
                timestamp: new Date(),
              });
              return;
          }
        },
        completion: async () =>
          (await savedChatTags()).map((tag) => 'resume ' + tag),
      },
      {
        name: 'quit',
        altName: 'exit',
        description: '退出 CLI',
        action: async (mainCommand, _subCommand, _args) => {
          const now = new Date();
          const { sessionStartTime } = session.stats;
          const wallDuration = now.getTime() - sessionStartTime.getTime();

          setQuittingMessages([
            {
              type: 'user',
              text: `/${mainCommand}`,
              id: now.getTime() - 1,
            },
            {
              type: 'quit',
              duration: formatDuration(wallDuration),
              id: now.getTime(),
            },
          ]);

          setTimeout(() => {
            process.exit(0);
          }, 100);
        },
      },
      {
        name: 'compress',
        altName: 'summarize',
        description: '通过用摘要替换上下文来压缩上下文。',
        action: async (_mainCommand, _subCommand, _args) => {
          if (pendingCompressionItemRef.current !== null) {
            addMessage({
              type: MessageType.ERROR,
              content:
                '已在压缩中，请等待之前的请求完成',
              timestamp: new Date(),
            });
            return;
          }
          setPendingCompressionItem({
            type: MessageType.COMPRESSION,
            compression: {
              isPending: true,
              originalTokenCount: null,
              newTokenCount: null,
            },
          });
          try {
            const compressed = await config!
              .getGeminiClient()!
              // TODO: 从 SlashCommandProcessor 设置 CompressChat 的提示 ID。
              .tryCompressChat('提示 ID 未设置', true);
            if (compressed) {
              addMessage({
                type: MessageType.COMPRESSION,
                compression: {
                  isPending: false,
                  originalTokenCount: compressed.originalTokenCount,
                  newTokenCount: compressed.newTokenCount,
                },
                timestamp: new Date(),
              });
            } else {
              addMessage({
                type: MessageType.ERROR,
                content: '无法压缩聊天历史。',
                timestamp: new Date(),
              });
            }
          } catch (e) {
            addMessage({
              type: MessageType.ERROR,
              content: `无法压缩聊天历史：${e instanceof Error ? e.message : String(e)}`,
              timestamp: new Date(),
            });
          }
          setPendingCompressionItem(null);
        },
      },
    ];

    if (config?.getCheckpointingEnabled()) {
      commands.push({
        name: 'restore',
        description:
          '恢复工具调用。这将把对话和文件历史重置到建议工具调用时的状态',
        completion: async () => {
          const checkpointDir = config?.getProjectTempDir()
            ? path.join(config.getProjectTempDir(), 'checkpoints')
            : undefined;
          if (!checkpointDir) {
            return [];
          }
          try {
            const files = await fs.readdir(checkpointDir);
            return files
              .filter((file) => file.endsWith('.json'))
              .map((file) => file.replace('.json', ''));
          } catch (_err) {
            return [];
          }
        },
        action: async (_mainCommand, subCommand, _args) => {
          const checkpointDir = config?.getProjectTempDir()
            ? path.join(config.getProjectTempDir(), 'checkpoints')
            : undefined;

          if (!checkpointDir) {
            addMessage({
              type: MessageType.ERROR,
              content: '无法确定 .gemini 目录路径。',
              timestamp: new Date(),
            });
            return;
          }

          try {
            // 在尝试读取之前确保目录存在。
            await fs.mkdir(checkpointDir, { recursive: true });
            const files = await fs.readdir(checkpointDir);
            const jsonFiles = files.filter((file) => file.endsWith('.json'));

            if (!subCommand) {
              if (jsonFiles.length === 0) {
                addMessage({
                  type: MessageType.INFO,
                  content: '未找到可恢复的工具调用。',
                  timestamp: new Date(),
                });
                return;
              }
              const truncatedFiles = jsonFiles.map((file) => {
                const components = file.split('.');
                if (components.length <= 1) {
                  return file;
                }
                components.pop();
                return components.join('.');
              });
              const fileList = truncatedFiles.join('\n');
              addMessage({
                type: MessageType.INFO,
                content: `可恢复的工具调用：\n\n${fileList}`,
                timestamp: new Date(),
              });
              return;
            }

            const selectedFile = subCommand.endsWith('.json')
              ? subCommand
              : `${subCommand}.json`;

            if (!jsonFiles.includes(selectedFile)) {
              addMessage({
                type: MessageType.ERROR,
                content: `文件未找到：${selectedFile}`,
                timestamp: new Date(),
              });
              return;
            }

            const filePath = path.join(checkpointDir, selectedFile);
            const data = await fs.readFile(filePath, 'utf-8');
            const toolCallData = JSON.parse(data);

            if (toolCallData.history) {
              loadHistory(toolCallData.history);
            }

            if (toolCallData.clientHistory) {
              await config
                ?.getGeminiClient()
                ?.setHistory(toolCallData.clientHistory);
            }

            if (toolCallData.commitHash) {
              await gitService?.restoreProjectFromSnapshot(
                toolCallData.commitHash,
              );
              addMessage({
                type: MessageType.INFO,
                content: `已将项目恢复到工具调用前的状态。`,
                timestamp: new Date(),
              });
            }

            return {
              type: 'tool',
              toolName: toolCallData.toolCall.name,
              toolArgs: toolCallData.toolCall.args,
            };
          } catch (error) {
            addMessage({
              type: MessageType.ERROR,
              content: `无法读取可恢复的工具调用。错误信息：${error}`,
              timestamp: new Date(),
            });
          }
        },
      });
    }
    return commands;
  }, [
    addMessage,
    openEditorDialog,
    toggleCorgiMode,
    savedChatTags,
    config,
    showToolDescriptions,
    session,
    gitService,
    loadHistory,
    addItem,
    setQuittingMessages,
    pendingCompressionItemRef,
    setPendingCompressionItem,
    clearItems,
    refreshStatic,
  ]);

  const handleSlashCommand = useCallback(
    async (
      rawQuery: PartListUnion,
    ): Promise<SlashCommandProcessorResult | false> => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      const trimmed = rawQuery.trim();
      if (!trimmed.startsWith('/') && !trimmed.startsWith('?')) {
        return false;
      }

      const userMessageTimestamp = Date.now();
      if (trimmed !== '/quit' && trimmed !== '/exit') {
        addItem(
          { type: MessageType.USER, text: trimmed },
          userMessageTimestamp,
        );
      }

      const parts = trimmed.substring(1).trim().split(/\s+/);
      const commandPath = parts.filter((p) => p); // 命令的部分，例如 ['memory', 'add']

      // --- 开始新的树遍历逻辑 ---

      let currentCommands = commands;
      let commandToExecute: SlashCommand | undefined;
      let pathIndex = 0;

      for (const part of commandPath) {
        const foundCommand = currentCommands.find(
          (cmd) => cmd.name === part || cmd.altName === part,
        );

        if (foundCommand) {
          commandToExecute = foundCommand;
          pathIndex++;
          if (foundCommand.subCommands) {
            currentCommands = foundCommand.subCommands;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      if (commandToExecute) {
        const args = parts.slice(pathIndex).join(' ');

        if (commandToExecute.action) {
          const result = await commandToExecute.action(commandContext, args);

          if (result) {
            switch (result.type) {
              case 'tool':
                return {
                  type: 'schedule_tool',
                  toolName: result.toolName,
                  toolArgs: result.toolArgs,
                };
              case 'message':
                addItem(
                  {
                    type:
                      result.messageType === 'error'
                        ? MessageType.ERROR
                        : MessageType.INFO,
                    text: result.content,
                  },
                  Date.now(),
                );
                return { type: 'handled' };
              case 'dialog':
                switch (result.dialog) {
                  case 'help':
                    setShowHelp(true);
                    return { type: 'handled' };
                  case 'auth':
                    openAuthDialog();
                    return { type: 'handled' };
                  case 'theme':
                    openThemeDialog();
                    return { type: 'handled' };
                  case 'privacy':
                    openPrivacyNotice();
                    return { type: 'handled' };
                  default: {
                    const unhandled: never = result.dialog;
                    throw new Error(
                      `未处理的斜杠命令结果：${unhandled}`,
                    );
                  }
                }
              default: {
                const unhandled: never = result;
                throw new Error(`未处理的斜杠命令结果：${unhandled}`);
              }
            }
          }

          return { type: 'handled' };
        } else if (commandToExecute.subCommands) {
          const helpText = `命令 '/${commandToExecute.name}' 需要子命令。可用命令：\n${commandToExecute.subCommands
            .map((sc) => `  - ${sc.name}: ${sc.description || ''}`)
            .join('\n')}`;
          addMessage({
            type: MessageType.INFO,
            content: helpText,
            timestamp: new Date(),
          });
          return { type: 'handled' };
        }
      }

      // --- 结束新的树遍历逻辑 ---

      // --- 旧的回退逻辑（用于尚未迁移的命令）---

      const mainCommand = parts[0];
      const subCommand = parts[1];
      const legacyArgs = parts.slice(2).join(' ');

      for (const cmd of legacyCommands) {
        if (mainCommand === cmd.name || mainCommand === cmd.altName) {
          const actionResult = await cmd.action(
            mainCommand,
            subCommand,
            legacyArgs,
          );

          if (actionResult?.type === 'tool') {
            return {
              type: 'schedule_tool',
              toolName: actionResult.toolName,
              toolArgs: actionResult.toolArgs,
            };
          }
          if (actionResult?.type === 'message') {
            addItem(
              {
                type:
                  actionResult.messageType === 'error'
                    ? MessageType.ERROR
                    : MessageType.INFO,
                text: actionResult.content,
              },
              Date.now(),
            );
          }
          return { type: 'handled' };
        }
      }

      addMessage({
        type: MessageType.ERROR,
        content: `未知命令：${trimmed}`,
        timestamp: new Date(),
      });
      return { type: 'handled' };
    },
    [
      addItem,
      setShowHelp,
      openAuthDialog,
      commands,
      legacyCommands,
      commandContext,
      addMessage,
      openThemeDialog,
      openPrivacyNotice,
    ],
  );

  const allCommands = useMemo(() => {
    // 将旧命令适配到新的 SlashCommand 接口
    const adaptedLegacyCommands: SlashCommand[] = legacyCommands.map(
      (legacyCmd) => ({
        name: legacyCmd.name,
        altName: legacyCmd.altName,
        description: legacyCmd.description,
        action: async (_context: CommandContext, args: string) => {
          const parts = args.split(/\s+/);
          const subCommand = parts[0] || undefined;
          const restOfArgs = parts.slice(1).join(' ') || undefined;

          return legacyCmd.action(legacyCmd.name, subCommand, restOfArgs);
        },
        completion: legacyCmd.completion
          ? async (_context: CommandContext, _partialArg: string) =>
              legacyCmd.completion!()
          : undefined,
      }),
    );

    const newCommandNames = new Set(commands.map((c) => c.name));
    const filteredAdaptedLegacy = adaptedLegacyCommands.filter(
      (c) => !newCommandNames.has(c.name),
    );

    return [...commands, ...filteredAdaptedLegacy];
  }, [commands, legacyCommands]);

  return {
    handleSlashCommand,
    slashCommands: allCommands,
    pendingHistoryItems,
    commandContext,
  };
};