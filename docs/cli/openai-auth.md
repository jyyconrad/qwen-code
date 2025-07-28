# OpenAI 认证

iFlyCode CLI 支持 OpenAI 认证，适用于希望使用 OpenAI 模型而非 Google 的 Gemini 模型的用户。

## 认证方法

### 1. 交互式认证（推荐）

首次运行 CLI 并选择 OpenAI 作为认证方法时，系统会提示您输入以下信息：

- **API 密钥**：您的 OpenAI API 密钥，获取地址为 [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **基础 URL**：OpenAI API 的基础 URL（默认为 `https://api.openai.com/v1`）
- **模型**：要使用的 OpenAI 模型（默认为 `gpt-4o`）

CLI 会引导您依次填写每个字段：

1. 输入您的 API 密钥后按 Enter
2. 查看/修改基础 URL 后按 Enter
3. 查看/修改模型名称后按 Enter

**注意**：您可以直接粘贴 API 密钥——CLI 支持粘贴功能，并会显示完整的密钥以供验证。

### 2. 命令行参数

您也可以通过命令行参数提供 OpenAI 凭据：

```bash
# 仅提供 API 密钥的基本用法
iflycode-code --openai-api-key "your-api-key-here"

# 自定义基础 URL
iflycode-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-custom-endpoint.com/v1"

# 自定义模型
iflycode-code --openai-api-key "your-api-key-here" --model "gpt-4-turbo"
```

### 3. 环境变量

在您的 shell 或 `.env` 文件中设置以下环境变量：

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # 可选，默认为此值
export OPENAI_MODEL="gpt-4o"  # 可选，默认为 gpt-4o
```

## 支持的模型

CLI 支持所有可通过 OpenAI API 使用的模型，包括：

- `gpt-4o`（默认）
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- 其他可用模型

## 自定义端点

通过设置 `OPENAI_BASE_URL` 环境变量或使用 `--openai-base-url` 命令行参数，您可以使用自定义端点。这在以下情况下非常有用：

- 使用 Azure OpenAI
- 使用其他兼容 OpenAI 的 API
- 使用本地兼容 OpenAI 的服务器

## 切换认证方法

要在不同认证方法之间切换，请在 CLI 界面中使用 `/auth` 命令。

## 安全注意事项

- API 密钥仅在会话期间存储于内存中
- 如需持久化存储，请使用环境变量或 `.env` 文件
- 切勿将 API 密钥提交到版本控制系统中
- CLI 会以明文形式显示 API 密钥以供验证——请确保您的终端环境安全