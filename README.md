# iFlyCode

![iFlyCode Screenshot](./docs/assets/iflycode-screenshot.png)

iFlyCode is a command-line AI workflow tool adapted from [**Gemini CLI**](https://github.com/google-gemini/gemini-cli) (Please refer to [this document](./README.gemini.md) for more details), optimized for [iFlyCode3-Coder](https://github.com/iFlyCodeLM/iFlyCode3-Coder) models with enhanced parser support & tool support.

> [!WARNING]
> iFlyCode may issue multiple API calls per cycle, resulting in higher token usage, similar to Claude Code. We’re actively working to enhance API efficiency and improve the overall developer experience.

## Key Features

- **Code Understanding & Editing** - Query and edit large codebases beyond traditional context window limits
- **Workflow Automation** - Automate operational tasks like handling pull requests and complex rebases
- **Enhanced Parser** - Adapted parser specifically optimized for iFlyCode-Coder models

## Quick Start

### Prerequisites

Ensure you have [Node.js version 20](https://nodejs.org/en/download) or higher installed.

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### Installation

```bash
npm install -g @iflytek/iflycode
iflycode --version
```

Then run from anywhere:

```bash
iflycode
```

Or you can install it from source:

```bash
git clone https://github.com/iFlyCodeLM/iflycode-code.git
cd iflycode-code
npm install
npm install -g .
```

### API Configuration

Set your iFlyCode API key (In iFlyCode project, you can also set your API key in `.env` file). the `.env` file should be placed in the root directory of your current project.

> ⚠️ **Notice:** <br>
> **If you are in mainland China, please go to https://bailian.console.aliyun.com/ or https://modelscope.cn/docs/model-service/API-Inference/intro to apply for your API key** <br>
> **If you are not in mainland China, please go to https://modelstudio.console.alibabacloud.com/ to apply for your API key**

If you are in mainland China, you can use iFlyCode3-Coder through the Alibaba Cloud bailian platform.

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="deepseek-v3"
```

If you are in mainland China, ModelScope offers 2,000 free model inference API calls per day:

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="iFlyCode/iFlyCode3-Coder-480B-A35B-Instruct"
```

iflycodeou are not in mainland China, you can use iFlyCode3-Coder through the Alibaba Cloud modelstuido platform.

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="deepseek-v3"
```

## Usage Examples

### Explore Codebases

```sh
cd your-project/
iflycode
> Describe the main pieces of this system's architecture
```

### Code Development

```sh
> Refactor this function to improve readability and performance
```

### Automate Workflows

```sh
> Analyze git commits from the last 7 days, grouped by feature and team member
```

```sh
> Convert all images in this directory to PNG format
```

## Popular Tasks

### Understand New Codebases

```text
> What are the core business logic components?
> What security mechanisms are in place?
> How does the data flow work?
```

### Code Refactoring & Optimization

```text
> What parts of this module can be optimized?
> Help me refactor this class to follow better design patterns
> Add proper error handling and logging
```

### Documentation & Testing

```text
> Generate comprehensive JSDoc comments for this function
> Write unit tests for this component
iflycodeeate API documentation
```

## Benchmark Results

### Terminal-Bench

| Agent     | Model              | Accuracy |
| --------- | ------------------ | -------- |
| iFlyCode | iFlyCode3-Coder-480A35 | 37.5     |

## Project Structure

```
iflycode-code/
├── packages/           # Core packages
├── docs/              # Documentation
├── examples/          # Example code
└── tests/            # Test files
```

## Development & Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to learn how to contribute to the project.

## Troubleshootingiflycodeiflycode

If you encounter issues, check the [troubleshooting guide](docs/troubleshooting.md).

## Acknowledgments

This project is based on [Google Gemini CLI](https://github.com/google-gemini/gemini-cli). We acknowledge and appreciate the excellent work of the Gemini CLI team. Our main contribution focuses on parser-level adaptations to better support iFlyCode-Coder models.

## License

[LICENSE](./LICENSE)


