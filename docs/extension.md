# Gemini CLI 扩展

Gemini CLI 支持扩展，可用于配置和扩展其功能。

## 工作原理

启动时，Gemini CLI 会在两个位置查找扩展：

1.  `<workspace>/.iflycode/extensions`
2.  `<home>/.iflycode/extensions`

Gemini CLI 会从这两个位置加载所有扩展。如果同名扩展在两个位置都存在，则工作区目录中的扩展优先。

在每个位置中，单个扩展以包含 `gemini-extension.json` 文件的目录形式存在。例如：

`<workspace>/.iflycode/extensions/my-extension/gemini-extension.json`

### `gemini-extension.json`

`gemini-extension.json` 文件包含扩展的配置。该文件具有以下结构：

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "GEMINI.md",
  "excludeTools": ["run_shell_command"]
}
```

- `name`: 扩展的名称。用于唯一标识该扩展。这应该与你的扩展目录名称一致。
- `version`: 扩展的版本。
- `mcpServers`: 要配置的 MCP 服务器映射。键是服务器名称，值是服务器配置。这些服务器将在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP 服务器一样。如果扩展和 `settings.json` 文件都配置了同名的 MCP 服务器，则 `settings.json` 文件中定义的服务器优先。
- `contextFileName`: 包含扩展上下文的文件名称。这将用于从工作区加载上下文。如果未使用此属性，但在你的扩展目录中存在 `GEMINI.md` 文件，则会加载该文件。
- `excludeTools`: 要从模型中排除的工具名称数组。你也可以为支持该功能的工具指定命令级限制，例如 `run_shell_command` 工具。例如，`"excludeTools": ["run_shell_command(rm -rf)"]` 将阻止执行 `rm -rf` 命令。

当 Gemini CLI 启动时，它会加载所有扩展并合并其配置。如果有冲突，工作区配置优先。