# Gemini CLI 执行与部署

本文档介绍如何运行 Gemini CLI，并解释 Gemini CLI 所使用的部署架构。

## 运行 Gemini CLI

有多种方式可以运行 Gemini CLI。具体选择哪种方式取决于你打算如何使用 Gemini CLI。

---

### 1. 标准安装（推荐给普通用户）

这是推荐给终端用户的安装方式，它包括从 NPM 仓库下载 Gemini CLI 包。

- **全局安装：**

  ```bash
  npm install -g @google/gemini-cli
  ```

  然后，可以在任意位置运行 CLI：

  ```bash
  gemini
  ```

- **通过 NPX 运行：**

  ```bash
  # 无需全局安装即可从 NPM 运行最新版本
  npx @google/gemini-cli
  ```

---

### 2. 在沙箱中运行（Docker/Podman）

为了安全和隔离性，Gemini CLI 可以在容器内运行。这是 CLI 执行可能具有副作用的工具时的默认方式。

- **直接从仓库运行：**
  你可以直接运行已发布的沙箱镜像。这对于只有 Docker 的环境且想要运行 CLI 的情况很有用。
  ```bash
  # 运行已发布的沙箱镜像
  docker run --rm -it iflytek/iflycodecli/sandbox:0.1.1
  ```
- **使用 `--sandbox` 标志：**
  如果你已经在本地安装了 Gemini CLI（使用上面描述的标准安装方法），你可以指示它在沙箱容器中运行。
  ```bash
  gemini --sandbox -y -p "your prompt here"
  ```

---

### 3. 从源代码运行（推荐给 Gemini CLI 贡献者）

项目贡献者可能希望直接从源代码运行 CLI。

- **开发模式：**
  此方法提供热重载功能，适用于主动开发。
  ```bash
  # 从仓库根目录运行
  npm run start
  ```
- **生产环境模拟模式（链接包）：**
  此方法通过链接本地包来模拟全局安装。它适用于在生产流程中测试本地构建。

  ```bash
  # 将本地 cli 包链接到全局 node_modules
  npm link packages/cli

  # 现在你可以使用 `gemini` 命令运行你的本地版本
  gemini
  ```

---

### 4. 从 GitHub 运行最新的 Gemini CLI 提交版本

你可以直接从 GitHub 仓库运行最新提交的 Gemini CLI 版本。这对于测试仍在开发中的功能很有用。

```bash
# 直接从 GitHub 上的 main 分支运行 CLI
npx https://github.com/google-gemini/gemini-cli
```

## 部署架构

上述执行方式依赖于以下架构组件和流程：

**NPM 包**

Gemini CLI 项目是一个单体仓库（monorepo），它向 NPM 仓库发布两个核心包：

- `@google/gemini-cli-core`：后端，负责逻辑和工具执行。
- `@google/gemini-cli`：面向用户的前端。

这些包在进行标准安装以及从源代码运行 Gemini CLI 时会被使用。

**构建和打包流程**

根据分发渠道不同，使用了两种不同的构建流程：

- **NPM 发布：** 发布到 NPM 仓库时，`@google/gemini-cli-core` 和 `@google/gemini-cli` 中的 TypeScript 源代码会使用 TypeScript 编译器（`tsc`）转换为标准 JavaScript。生成的 `dist/` 目录就是发布到 NPM 包中的内容。这是 TypeScript 库的标准做法。

- **GitHub `npx` 执行：** 当直接从 GitHub 运行最新版本的 Gemini CLI 时，`package.json` 中的 `prepare` 脚本会触发一个不同的流程。该脚本使用 `esbuild` 将整个应用程序及其依赖打包成一个独立的 JavaScript 文件。这个包会在用户的机器上即时生成，并不会提交到仓库中。

**Docker 沙箱镜像**

基于 Docker 的执行方式由 `gemini-cli-sandbox` 容器镜像支持。该镜像发布到容器仓库中，并包含一个预先安装的、全局版本的 Gemini CLI。

## 发布流程

发布流程通过 GitHub Actions 自动化完成。发布工作流执行以下操作：

1. 使用 `tsc` 构建 NPM 包。
2. 将 NPM 包发布到制品仓库。
3. 创建包含打包资源的 GitHub 发布版本。