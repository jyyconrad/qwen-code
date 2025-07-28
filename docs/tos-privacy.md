# Gemini CLI：服务条款和隐私声明

Gemini CLI 是一个开源工具，可让您直接通过命令行界面与 Google 强大的语言模型进行交互。适用于您使用 Gemini CLI 的服务条款和隐私声明取决于您用于向 Google 进行身份验证的账户类型。

本文概述了适用于不同账户类型和认证方法的具体条款和隐私政策。注意：有关适用于您使用 Gemini CLI 的配额和定价详细信息，请参阅 [配额和定价](./quota-and-pricing.md)。

## 如何确定您的认证方式

您的认证方式是指您用于登录和访问 Gemini CLI 的方法。有四种认证方式：

- 使用您的 Google 账户登录 Gemini Code Assist for Individuals
- 使用您的 Google 账户登录 Gemini Code Assist for Workspace、Standard 或 Enterprise 用户
- 使用 API 密钥与 Gemini Developer
- 使用 API 密钥与 Vertex AI GenAI API

对于这四种认证方式中的每一种，可能适用不同的服务条款和隐私声明。

| 认证方式                     | 账户类型            | 服务条款                                                                                               | 隐私声明                                                                                                                                                                                   |
| :-------------------------- | :------------------ | :---------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通过 Google 登录 Gemini Code Assist | 个人               | [Google 服务条款](https://policies.google.com/terms?hl=en-US)                                         | [Gemini Code Assist 个人用户隐私声明](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals)                                              |
| 通过 Google 登录 Gemini Code Assist | 标准/企业          | [Google Cloud Platform 服务条款](https://cloud.google.com/terms)                                      | [标准和企业版 Gemini Code Assist 隐私声明](https://cloud.google.com/gemini/docs/codeassist/security-privacy-compliance#standard_and_enterprise_data_protection_and_privacy)                 |
| Gemini Developer API        | 未付费              | [Gemini API 服务条款 - 免费服务](https://ai.google.dev/gemini-api/terms#unpaid-services)               | [Google 隐私政策](https://policies.google.com/privacy)                                                                                                                                     |
| Gemini Developer API        | 已付费              | [Gemini API 服务条款 - 付费服务](https://ai.google.dev/gemini-api/terms#paid-services)                 | [Google 隐私政策](https://policies.google.com/privacy)                                                                                                                                     |
| Vertex AI Gen API           |                    | [Google Cloud Platform 服务条款](https://cloud.google.com/terms/service-terms/)                        | [Google Cloud 隐私声明](https://cloud.google.com/terms/cloud-privacy-notice)                                                                                                               |

## 1. 如果您使用 Google 账户登录 Gemini Code Assist for Individuals

对于使用其 Google 账户访问 [Gemini Code Assist for Individuals](https://developers.google.com/gemini-code-assist/docs/overview#supported-features-gca) 的用户，适用以下服务条款和隐私声明文件：

- **服务条款：** 您对 Gemini CLI 的使用受 [Google 服务条款](https://policies.google.com/terms?hl=en-US) 约束。
- **隐私声明：** 您的数据的收集和使用在 [Gemini Code Assist 个人用户隐私声明](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals) 中有详细说明。

## 2. 如果您使用 Google 账户登录 Gemini Code Assist for Workspace、Standard 或 Enterprise 用户

对于使用其 Google 账户访问 [Gemini Code Assist 标准或企业版](https://cloud.google.com/gemini/docs/codeassist/overview#editions-overview) 的用户，适用以下服务条款和隐私声明文件：

- **服务条款：** 您对 Gemini CLI 的使用受 [Google Cloud Platform 服务条款](https://cloud.google.com/terms) 约束。
- **隐私声明：** 您的数据的收集和使用在 [标准和企业用户 Gemini Code Assist 隐私声明](https://cloud.google.com/gemini/docs/codeassist/security-privacy-compliance#standard_and_enterprise_data_protection_and_privacy) 中有详细说明。

## 3. 如果您使用 Gemini API 密钥登录 Gemini Developer API

如果您使用 Gemini API 密钥对 [Gemini Developer API](https://ai.google.dev/gemini-api/docs) 进行身份验证，则适用以下服务条款和隐私声明文件：

- **服务条款：** 您对 Gemini CLI 的使用受 [Gemini API 服务条款](https://ai.google.dev/gemini-api/terms) 约束。这些条款可能因您使用的是免费服务还是付费服务而有所不同：
  - 对于免费服务，请参阅 [Gemini API 服务条款 - 免费服务](https://ai.google.dev/gemini-api/terms#unpaid-services)。
  - 对于付费服务，请参阅 [Gemini API 服务条款 - 付费服务](https://ai.google.dev/gemini-api/terms#paid-services)。
- **隐私声明：** 您的数据的收集和使用在 [Google 隐私政策](https://policies.google.com/privacy) 中有详细说明。

## 4. 如果您使用 Gemini API 密钥登录 Vertex AI GenAI API

如果您使用 Gemini API 密钥对 [Vertex AI GenAI API](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest) 后端进行身份验证，则适用以下服务条款和隐私声明文件：

- **服务条款：** 您对 Gemini CLI 的使用受 [Google Cloud Platform 服务条款](https://cloud.google.com/terms/service-terms/) 约束。
- **隐私声明：** 您的数据的收集和使用在 [Google Cloud 隐私声明](https://cloud.google.com/terms/cloud-privacy-notice) 中有详细说明。

### 使用统计信息退出

您可以通过以下说明选择退出发送使用统计信息给 Google：[使用统计信息配置](./cli/configuration.md#usage-statistics)。

## Gemini CLI 常见问题解答 (FAQ)

### 1. 我的代码（包括提示和回答）会被用于训练 Google 的模型吗？

您的代码（包括提示和回答）是否会被用于训练 Google 的模型，取决于您使用的认证方法和账户类型。

- **使用个人 Google 账户登录 Gemini Code Assist**：是的。当您使用个人 Google 账户时，适用 [Gemini Code Assist 个人用户隐私声明](https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals)。根据此声明，
  您的**提示、回答及相关代码会被收集**，并可能用于改进 Google 的产品，包括模型训练。
- **使用工作区、标准版或企业版的 Google 账户登录 Gemini Code Assist**：否。对于这些账户，您的数据受 [Gemini Code Assist 隐私声明](https://cloud.google.com/gemini/docs/codeassist/security-privacy-compliance#standard_and_enterprise_data_protection_and_privacy) 条款约束，这些条款将您的输入视为机密。您的**提示、回答及相关代码不会被收集**，也不会用于训练模型。
- **通过 Gemini Developer API 使用 Gemini API 密钥**：您的代码是否被收集或使用取决于您使用的是免费服务还是付费服务。
  - **免费服务**：是的。当您通过 Gemini Developer API 使用 Gemini API 密钥且为免费服务时，适用 [Gemini API 服务条款 - 免费服务](https://ai.google.dev/gemini-api/terms#unpaid-services)。根据此声明，您的**提示、回答及相关代码会被收集**，并可能用于改进 Google 的产品，包括模型训练。
  - **付费服务**：否。当您通过 Gemini Developer API 使用 Gemini API 密钥且为付费服务时，适用 [Gemini API 服务条款 - 付费服务](https://ai.google.dev/gemini-api/terms#paid-services)，该条款将您的输入视为机密。您的**提示、回答及相关代码不会被收集**，也不会用于训练模型。
- **通过 Vertex AI GenAI API 使用 Gemini API 密钥**：否。对于这些账户，您的数据受 [Google Cloud 隐私声明](https://cloud.google.com/terms/cloud-privacy-notice) 条款约束，这些条款将您的输入视为机密。您的**提示、回答及相关代码不会被收集**，也不会用于训练模型。

### 2. 什么是使用统计信息，退出控制什么？

**使用统计信息** 设置是 Gemini CLI 中所有可选数据收集的单一控制选项。

它收集的数据取决于您的账户和认证类型：

- **使用 Gemini Code Assist for Individuals 的 Google 账户**：启用后，此设置允许 Google 收集匿名遥测数据（例如运行的命令和性能指标）以及**您的提示和回答**以改进模型。
- **使用 Gemini Code Assist for Workspace、Standard 或 Enterprise 的 Google 账户**：此设置仅控制匿名遥测数据的收集。无论此设置如何，您的提示和回答都不会被收集。
- **通过 Gemini Developer API 使用 Gemini API 密钥**：
  **免费服务**：启用后，此设置允许 Google 收集匿名遥测数据（例如运行的命令和性能指标）以及**您的提示和回答**以改进模型。禁用后，我们将根据 [Google 如何使用您的数据](https://ai.google.dev/gemini-api/terms#data-use-unpaid) 中的描述使用您的数据。
  **付费服务**：此设置仅控制匿名遥测数据的收集。Google 会在有限的时间内记录提示和响应，仅用于检测违反禁止使用政策的行为以及任何必要的法律或监管披露。
- **通过 Vertex AI GenAI API 使用 Gemini API 密钥：** 此设置仅控制匿名遥测数据的收集。无论此设置如何，您的提示和回答都不会被收集。

您可以通过按照 [使用统计信息配置](./cli/configuration.md#usage-statistics) 文档中的说明为任何账户类型禁用使用统计信息。