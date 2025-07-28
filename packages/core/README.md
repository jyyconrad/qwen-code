# iFlyCode

![iFlyCode Screenshot](./docs/assets/iflycode-screenshot.png)

iFlyCode 是一款命令行 AI 工作流工具，改编自 [**Gemini CLI**](https://github.com/google-gemini/gemini-cli)（更多细节请参阅[此文档](./README.gemini.md)），专为 [iFlyCode3-Coder](https://github.com/iFlyCodeLM/iFlyCode3-Coder) 模型优化，增强了解析器支持和工具支持。

> [!WARNING]
> iFlyCode 每个周期可能会发起多个 API 调用，导致更高的 token 使用量，类似于 Claude Code。我们正在积极提升 API 效率并改善整体开发者体验。

## 主要功能

- **代码理解与编辑** - 查询和编辑超出传统上下文窗口限制的大型代码库
- **工作流自动化** - 自动化操作任务，如处理拉取请求和复杂的变基操作
- **增强解析器** - 专为 iFlyCode-Coder 模型优化的解析器

## 快速开始

### 前提条件

确保你已安装 [Node.js 版本 20](https://nodejs.org/en/download) 或更高版本。

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### 安装

```bash
npm install -g @iflytek/iflycode
iflycode --version
```

然后可以从任何位置运行：

```bash
iflycode
```

或者你可以从源码安装：

```bash
git clone https://github.com/iFlyCodeLM/iflycode-code.git
cd iflycode-code
npm install
npm install -g .
```

### API 配置

设置你的 iFlyCode API 密钥（在 iFlyCode 项目中，你也可以在 `.env` 文件中设置 API 密钥）。`.env` 文件应放置在当前项目的根目录下。

> ⚠️ **注意：** <br>
> **如果你在中国大陆，请前往 https://bailian.console.aliyun.com/ 申请你的 API 密钥** <br>
> **如果你不在中国大陆，请前往 https://modelstudio.console.alibabacloud.com/ 申请你的 API 密钥**

```bash
# 如果你在中国大陆，请使用以下 URL:
# https://dashscope.aliyuncs.com/compatible-mode/v1
# 如果你不在中国大陆，请使用以下 URL:
# https://dashscope-intl.aliyuncs.com/compatible-mode/v1
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="your_api_base_url_here"
export OPENAI_MODEL="your_api_model_here"
```

## 使用示例

### 探索代码库

```sh
cd your-project/
iflycode
> 描述这个系统架构的主要组成部分
```

### 代码开发

```sh
> 重构此函数以提高可读性和性能
```

### 自动化工作流

```sh
> 分析过去7天的 git 提交，按功能和团队成员分组
```

```sh
> 将此目录中的所有图像转换为 PNG 格式
```

## 常见任务

### 理解新代码库

```text
> 核心业务逻辑组件有哪些？
> 有哪些安全机制？
> 数据流是如何工作的？
```

### 代码重构与优化

```text
> 此模块中哪些部分可以优化？
> 帮我重构此类以遵循更好的设计模式
> 添加适当的错误处理和日志记录
```

### 文档与测试

```text
> 为此函数生成全面的 JSDoc 注释
> 为此组件编写单元测试
> 创建 API 文档
```

## 基准测试结果

### Terminal-Bench

| Agent     | Model              | 准确率 |
| --------- | ------------------ | ------ |
| iFlyCode | iFlyCode3-Coder-480A35 | 37.5   |

## 项目结构

```
iflycode-code/
├── packages/           # 核心包
├── docs/              # 文档
├── examples/          # 示例代码
└── tests/            # 测试文件
```

## 开发与贡献

请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何为项目做贡献。

## 故障排查

如果遇到问题，请查阅 [故障排查指南](docs/troubleshooting.md)。

## 致谢

本项目基于 [Google Gemini CLI](https://github.com/google-gemini/gemini-cli)。我们对 Gemini CLI 团队的出色工作表示认可和感谢。我们的主要贡献集中在解析器层面的适配，以便更好地支持 iFlyCode-Coder 模型。

## 许可证

[LICENSE](./LICENSE)

## 星标历史

[![Star History Chart](https://api.star-history.com/svg?repos=iFlyCodeLM/iflycode-code&type=Date)](https://www.star-history.com/#iFlyCodeLM/iflycode-code&Date)