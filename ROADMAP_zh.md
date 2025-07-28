```markdown
# Gemini CLI 路线图

[官方 Gemini CLI 路线图](https://github.com/orgs/google-gemini/projects/11/)

Gemini CLI 是一个开源的人工智能代理，它将 Gemini 的强大功能直接带入你的终端。它提供了对 Gemini 的轻量级访问，为你从提示到模型之间提供了最直接的路径。

本文档概述了我们对 Gemini CLI 路线图的规划方法。在这里，你将看到我们的指导原则以及我们当前开发重点的关键领域。我们的路线图不是一个静态列表，而是一组动态的优先事项，这些事项会在我们的 GitHub Issues 中实时跟踪。

作为一个 [Apache 2.0 开源项目](https://github.com/google-gemini/gemini-cli?tab=Apache-2.0-1-ov-file#readme)，我们非常欢迎和感谢 [公众贡献](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md)，并会优先考虑与我们路线图一致的贡献。如果你想提议新增功能或修改我们的路线图，请先 [发起一个讨论议题](https://github.com/google-gemini/gemini-cli/issues/new/choose)。

## 免责声明

本路线图代表了我们当前的思考，仅供信息参考。它不是对我们未来交付功能的承诺或保证。任何功能的开发、发布和时间安排都可能发生变化，我们可能会根据社区讨论以及优先事项变化更新路线图。

## 指导原则

我们的开发遵循以下原则：

- **强大与简洁：** 提供对最先进 Gemini 模型的访问，同时通过直观、易用的轻量级命令行界面实现。
- **可扩展性：** 提供一个适应性强的代理，帮助你应对各种使用场景和环境，并能够在任何地方运行这些代理。
- **智能化：** 根据 SWE Bench、Terminal Bench 和 CSAT 等基准测试，Gemini CLI 应当稳定地位列最佳代理工具之一。
- **免费且开源：** 培育一个繁荣的开源社区，使成本不会成为个人使用的障碍，并快速合并 PR。这意味着快速解决和关闭问题、拉取请求和讨论帖。

## 路线图如何运作

我们的路线图直接通过 GitHub Issues 管理。请参阅我们的路线图入口问题 [here](https://github.com/google-gemini/gemini-cli/issues/4191)。这种方法提供了透明度，并为你提供了一种直接方式来了解或参与任何特定计划。我们正在积极开发的功能将标记为 Type:`Feature` 和 Label:`maintainer`，更详细的任务列表则标记为 Type:`Task` 和 Label:`maintainer`。

问题组织方式便于一目了然地获取关键信息：

- **目标季度：** `Milestone` 表示预期的交付时间线。
- **功能领域：** 标签如 `area/model` 或 `area/tooling` 用于对工作进行分类。
- **问题类型：** _Workstream_ => _Epics_ => _Features_ => _Tasks|Bugs_

要查看我们正在开发的内容，你可以通过这些维度进行筛选。查看我们所有项目 [here](https://github.com/orgs/google-gemini/projects/11/views/19)

## 重点领域

为了更好地组织我们的工作，我们将工作分为几个关键功能领域。这些标签用于我们的 GitHub Issues，帮助你筛选和找到感兴趣的内容。

- **认证：** 通过 API 密钥、Gemini Code Assist 登录等方式实现安全用户访问。
- **模型：** 支持新的 Gemini 模型、多模态、本地执行和性能调优。
- **用户体验：** 提升 CLI 的可用性、性能、交互功能和文档。
- **工具：** 内置工具和 MCP 生态系统。
- **核心：** CLI 的核心功能。
- **可扩展性：** 将 Gemini CLI 引入其他平台，例如 GitHub。
- **贡献：** 通过测试自动化和 CI/CD 管道增强来改进贡献流程。
- **平台：** 管理安装、操作系统支持和底层 CLI 框架。
- **质量：** 关注测试、可靠性、性能和整体产品质量。
- **后台代理：** 支持长期运行、自主任务和主动协助。
- **安全与隐私：** 所有与安全和隐私相关的内容。

## 如何贡献

Gemini CLI 是一个开源项目，我们欢迎社区的贡献！无论你是开发者、设计师，还是热心用户，都可以参考我们的 [社区指南](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md) 来了解如何入门。你可以通过多种方式参与：

- **路线图：** 请查看我们的 [路线图](https://github.com/google-gemini/gemini-cli/issues/4191)，找到你愿意贡献的领域。基于此的贡献将最容易整合。
- **报告 Bug：** 如果你发现问题，请尽可能详细地创建一个 bug(https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml)。如果你认为这是一个阻止 CLI 使用的关键问题，请标记为 `priorty/p0`。
- **建议功能：** 有好的想法？我们很乐意听取！发起一个 [功能请求](https://github.com/google-gemini/gemini-cli/issues/new?template=feature_request.yml)。
- **贡献代码：** 查看我们的 [CONTRIBUTING.md](https://github.com/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md) 文件，了解如何提交拉取请求的指南。我们为新贡献者准备了一些“适合初学者的问题”。
- **编写文档：** 帮助我们改进文档、教程和示例。

我们对 Gemini CLI 的未来充满期待，并期待与你共同构建它！
```