# iFlyCode 项目逻辑分析

## 概述

iFlyCode 是一个交互式命令行 AI 助手 (CLI)，专注于软件工程任务。它通过结合大型语言模型 (LLM) 的智能和一套预定义的工具集，帮助用户执行代码分析、重构、测试和新应用开发等任务。

该系统的核心流程围绕着一个循环：接收用户输入、生成模型响应、执行工具调用、处理工具结果，并将结果反馈给模型以进行进一步交互。

## 核心交互流程

1.  **用户输入 (User Input):**
    *   用户通过命令行向 iFlyCode 提供指令或问题。
    *   这可以是简单的查询（如 "列出这里的文件"）、复杂的任务请求（如 "重构 `src/auth.py` 以使用 `requests` 库"）或新应用的开发请求。
    *   输入被封装成一个消息（`PartListUnion` 或 `Content`），准备发送给 LLM。

2.  **模型响应 (Model Response):**
    *   iFlyCode 将用户输入（以及之前的对话历史）发送给配置的 LLM（如 Google Gemini）。
    *   模型处理输入并生成响应。
    *   响应可以是：
        *   **文本内容 (Content):** 直接回答用户问题或提供解释。
        *   **思考 (Thought):** 模型内部的推理过程，不直接展示给用户，但用于指导后续操作。
        *   **工具调用请求 (Tool Call Request):** 模型决定需要执行一个或多个工具来完成任务。它会生成一个或多个 `ToolCallRequestInfo` 对象，其中包含工具名称 (`name`)、调用 ID (`callId`) 和执行参数 (`args`)。这些信息封装在 `ServerGeminiStreamEvent` (类型为 `ToolCallRequest`) 中。

3.  **工具调用 (Tool Call):**
    *   当模型响应包含工具调用请求时，iFlyCode 的核心逻辑（通常在 `Turn` 类中）会拦截这些请求。
    *   在执行工具之前，系统通常会根据工具的 `shouldConfirmExecute` 方法判断是否需要用户确认。如果需要，会向用户展示工具将要执行的操作（例如，将要运行的命令或要修改的文件差异），并等待用户批准。
    *   一旦获得执行许可（或工具本身不需要确认），系统会调用相应工具的 `execute` 方法。
    *   工具执行是异步的，可能涉及文件系统操作 (`read_file`, `write_file`, `glob`)、运行 shell 命令 (`run_shell_command`)、网络请求或与外部服务（如 MCP 服务器）交互。

4.  **工具响应 (Tool Result):**
    *   工具执行完成后，会返回一个 `ToolResult` 对象。
    *   `ToolResult` 包含几个关键部分：
        *   `summary`: 工具执行的简短摘要。
        *   `llmContent`: 旨在包含在 LLM 历史中的内容，代表工具执行的客观结果（例如，文件内容、命令输出）。这是模型在下一轮交互中理解工具执行情况的主要依据。
        *   `returnDisplay`: 用于用户界面显示的 Markdown 字符串或文件差异 (`FileDiff`)，提供用户友好的结果展示。
    *   这个 `ToolResult` 会被包装成一个 `ToolCallResponseInfo` 对象，并作为 `ServerGeminiStreamEvent` (类型为 `ToolCallResponse`) 发送回客户端/UI 进行展示。
    *   同时，`llmContent` 部分会被构造成一个 `Content` 对象（角色为 'tool'），并添加到对话历史 (`GeminiChat.history`) 中。

5.  **循环与历史管理:**
    *   工具执行的结果（特别是 `llmContent`）被添加到对话历史中。
    *   模型可以根据这些结果生成新的响应，可能包括新的工具调用请求。
    *   `GeminiChat` 类负责管理对话历史 (`history`)，包括添加新轮次、根据有效性清理历史（`extractCuratedHistory`）以及确保历史记录在用户和模型/工具之间正确交替。
    *   `Turn` 类管理单次用户请求的完整交互过程，直到模型生成最终的文本响应或达到某种结束条件。

## 关键组件

*   **`GeminiChat`:** 管理与 LLM 的核心交互，包括发送消息、接收流式响应、维护对话历史。
*   **`Turn`:** 管理单次用户请求的完整回合，处理模型流中的事件（内容、思考、工具调用请求），并协调工具的执行。
*   **`Tool`:** 定义了工具的接口。所有具体工具（如 `ReadFileTool`, `ShellTool`）都实现此接口，提供 `schema`（定义参数）、`execute`（执行逻辑）和 `shouldConfirmExecute`（确认逻辑）。
*   **`ServerToolCallRequestEvent` / `ServerToolCallResponseEvent`:** 这些是核心的事件类型，用于在服务器逻辑和客户端/UI之间传递工具调用的请求和结果。
*   **`ToolResult`:** 标准化的工具执行结果结构，确保模型和用户界面都能以一致的方式处理工具输出。

## 总结

iFlyCode 的工作流程是一个由 LLM 驱动的、工具增强的交互式循环。用户输入启动流程，模型决定需要哪些工具，系统执行工具并收集结果，然后将结果反馈给模型以继续交互，最终完成用户的任务。