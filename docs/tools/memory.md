# 内存工具（`save_memory`）

本文档描述了 Gemini CLI 的 `save_memory` 工具。

## 描述

使用 `save_memory` 可在 Gemini CLI 会话之间保存和调用信息。通过 `save_memory`，你可以指示 CLI 跨会话记住关键细节，从而提供个性化和定向的帮助。

### 参数

`save_memory` 接受一个参数：

- `fact`（字符串，必需）：要记住的具体事实或信息片段。这应该是一个用自然语言编写的清晰、独立的陈述。

## 如何在 Gemini CLI 中使用 `save_memory`

该工具将提供的 `fact` 追加到用户主目录中的特殊文件 `GEMINI.md`（`~/.iflycode/GEMINI.md`）。此文件可以配置为其他名称。

添加后，这些事实将存储在 `## Gemini Added Memories` 部分下。该文件将在后续会话中作为上下文加载，使 CLI 能够调用已保存的信息。

用法：

```
save_memory(fact="你的事实在这里。")
```

### `save_memory` 示例

记住用户偏好：

```
save_memory(fact="我偏好的编程语言是 Python。")
```

存储项目特定的细节：

```
save_memory(fact="我当前正在处理的项目名为 'gemini-cli'。")
```

## 重要说明

- **常规使用**：该工具应用于存储简洁、重要的事实。它不适用于存储大量数据或对话历史。
- **内存文件**：内存文件是一个纯文本 Markdown 文件，如有需要，你可以手动查看和编辑它。