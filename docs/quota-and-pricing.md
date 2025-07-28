# Gemini CLI：配额与价格

你的 Gemini CLI 配额与价格取决于你用于向 Google 进行身份验证的账户类型。此外，根据所使用的模型版本、请求和令牌，配额和价格的计算方式也可能不同。可以通过 `/stats` 命令查看模型使用情况的摘要，并在会话结束时退出时查看。详细信息请参见[隐私与条款](./tos-privacy.md)。注意：公布的价格为标价；可能适用额外协商的商业折扣。

本文概述了使用不同身份验证方法时适用于 Gemini CLI 的具体配额与价格。

## 1. 使用 Google 登录（Gemini Code Assist 免费版）

适用于通过 Google 账户进行身份验证以访问面向个人用户的 Gemini Code Assist 的用户：

- **配额：**
  - 每分钟 60 个请求
  - 每日 1000 个请求
  - 不适用令牌使用
- **费用：** 免费
- **详细信息：** [Gemini Code Assist 配额](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli)
- **备注：** 未指定不同模型的具体配额；为保持共享体验的质量，可能会发生模型回退。

## 2. Gemini API 密钥（免费版）

如果你使用的是免费版的 Gemini API 密钥：

- **配额：**
  - 仅限 Flash 模型
  - 每分钟 10 个请求
  - 每日 250 个请求
- **费用：** 免费
- **详细信息：** [Gemini API 速率限制](https://ai.google.dev/gemini-api/docs/rate-limits)

## 3. Gemini API 密钥（付费版）

如果你使用的是付费计划的 Gemini API 密钥：

- **配额：** 因价格层级不同而异。
- **费用：** 因价格层级及模型/令牌使用而异。
- **详细信息：** [Gemini API 速率限制](https://ai.google.dev/gemini-api/docs/rate-limits)、[Gemini API 定价](https://ai.google.dev/gemini-api/docs/pricing)

## 4. 使用 Google 登录（适用于 Workspace 或已授权的 Code Assist 用户）

适用于 Gemini Code Assist 的标准版或企业版用户，配额与价格基于固定价格订阅并分配了授权席位：

- **标准版：**
  - **配额：** 每分钟 120 个请求，每日 1500 个请求
- **企业版：**
  - **配额：** 每分钟 120 个请求，每日 2000 个请求
- **费用：** 固定价格，包含在你的 Gemini for Google Workspace 或 Gemini Code Assist 订阅中。
- **详细信息：** [Gemini Code Assist 配额](https://developers.google.com/gemini-code-assist/resources/quotas#quotas-for-agent-mode-gemini-cli)、[Gemini Code Assist 定价](https://cloud.google.com/products/gemini/pricing)
- **备注：**
  - 未指定不同模型的具体配额；为保持共享体验的质量，可能会发生模型回退。
  - Google 开发者计划的成员可能通过其会员资格获得 Gemini Code Assist 授权。

## 5. Vertex AI（Express 模式）

如果你在 Express 模式下使用 Vertex AI：

- **配额：** 配额因账户而异，请参见来源以获取更多详细信息。
- **费用：** 在你用完 Express 模式使用量并为项目启用计费后，费用基于标准的 [Vertex AI 定价](https://cloud.google.com/vertex-ai/pricing)。
- **详细信息：** [Vertex AI Express 模式配额](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview#quotas)

## 6. Vertex AI（常规模式）

如果你使用的是标准版 Vertex AI 服务：

- **配额：** 由动态共享配额系统或预购的预配吞吐量管理。
- **费用：** 基于模型和令牌的使用情况。请参见 [Vertex AI 定价](https://cloud.google.com/vertex-ai/pricing)。
- **详细信息：** [Vertex AI 动态共享配额](https://cloud.google.com/vertex-ai/generative-ai/docs/resources/dynamic-shared-quota)

## 7. Google One 和 Ultra 计划、Gemini for Workspace 计划

这些计划目前仅适用于 Google 提供的基于网络的 Gemini 产品（例如，Gemini 网页应用或 Flow 视频编辑器）。这些计划不适用于为 Gemini CLI 提供支持的 API 使用。我们正在积极考虑未来对这些计划的支持。