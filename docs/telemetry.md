# Gemini CLI 可观测性指南

遥测提供有关 Gemini CLI 性能、健康状况和使用情况的数据。通过启用遥测，你可以通过追踪、指标和结构化日志来监控操作、调试问题并优化工具使用。

Gemini CLI 的遥测系统基于 **[OpenTelemetry] (OTEL)** 标准构建，允许你将数据发送到任何兼容的后端。

[OpenTelemetry]: https://opentelemetry.io/

## 启用遥测

你可以通过多种方式启用遥测。配置主要通过 [`.iflycode/settings.json` 文件](./cli/configuration.md) 和环境变量进行管理，但 CLI 标志可以在特定会话中覆盖这些设置。

### 优先级顺序

以下列出了应用遥测设置的优先级，列表中位置越高的项优先级越高：

1.  **CLI 标志（用于 `gemini` 命令）：**
    - `--telemetry` / `--no-telemetry`：覆盖 `telemetry.enabled`。
    - `--telemetry-target <local|gcp>`：覆盖 `telemetry.target`。
    - `--telemetry-otlp-endpoint <URL>`：覆盖 `telemetry.otlpEndpoint`。
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`：覆盖 `telemetry.logPrompts`。

1.  **环境变量：**
    - `OTEL_EXPORTER_OTLP_ENDPOINT`：覆盖 `telemetry.otlpEndpoint`。

1.  **工作区设置文件（`.iflycode/settings.json`）：** 此项目特定文件中 `telemetry` 对象的值。

1.  **用户设置文件（`~/.iflycode/settings.json`）：** 此全局用户文件中 `telemetry` 对象的值。

1.  **默认值：** 如果未通过上述任何方式设置，则应用以下默认值。
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**对于 `npm run telemetry -- --target=<gcp|local>` 脚本：**
该脚本的 `--target` 参数仅在该脚本执行期间和目的上覆盖 `telemetry.target`（即选择要启动的收集器）。它不会永久更改你的 `settings.json`。该脚本首先会查看 `settings.json` 中的 `telemetry.target`，以用作其默认值。

### 示例设置

以下代码可以添加到你的工作区（`.iflycode/settings.json`）或用户（`~/.iflycode/settings.json`）设置中，以启用遥测并将输出发送到 Google Cloud：

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

## 运行 OTEL 收集器

OTEL 收集器是一个接收、处理和导出遥测数据的服务。
CLI 使用 OTLP/gRPC 协议发送数据。

在 [文档][otel-config-docs] 中了解有关 OTEL 导出器标准配置的更多信息。

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### 本地

使用 `npm run telemetry -- --target=local` 命令来自动化设置本地遥测管道的过程，包括在你的 `.iflycode/settings.json` 文件中配置必要的设置。底层脚本安装 `otelcol-contrib`（OpenTelemetry 收集器）和 `jaeger`（用于查看追踪的 Jaeger UI）。使用方法如下：

1.  **运行命令：**
    从仓库根目录执行以下命令：

    ```bash
    npm run telemetry -- --target=local
    ```

    该脚本将：
    - 如需要，下载 Jaeger 和 OTEL。
    - 启动本地 Jaeger 实例。
    - 启动配置为接收来自 Gemini CLI 数据的 OTEL 收集器。
    - 自动在你的工作区设置中启用遥测。
    - 退出时，禁用遥测。

1.  **查看追踪信息：**
    打开你的网页浏览器，访问 **http://localhost:16686** 以访问 Jaeger UI。在这里你可以查看 Gemini CLI 操作的详细追踪信息。

1.  **检查日志和指标：**
    该脚本将 OTEL 收集器输出（包括日志和指标）重定向到 `~/.iflycode/tmp/<projectHash>/otel/collector.log`。脚本将提供查看链接和用于实时查看你的遥测数据（追踪、指标、日志）的命令。

1.  **停止服务：**
    在运行脚本的终端中按下 `Ctrl+C` 以停止 OTEL 收集器和 Jaeger 服务。

### Google Cloud

使用 `npm run telemetry -- --target=gcp` 命令来自动化设置一个将数据转发到你的 Google Cloud 项目的本地 OpenTelemetry 收集器，包括在你的 `.iflycode/settings.json` 文件中配置必要的设置。底层脚本安装 `otelcol-contrib`。使用方法如下：

1.  **前提条件：**
    - 拥有一个 Google Cloud 项目 ID。
    - 导出 `GOOGLE_CLOUD_PROJECT` 环境变量，以便 OTEL 收集器可以使用它。
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - 与 Google Cloud 进行身份验证（例如，运行 `gcloud auth application-default login` 或确保设置了 `GOOGLE_APPLICATION_CREDENTIALS`）。
    - 确保你的 Google Cloud 账户/服务账户具有必要的 IAM 角色："Cloud Trace Agent"、"Monitoring Metric Writer" 和 "Logs Writer"。

1.  **运行命令：**
    从仓库根目录执行以下命令：

    ```bash
    npm run telemetry -- --target=gcp
    ```

    该脚本将：
    - 如需要，下载 `otelcol-contrib` 二进制文件。
    - 启动配置为接收来自 Gemini CLI 数据并将其导出到你指定的 Google Cloud 项目的 OTEL 收集器。
    - 自动在你的工作区设置（`.iflycode/settings.json`）中启用遥测并禁用沙箱模式。
    - 提供直接链接以在 Google Cloud Console 中查看追踪、指标和日志。
    - 在退出（Ctrl+C）时，尝试恢复你原来的遥测和沙箱设置。

1.  **运行 Gemini CLI：**
    在另一个终端中运行你的 Gemini CLI 命令。这将生成收集器捕获的遥测数据。

1.  **在 Google Cloud 中查看遥测数据：**
    使用脚本提供的链接导航到 Google Cloud Console 并查看你的追踪、指标和日志。

1.  **检查本地收集器日志：**
    该脚本将本地 OTEL 收集器输出重定向到 `~/.iflycode/tmp/<projectHash>/otel/collector-gcp.log`。脚本提供了查看链接和用于实时查看收集器日志的命令。

1.  **停止服务：**
    在运行脚本的终端中按下 `Ctrl+C` 以停止 OTEL 收集器。

## 日志和指标参考

以下部分描述了为 Gemini CLI 生成的日志和指标的结构。

- 所有日志和指标上都包含一个 `sessionId` 作为公共属性。

### 日志

日志是特定事件的时间戳记录。Gemini CLI 记录以下事件：

- `gemini_cli.config`：此事件在 CLI 启动时发生一次，包含 CLI 的配置。
  - **属性：**
    - `model` (字符串)
    - `embedding_model` (字符串)
    - `sandbox_enabled` (布尔值)
    - `core_tools_enabled` (字符串)
    - `approval_mode` (字符串)
    - `api_key_enabled` (布尔值)
    - `vertex_ai_enabled` (布尔值)
    - `code_assist_enabled` (布尔值)
    - `log_prompts_enabled` (布尔值)
    - `file_filtering_respect_git_ignore` (布尔值)
    - `debug_mode` (布尔值)
    - `mcp_servers` (字符串)

- `gemini_cli.user_prompt`：当用户提交提示时发生此事件。
  - **属性：**
    - `prompt_length`
    - `prompt`（如果 `log_prompts_enabled` 配置为 `false`，则不包含此属性）
    - `auth_type`

- `gemini_cli.tool_call`：每次函数调用时发生此事件。
  - **属性：**
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (布尔值)
    - `decision` (字符串："accept"、"reject" 或 "modify"，如适用)
    - `error` (如适用)
    - `error_type` (如适用)

- `gemini_cli.api_request`：当向 Gemini API 发出请求时发生此事件。
  - **属性：**
    - `model`
    - `request_text` (如适用)

- `gemini_cli.api_error`：如果 API 请求失败，则发生此事件。
  - **属性：**
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `gemini_cli.api_response`：收到 Gemini API 的响应时发生此事件。
  - **属性：**
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (可选)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (如适用)
    - `auth_type`

- `gemini_cli.flash_fallback`：当 Gemini CLI 切换到 flash 作为回退时发生此事件。
  - **属性：**
    - `auth_type`

### 指标

指标是随时间推移的行为数值测量。Gemini CLI 收集以下指标：

- `gemini_cli.session.count` (计数器，整数)：每次 CLI 启动时递增一次。

- `gemini_cli.tool.call.count` (计数器，整数)：统计工具调用次数。
  - **属性：**
    - `function_name`
    - `success` (布尔值)
    - `decision` (字符串："accept"、"reject" 或 "modify"，如适用)

- `gemini_cli.tool.call.latency` (直方图，毫秒)：测量工具调用延迟。
  - **属性：**
    - `function_name`
    - `decision` (字符串："accept"、"reject" 或 "modify"，如适用)

- `gemini_cli.api.request.count` (计数器，整数)：统计所有 API 请求次数。
  - **属性：**
    - `model`
    - `status_code`
    - `error_type` (如适用)

- `gemini_cli.api.request.latency` (直方图，毫秒)：测量 API 请求延迟。
  - **属性：**
    - `model`

- `gemini_cli.token.usage` (计数器，整数)：统计使用的 token 数量。
  - **属性：**
    - `model`
    - `type` (字符串："input"、"output"、"thought"、"cache" 或 "tool")

- `gemini_cli.file.operation.count` (计数器，整数)：统计文件操作次数。
  - **属性：**
    - `operation` (字符串："create"、"read"、"update")：文件操作类型。
    - `lines` (整数，如适用)：文件中的行数。
    - `mimetype` (字符串，如适用)：文件的 MIME 类型。
    - `extension` (字符串，如适用)：文件的扩展名。