# Gemini CLI Core：工具 API

Gemini CLI 核心（`packages/core`）提供了一套强大的系统，用于定义、注册和执行工具。这些工具扩展了 Gemini 模型的功能，使其能够与本地环境交互、获取网页内容，并执行超出简单文本生成的各种操作。

## 核心概念

- **工具（`tools.ts`）：** 一个接口和基类（`BaseTool`），用于定义所有工具的契约。每个工具必须包含：
  - `name`：一个唯一的内部名称（用于对 Gemini 的 API 调用）。
  - `displayName`：一个用户友好的名称。
  - `description`：对工具功能的清晰说明，提供给 Gemini 模型。
  - `parameterSchema`：一个 JSON schema，定义了工具接受的参数。这对 Gemini 模型理解如何正确调用工具至关重要。
  - `validateToolParams()`：一个用于验证传入参数的方法。
  - `getDescription()`：一个方法，用于在执行前提供人类可读的描述，说明工具将如何使用特定参数进行操作。
  - `shouldConfirmExecute()`：一个方法，用于确定在执行前是否需要用户确认（例如，对于可能具有破坏性的操作）。
  - `execute()`：执行工具操作的核心方法，并返回一个 `ToolResult`。

- **`ToolResult`（`tools.ts`）：** 一个定义工具执行结果结构的接口：
  - `llmContent`：一个事实性的字符串内容，包含在发送回 LLM 的历史记录中以提供上下文。
  - `returnDisplay`：一个用户友好的字符串（通常为 Markdown）或特殊对象（如 `FileDiff`），用于在 CLI 中显示。

- **工具注册表（`tool-registry.ts`）：** 一个类（`ToolRegistry`），负责：
  - **注册工具：** 保存所有可用内置工具的集合（例如 `ReadFileTool`、`ShellTool`）。
  - **发现工具：** 它还可以动态发现工具：
    - **基于命令的发现：** 如果在设置中配置了 `toolDiscoveryCommand`，则执行此命令。它应输出描述自定义工具的 JSON，然后将其注册为 `DiscoveredTool` 实例。
    - **基于 MCP 的发现：** 如果配置了 `mcpServerCommand`，注册表可以连接到 Model Context Protocol（MCP）服务器，列出并注册工具（`DiscoveredMCPTool`）。
  - **提供 schema：** 向 Gemini 模型暴露所有已注册工具的 `FunctionDeclaration` schema，这样模型就知道有哪些工具可用以及如何使用它们。
  - **检索工具：** 允许核心通过名称获取特定工具以执行。

## 内置工具

核心附带了一套预定义工具，通常位于 `packages/core/src/tools/`。这些包括：

- **文件系统工具：**
  - `LSTool`（`ls.ts`）：列出目录内容。
  - `ReadFileTool`（`read-file.ts`）：读取单个文件的内容。它接受一个 `absolute_path` 参数，该参数必须是绝对路径。
  - `WriteFileTool`（`write-file.ts`）：将内容写入文件。
  - `GrepTool`（`grep.ts`）：在文件中搜索模式。
  - `GlobTool`（`glob.ts`）：查找匹配 glob 模式的文件。
  - `EditTool`（`edit.ts`）：对文件进行就地修改（通常需要确认）。
  - `ReadManyFilesTool`（`read-many-files.ts`）：读取并连接多个文件或 glob 模式的内容（由 CLI 中的 `@` 命令使用）。
- **执行工具：**
  - `ShellTool`（`shell.ts`）：执行任意 shell 命令（需要仔细的沙箱处理和用户确认）。
- **网络工具：**
  - `WebFetchTool`（`web-fetch.ts`）：从 URL 获取内容。
  - `WebSearchTool`（`web-search.ts`）：执行网络搜索。
- **内存工具：**
  - `MemoryTool`（`memoryTool.ts`）：与 AI 的内存交互。

每个工具都继承自 `BaseTool` 并实现其特定功能所需的必要方法。

## 工具执行流程

1. **模型请求：** Gemini 模型根据用户的提示和提供的工具 schema，决定使用某个工具，并在其响应中返回一个 `FunctionCall` 部分，指定工具名称和参数。
2. **核心接收请求：** 核心解析此 `FunctionCall`。
3. **工具检索：** 在 `ToolRegistry` 中查找请求的工具。
4. **参数验证：** 调用工具的 `validateToolParams()` 方法。
5. **确认（如需要）：**
   - 调用工具的 `shouldConfirmExecute()` 方法。
   - 如果返回确认细节，核心会将此信息传回 CLI，CLI 会提示用户。
   - 用户的决定（例如继续、取消）会发送回核心。
6. **执行：** 如果参数已验证且用户已确认（或无需确认），核心将使用提供的参数和 `AbortSignal`（用于潜在的取消操作）调用工具的 `execute()` 方法。
7. **结果处理：** 核心接收来自 `execute()` 的 `ToolResult`。
8. **响应模型：** 来自 `ToolResult` 的 `llmContent` 被打包为 `FunctionResponse` 并发送回 Gemini 模型，以便它可以继续生成面向用户的响应。
9. **显示给用户：** 来自 `ToolResult` 的 `returnDisplay` 被发送到 CLI，以显示工具执行的操作。

## 通过自定义工具扩展

虽然在提供的文件中并未明确将用户直接以编程方式注册新工具作为典型终端用户的主要工作流程，但架构通过以下方式支持扩展：

- **基于命令的发现：** 高级用户或项目管理员可以在 `settings.json` 中定义 `toolDiscoveryCommand`。当 Gemini CLI 核心运行此命令时，它应输出一个包含 `FunctionDeclaration` 对象的 JSON 数组。核心随后会将这些声明作为 `DiscoveredTool` 实例提供。相应的 `toolCallCommand` 将负责实际执行这些自定义工具。
- **MCP 服务器：** 对于更复杂的场景，可以通过 `settings.json` 中的 `mcpServers` 设置配置一个或多个 MCP 服务器。Gemini CLI 核心随后可以发现并使用这些服务器暴露的工具。如前所述，如果你有多个 MCP 服务器，工具名称将以前缀形式加上配置中的服务器名称（例如 `serverAlias__actualToolName`）。

此工具系统提供了一种灵活而强大的方式来增强 Gemini 模型的功能，使 Gemini CLI 成为适用于广泛任务的多功能助手。