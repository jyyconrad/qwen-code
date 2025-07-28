# 集成测试

本文档提供了有关本项目中使用的集成测试框架的信息。

## 概述

集成测试旨在验证 Gemini CLI 的端到端功能。它们在一个受控环境中执行构建后的二进制文件，并验证其与文件系统交互时是否按预期运行。

这些测试位于 `integration-tests` 目录中，并通过自定义测试运行器执行。

## 运行测试

集成测试不会作为默认的 `npm run test` 命令的一部分运行。必须使用 `npm run test:integration:all` 脚本显式运行它们。

也可以使用以下快捷方式运行集成测试：

```bash
npm run test:e2e
```

## 运行特定的测试集

要运行部分测试文件，可以使用 `npm run <integration test command> <file_name1> ...`，其中 `<integration test command>` 可以是 `test:e2e` 或 `test:integration*`，而 `<file_name>` 是 `integration-tests/` 目录中的任意 `.test.js` 文件。例如，以下命令运行 `list_directory.test.js` 和 `write_file.test.js`：

```bash
npm run test:e2e list_directory write_file
```

### 按名称运行单个测试

要按名称运行单个测试，请使用 `--test-name-pattern` 标志：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 运行所有测试

要运行完整的集成测试套件，请使用以下命令：

```bash
npm run test:integration:all
```

### 沙箱矩阵

`all` 命令将运行 `no sandboxing`、`docker` 和 `podman` 的测试。  
每个单独的类型都可以使用以下命令运行：

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## 诊断

集成测试运行器提供了多种诊断选项，以帮助追踪测试失败的原因。

### 保留测试输出

您可以保留测试运行期间创建的临时文件以供检查。这对于调试文件系统操作问题非常有用。

要保留测试输出，可以使用 `--keep-output` 标志，或将 `KEEP_OUTPUT` 环境变量设置为 `true`。

```bash
# 使用标志
npm run test:integration:sandbox:none -- --keep-output

# 使用环境变量
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

当保留输出时，测试运行器会打印测试运行的唯一目录路径。

### 详细输出

为了更详细的调试，`--verbose` 标志会将 `gemini` 命令的实时输出流式传输到控制台。

```bash
npm run test:integration:sandbox:none -- --verbose
```

在同一个命令中使用 `--verbose` 和 `--keep-output` 时，输出会流式传输到控制台，并同时保存到测试的临时目录中的日志文件内。

详细输出的格式清晰地标识了日志的来源：

```
--- TEST: <file-name-without-js>:<test-name> ---
... output from the gemini command ...
--- END TEST: <file-name-without-js>:<test-name> ---
```

## 检查和格式化

为了确保代码质量和一致性，集成测试文件会在主构建过程中进行 lint 检查。您也可以手动运行 linter 和自动修复工具。

### 运行 linter

要检查 lint 错误，请运行以下命令：

```bash
npm run lint
```

您可以在命令中添加 `--fix` 标志，以自动修复所有可修复的 lint 错误：

```bash
npm run lint -- --fix
```

## 目录结构

集成测试会在 `.integration-tests` 目录内的每次测试运行中创建一个唯一目录。在该目录中，每个测试文件会创建一个子目录，每个子目录中又为每个单独的测试用例创建一个子目录。

这种结构使得定位特定测试运行、文件或用例的产物变得简单。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## 持续集成

为了确保始终运行集成测试，在 `.github/workflows/e2e.yml` 中定义了一个 GitHub Actions 工作流。该工作流会在每次拉取请求和推送到 `main` 分支时自动运行集成测试。

该工作流在不同的沙箱环境中运行测试，以确保 Gemini CLI 在每种环境下都经过测试：

- `sandbox:none`：不使用任何沙箱运行测试。
- `sandbox:docker`：在 Docker 容器中运行测试。
- `sandbox:podman`：在 Podman 容器中运行测试。