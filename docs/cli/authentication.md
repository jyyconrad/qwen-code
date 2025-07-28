# 身份验证设置

iFlyCode CLI 支持多种身份验证方法。在首次启动时，您需要配置以下 **一种** 身份验证方法：

1.  **使用 Google 登录（Gemini Code Assist）：**
    - 使用此选项通过您的 Google 账户登录。
    - 在首次启动期间，Gemini CLI 会将您引导到一个网页进行身份验证。身份验证成功后，您的凭据将被缓存在本地，以便后续运行时跳过网页登录。
    - 请注意，网页登录必须在能够与运行 Gemini CLI 的机器通信的浏览器中完成。（具体来说，浏览器将被重定向到 Gemini CLI 正在监听的 localhost URL）。
    - <a id="workspace-gca">如果出现以下情况，用户可能需要指定 GOOGLE_CLOUD_PROJECT：</a>
      1. 您拥有一个 Google Workspace 账户。Google Workspace 是一项面向企业和组织的付费服务，提供一套生产力工具，包括自定义电子邮件域（例如 your-name@your-company.com）、增强的安全功能和管理控制。（例如 your-name@your-company.com）
      1. 您通过 [Google Developer Program](https://developers.google.com/program/plans-and-pricing)（包括符合条件的 Google Developer Experts）获得了免费的 Code Assist 许可证
      1. 您获得了当前 Gemini Code Assist 标准版或企业版订阅的许可证
      1. 您在免费个人使用的 [支持区域](https://developers.google.com/gemini-code-assist/resources/available-locations) 之外使用该产品
      1. 您是未满 18 周岁的 Google 账户持有者
      - 如果您属于上述任一类别，您必须首先配置一个 Google Cloud 项目 ID 来使用，[启用 Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api) 并 [配置访问权限](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam)。

      您可以使用以下命令在当前 shell 会话中临时设置环境变量：

      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      ```
      - 为了重复使用，您可以将环境变量添加到 [.env 文件](#persisting-environment-variables-with-env-files) 或 shell 的配置文件中（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：

      ```bash
      echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
      source ~/.bashrc
      ```

2.  **<a id="gemini-api-key"></a>Gemini API 密钥：**
    - 从 Google AI Studio 获取您的 API 密钥：[https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - 设置 `GEMINI_API_KEY` 环境变量。在以下方法中，将 `YOUR_GEMINI_API_KEY` 替换为您从 Google AI Studio 获取的 API 密钥：
      - 您可以使用以下命令在当前 shell 会话中临时设置环境变量：
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```
      - 为了重复使用，您可以将环境变量添加到 [.env 文件](#persisting-environment-variables-with-env-files) 或 shell 的配置文件中（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc
        source ~/.bashrc
        ```

3.  **Vertex AI：**
    - 获取您的 Google Cloud API 密钥：[获取 API 密钥](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys?usertype=newuser)
      - 设置 `GOOGLE_API_KEY` 环境变量。在以下方法中，将 `YOUR_GOOGLE_API_KEY` 替换为您从 Vertex AI 获取的 API 密钥：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
          ```
        - 为了重复使用，您可以将环境变量添加到 [.env 文件](#persisting-environment-variables-with-env-files) 或 shell 的配置文件中（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
          ```bash
          echo 'export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"' >> ~/.bashrc
          source ~/.bashrc
          ```
    - 要使用应用程序默认凭据 (ADC)，请使用以下命令：
      - 确保您有一个 Google Cloud 项目并已启用 Vertex AI API。
        ```bash
        gcloud auth application-default login
        ```
        有关更多信息，请参阅 [为 Google Cloud 设置应用程序默认凭据](https://cloud.google.com/docs/authentication/provide-credentials-adc)。
      - 设置 `GOOGLE_CLOUD_PROJECT` 和 `GOOGLE_CLOUD_LOCATION` 环境变量。在以下方法中，将 `YOUR_PROJECT_ID` 和 `YOUR_PROJECT_LOCATION` 替换为您的项目的相关值：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
          export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # 例如，us-central1
          ```
        - 为了重复使用，您可以将环境变量添加到 [.env 文件](#persisting-environment-variables-with-env-files) 或 shell 的配置文件中（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
          ```bash
          echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
          echo 'export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"' >> ~/.bashrc
          source ~/.bashrc
          ```
4.  **Cloud Shell：**
    - 此选项仅在 Google Cloud Shell 环境中运行时可用。
    - 它会自动使用 Cloud Shell 环境中登录用户的凭据。
    - 这是在 Cloud Shell 中运行且未配置其他方法时的默认身份验证方法。

### 使用 `.env` 文件持久化环境变量

您可以在项目目录或主目录中创建一个 **`.iflycode/.env`** 文件。创建一个普通的 **`.env`** 文件也可以，但建议使用 `.iflycode/.env` 以将 Gemini 变量与其他工具隔离开来。

Gemini CLI 会自动从 **第一个** 找到的 `.env` 文件加载环境变量，使用以下搜索顺序：

1. 从 **当前目录** 开始，向上查找直到根目录 `/`，在每个目录中检查：
   1. `.iflycode/.env`
   2. `.env`
2. 如果未找到文件，则回退到您的 **主目录**：
   - `~/.iflycode/.env`
   - `~/.env`

> **重要：** 搜索在遇到 **第一个** 文件时停止——变量 **不会** 在多个文件之间合并。

#### 示例

**项目特定的覆盖**（在项目目录内时优先）：

```bash
mkdir -p .gemini
echo 'GOOGLE_CLOUD_PROJECT="your-project-id"' >> .iflycode/.env
```

**用户范围的设置**（在每个目录中都可用）：

```bash
mkdir -p ~/.gemini
cat >> ~/.iflycode/.env <<'EOF'
GOOGLE_CLOUD_PROJECT="your-project-id"
GEMINI_API_KEY="your-gemini-api-key"
EOF
```

5.  **OpenAI 身份验证：**
    - 使用 OpenAI 模型而不是 Google 的 Gemini 模型
    - 有关详细设置说明，请参阅 [OpenAI 身份验证](./openai-auth.md)
    - 支持交互式设置、命令行参数和环境变量