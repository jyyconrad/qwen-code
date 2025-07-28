# Gemini CLI

在 Gemini CLI 中，`packages/cli` 是用户与 Gemini AI 模型及其相关工具进行提示收发的前端界面。有关 Gemini CLI 的总体概述，请参阅[主文档页面](../index.md)。

## 浏览本部分

- **[身份验证](./authentication.md)：** 有关与 Google AI 服务建立身份验证的指南。
- **[命令](./commands.md)：** Gemini CLI 命令的参考文档（例如 `/help`、`/tools`、`/theme`）。
- **[配置](./configuration.md)：** 使用配置文件自定义 Gemini CLI 行为的指南。
- **[令牌缓存](./token-caching.md)：** 通过令牌缓存优化 API 成本。
- **[主题](./themes.md)：** 使用不同主题自定义 CLI 外观的指南。
- **[教程](tutorials.md)：** 教程展示如何使用 Gemini CLI 自动化开发任务。

## 非交互模式

Gemini CLI 可以在非交互模式下运行，这对于脚本编写和自动化非常有用。在此模式下，你可以将输入传递给 CLI，它将执行命令然后退出。

以下示例从终端将命令传递给 Gemini CLI：

```bash
echo "What is fine tuning?" | gemini
```

Gemini CLI 执行该命令并将输出打印到你的终端。请注意，你也可以使用 `--prompt` 或 `-p` 标志实现相同的行为。例如：

```bash
gemini -p "What is fine tuning?"
```