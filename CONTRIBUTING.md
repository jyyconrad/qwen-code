# 如何贡献代码

我们非常欢迎你为本项目提交补丁和贡献代码。

## 开始之前

### 签署我们的贡献者许可协议（CLA）

对本项目的贡献必须附带一份 [贡献者许可协议](https://cla.developers.google.com/about)（CLA）。你（或你的雇主）保留你贡献部分的版权；这仅仅意味着我们获得了将你的贡献作为项目的一部分使用和重新分发的许可。

如果你或你的当前雇主已经签署了 Google 的 CLA（即使是为了其他项目），那么你可能不需要再次签署。

访问 <https://cla.developers.google.com/> 查看你当前的协议或签署新的协议。

### 查阅我们的社区行为准则

本项目遵循 [Google 的开源社区行为准则](https://opensource.google/conduct/)。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要经过审查。我们使用 [GitHub 拉取请求](https://docs.github.com/articles/about-pull-requests) 来完成此目的。

### Pull Request 指南

为了帮助我们快速审查和合并你的 PR，请遵循以下指南。未满足这些标准的 PR 可能会被关闭。

#### 1. 关联到现有 Issue

所有 PR 都应关联到我们跟踪系统中的一个现有 issue。这确保了在编写任何代码之前，每个更改都经过讨论并与项目目标保持一致。

- **对于 bug 修复：** PR 应关联到 bug 报告的 issue。
- **对于新功能：** PR 应关联到已由维护者批准的特性请求或提案 issue。

如果你的更改没有对应的 issue，请**先创建一个**，并在开始编码前等待反馈。

#### 2. 保持简洁和专注

我们倾向于小型、原子性的 PR，它们只解决一个特定问题或添加一个独立的功能。

- **建议：** 创建一个只修复一个特定 bug 或添加一个特定功能的 PR。
- **不建议：** 将多个不相关的更改（例如一个 bug 修复、一个新功能和一个重构）合并到一个 PR 中。

大型更改应分解为一系列较小的、逻辑清晰的 PR，这些 PR 可以独立审查和合并。

#### 3. 使用 Draft PR 进行进行中的工作

如果你想尽早获得反馈，请使用 GitHub 的 **Draft Pull Request** 功能。这向维护者表明 PR 还未准备好正式审查，但可以进行讨论和初步反馈。

#### 4. 确保所有检查通过

在提交 PR 之前，请通过运行 `npm run preflight` 确保所有自动化检查通过。此命令将运行所有测试、代码检查和其他风格检查。

#### 5. 更新文档

如果你的 PR 引入了面向用户的更改（例如新命令、修改的标志或行为更改），你还必须更新 `/docs` 目录中的相关文档。

#### 6. 编写清晰的提交信息和 PR 描述

你的 PR 应该有一个清晰、描述性的标题和详细的更改描述。请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 标准来编写提交信息。

- **好的 PR 标题：** `feat(cli): Add --json flag to 'config get' command`
- **差的 PR 标题：** `Made some changes`

在 PR 描述中，解释你更改的“原因”，并链接到相关的 issue（例如 `Fixes #123`）。

## Forking

如果你 fork 了这个仓库，你将能够运行构建、测试和集成测试工作流。但是为了让集成测试运行，你需要添加一个 [GitHub 仓库密钥](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)，其名称为 `GEMINI_API_KEY`，并将其设置为你拥有的有效 API 密钥。你的密钥是私有的，仅限仓库访问者可见；没有访问权限的人无法看到你的密钥，你也无法看到与该仓库相关的任何密钥。

此外，你还需要点击 `Actions` 标签页并为你的仓库启用工作流。你会在屏幕中央看到一个大的蓝色按钮。

## 开发环境搭建与流程

本节指导贡献者如何构建、修改和理解本项目的开发环境。

### 设置开发环境

**前提条件：**

1.  **Node.js**:
    - **开发：** 请使用 Node.js `~20.19.0`。由于上游开发依赖问题，必须使用此特定版本。你可以使用 [nvm](https://github.com/nvm-sh/nvm) 等工具来管理 Node.js 版本。
    - **生产：** 在生产环境中运行 CLI 时，可使用任何 `>=20` 版本的 Node.js。
2.  **Git**

### 构建流程

克隆仓库：

```bash
git clone https://github.com/google-gemini/gemini-cli.git # 或你 fork 的地址
cd gemini-cli
```

安装 `package.json` 中定义的依赖项以及根依赖项：

```bash
npm install
```

构建整个项目（所有包）：

```bash
npm run build
```

此命令通常将 TypeScript 编译为 JavaScript，打包资源，并为执行准备包。有关构建过程的更多细节，请参阅 `scripts/build.js` 和 `package.json` 中的脚本。

### 启用沙箱

[Sandboxing](#sandboxing) 是高度推荐的，至少需要在你的 `~/.env` 文件中设置 `GEMINI_SANDBOX=true`，并确保有可用的沙箱提供程序（例如 `macOS Seatbelt`、`docker` 或 `podman`）。详情请参见 [Sandboxing](#sandboxing)。

要同时构建 `gemini` CLI 工具和沙箱容器，请在根目录下运行：

```bash
npm run build:all
```

如果你想跳过构建沙箱容器，可以改用 `npm run build`。

### 运行

从源代码启动 Gemini CLI（构建后），在根目录下运行以下命令：

```bash
npm start
```

如果你想在 gemini-cli 文件夹之外运行源码构建，可以使用 `npm link path/to/gemini-cli/packages/cli`（参见：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）或 `alias gemini="node path/to/gemini-cli/packages/cli"` 来通过 `gemini` 命令运行。

### 运行测试

本项目包含两种类型的测试：单元测试和集成测试。

#### 单元测试

执行项目的单元测试套件：

```bash
npm run test
```

这将运行位于 `packages/core` 和 `packages/cli` 目录下的测试。在提交任何更改之前，请确保测试通过。如需更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试用于验证 Gemini CLI 的端到端功能。默认情况下不会运行 `npm run test` 命令。

运行集成测试：

```bash
npm run test:e2e
```

有关集成测试框架的更多详细信息，请参阅 [Integration Tests 文档](./docs/integration-tests.md)。

### 代码检查与预检

为确保代码质量和格式一致性，请运行预检检查：

```bash
npm run preflight
```

此命令将运行 ESLint、Prettier、所有测试以及其他在项目 `package.json` 中定义的检查。

_ProTip_

克隆后创建一个 git precommit hook 文件，以确保你的提交始终干净。

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

单独格式化项目代码，请从根目录运行以下命令：

```bash
npm run format
```

此命令使用 Prettier 按照项目的风格指南格式化代码。

#### 代码检查

单独检查项目代码，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码规范

- 请遵循现有代码库中使用的编码风格、模式和约定。
- 参阅 [GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md)（通常位于项目根目录）了解与 AI 辅助开发相关的具体说明，包括 React、注释和 Git 使用的约定。
- **导入：** 请注意导入路径。项目使用 `eslint-rules/no-relative-cross-package-imports.js` 来限制包之间的相对导入。

### 项目结构

- `packages/`: 包含项目的各个子包。
  - `cli/`: 命令行接口。
  - `core/`: Gemini CLI 的核心后端逻辑。
- `docs/`: 包含所有项目文档。
- `scripts/`: 用于构建、测试和开发任务的实用脚本。

有关更详细的架构，请参阅 `docs/architecture.md`。

## 调试

### VS Code：

0.  在 VS Code 中通过 `F5` 运行 CLI 进行交互式调试
1.  在根目录下以调试模式启动 CLI：
    ```bash
    npm run debug
    ```
    此命令在 `packages/cli` 目录下运行 `node --inspect-brk dist/gemini.js`，并在调试器连接之前暂停执行。然后你可以在 Chrome 浏览器中打开 `chrome://inspect` 连接到调试器。
2.  在 VS Code 中，使用 "Attach" 启动配置（位于 `.vscode/launch.json` 中）。

或者，如果你更倾向于直接启动当前打开的文件，可以使用 VS Code 中的 "Launch Program" 配置，但通常推荐使用 'F5'。

要在沙箱容器内命中断点运行：

```bash
DEBUG=1 gemini
```

### React DevTools

要调试 CLI 的基于 React 的 UI，你可以使用 React DevTools。Ink，CLI 界面所使用的库，兼容 React DevTools 4.x 版本。

1.  **以开发模式启动 Gemini CLI：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 4.28.5（或最新的兼容 4.x 版本）：**

    你可以全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或者直接使用 npx 运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    你的运行中的 CLI 应用程序应该会连接到 React DevTools。
    ![](/docs/assets/connected_devtools.png)

## 沙箱

### MacOS Seatbelt

在 MacOS 上，`gemini` 使用 Seatbelt（`sandbox-exec`）下的 `permissive-open` 配置文件（参见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），该配置文件限制对项目文件夹的写入，但默认允许所有其他操作和出站网络流量（“open”）。你可以通过在环境或 `.env` 文件中设置 `SEATBELT_PROFILE=restrictive-closed` 来切换到 `restrictive-closed` 配置文件（参见 `packages/cli/src/utils/sandbox-macos-restrictive-closed.sb`），该配置文件默认拒绝所有操作和出站网络流量（“closed”）。可用的内置配置文件包括 `{permissive,restrictive}-{open,closed,proxied}`（有关代理网络的说明，请参见下文）。如果你还创建了文件 `.iflycode/sandbox-macos-<profile>.sb`，则可以切换到自定义配置文件 `SEATBELT_PROFILE=<profile>`，并将该文件放在你的项目设置目录 `.gemini` 下。

### 基于容器的沙箱（所有平台）

对于在 MacOS 或其他平台上更强的基于容器的沙箱，你可以在环境或 `.env` 文件中设置 `GEMINI_SANDBOX=true|docker|podman|<command>`。指定的命令（或如果为 `true` 则为 `docker` 或 `podman`）必须安装在主机上。启用后，`npm run build:all` 将构建一个最小的容器（“沙箱”）镜像，`npm start` 将在该容器的新实例中启动。首次构建可能需要 20-30 秒（主要是由于下载基础镜像），但之后构建和启动的开销都很小。默认构建（`npm run build`）不会重新构建沙箱。

基于容器的沙箱将项目目录（和系统临时目录）以读写方式挂载，并在你启动/停止 Gemini CLI 时自动启动/停止/删除。沙箱内创建的文件应自动映射到你的用户/组。你可以通过设置 `SANDBOX_{MOUNTS,PORTS,ENV}` 来轻松指定额外的挂载点、端口或环境变量。你还可以通过在项目设置目录（`.gemini`）下创建文件 `.iflycode/sandbox.Dockerfile` 和/或 `.iflycode/sandbox.bashrc` 来完全自定义沙箱，并通过 `BUILD_SANDBOX=1` 运行 `gemini` 来触发自定义沙箱的构建。

#### 代理网络

所有沙箱方法，包括使用 `*-proxied` 配置文件的 MacOS Seatbelt，均支持通过自定义代理服务器限制出站网络流量。代理服务器可通过 `GEMINI_SANDBOX_PROXY_COMMAND=<command>` 指定，其中 `<command>` 必须启动一个在 `:::8877` 上监听相关请求的代理服务器。参见 `docs/examples/proxy-script.md` 获取一个仅允许 `HTTPS` 连接到 `example.com:443`（例如 `curl https://example.com`）并拒绝所有其他请求的最小代理示例。代理服务器会随沙箱自动启动和停止。

## 手动发布

我们为每次提交发布一个制品到内部仓库。但如果你需要手动发布一个本地构建，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```