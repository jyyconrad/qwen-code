# 网络搜索工具（`google_web_search`）

本文档描述了 `google_web_search` 工具。

## 描述

使用 `google_web_search` 通过 Gemini API 执行 Google 搜索。`google_web_search` 工具会返回带有来源的网页搜索结果摘要。

### 参数

`google_web_search` 接收一个参数：

- `query`（字符串，必填）：搜索查询内容。

## 如何在 Gemini CLI 中使用 `google_web_search`

`google_web_search` 工具将查询发送至 Gemini API，随后执行网络搜索。`google_web_search` 将根据搜索结果返回生成的响应，包括引用和来源。

使用方式：

```
google_web_search(query="你的查询内容。")
```

## `google_web_search` 示例

获取某个主题的信息：

```
google_web_search(query="AI 驱动的代码生成最新进展")
```

## 重要说明

- **返回的响应**：`google_web_search` 工具返回的是经过处理的结果摘要，而不是原始的搜索结果列表。
- **引用来源**：响应中包含用于生成摘要的来源引用。