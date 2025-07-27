# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

本仓库包含 Gemini CLI，这是一个命令行 AI 工作流工具，可连接到您的工具，理解您的代码并加速您的工作流程。

使用 Gemini CLI，您可以：

- 在 Gemini 的 100 万 token 上下文窗口内和之外查询和编辑大型代码库。
- 利用 Gemini 的多模态功能，从 PDF 或草图生成新应用。
- 自动化操作任务，例如查询拉取请求或处理复杂的变基。
- 使用工具和 MCP 服务器连接新功能，包括 [使用 Imagen、Veo 或 Lyria 生成媒体](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- 使用 Gemini 内置的 [Google 搜索](https://ai.google.dev/gemini-api/docs/grounding) 工具为您的查询提供依据。

## 快速开始

1. **前提条件：** 确保您已安装 [Node.js 版本 20](https://nodejs.org/en/download) 或更高版本。
2. **运行 CLI：** 在终端中执行以下命令：

   ```bash
   npx https://github.com/google-gemini/gemini-cli
   ```

   或者使用以下命令安装：

   ```bash
   npm install -g @google/gemini-cli
   ```

   然后，从任意位置运行 CLI：

   ```bash
   gemini
   ```

3. **选择配色方案**
4. **身份验证：** 出现提示时，使用您的个人 Google 账户登录。这将为您提供每分钟最多 60 个模型请求和每天最多 1,000 个模型请求的权限。

您现在可以使用 Gemini CLI 了！

### 使用 Gemini API 密钥：

Gemini API 提供了免费层级，每天可使用 Gemini 2.5 Pro 进行 [100 次请求](https://ai.google.dev/gemini-api/docs/rate-limits#free-tier)，并允许您控制所使用的模型，以及通过付费计划访问更高的请求限制：

1. 从 [Google AI Studio](https://aistudio.google.com/apikey) 生成一个密钥。
2. 在终端中将其设置为环境变量。将 `YOUR_API_KEY` 替换为您生成的密钥。

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

3. （可选）在 API 密钥页面上将您的 Gemini API 项目升级到付费计划（将自动解锁 [Tier 1 请求限制](https://ai.google.dev/gemini-api/docs/rate-limits#tier-1)）

### 使用 Vertex AI API 密钥：

Vertex AI API 提供了 [免费层级](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview)，通过 Express 模式使用 Gemini 2.5 Pro，允许您控制所使用的模型，并通过计费账户访问更高的请求限制：

1. 从 [Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys) 生成一个密钥。
2. 在终端中将其设置为环境变量。将 `YOUR_API_KEY` 替换为您生成的密钥，并将 `GOOGLE_GENAI_USE_VERTEXAI` 设置为 true：

   ```bash
   export GOOGLE_API_KEY="YOUR_API_KEY"
   export GOOGLE_GENAI_USE_VERTEXAI=true
   ```

3. （可选）在您的项目中添加计费账户以访问 [更高的使用限制](https://cloud.google.com/vertex-ai/generative-ai/docs/quotas)

有关其他身份验证方法（包括 Google Workspace 账户），请参阅 [身份验证](./docs/cli/authentication.md) 指南。

## 示例

一旦 CLI 运行起来，您就可以从 shell 中开始与 Gemini 交互。

您可以从一个新目录开始一个项目：

```sh
cd new-project/
gemini
> 请为我编写一个 Gemini Discord 机器人，使用我将提供的 FAQ.md 文件来回答问题
```

或者处理现有项目：

```sh
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> 请给我总结一下昨天的所有更改
```

### 下一步

- 了解如何 [为源码做贡献或构建源码](./CONTRIBUTING.md)。
- 探索可用的 **[CLI 命令](./docs/cli/commands.md)**。
- 如果遇到任何问题，请查看 **[故障排除指南](./docs/troubleshooting.md)**。
- 有关更全面的文档，请参阅 [完整文档](./docs/index.md)。
- 查看一些 [热门任务](#热门任务) 以获得更多灵感。
- 查看我们的 **[官方路线图](./ROADMAP.md)**

### 故障排除

如果您遇到问题，请前往 [故障排除指南](docs/troubleshooting.md)。

## 热门任务

### 探索新的代码库

首先使用 `cd` 进入一个现有的或新克隆的仓库，然后运行 `gemini`。

```text
> 描述该系统架构的主要组成部分。
```

```text
> 当前有哪些安全机制？
```

### 使用您现有的代码

```text
> 为 GitHub 问题 #123 实现一个初步方案。
```

```text
> 帮我将此代码库迁移到最新版本的 Java。先制定一个计划。
```

### 自动化您的工作流程

使用 MCP 服务器将您的本地系统工具与企业协作套件集成。

```text
> 请为我制作一个幻灯片，展示过去 7 天的 git 历史，按功能和团队成员分组。
```

```text
> 创建一个全屏网页应用，作为墙上的展示，显示我们互动最多的 GitHub 问题。
```

### 与您的系统交互

```text
> 将此目录中的所有图像转换为 png 格式，并根据 exif 数据中的日期重命名。
```

```text
> 按支出月份整理我的 PDF 发票。
```

### 卸载

有关卸载说明，请前往 [卸载指南](docs/Uninstall.md)。

## 服务条款和隐私声明

有关适用于您使用 Gemini CLI 的服务条款和隐私声明的详细信息，请参阅 [服务条款和隐私声明](./docs/tos-privacy.md)。
