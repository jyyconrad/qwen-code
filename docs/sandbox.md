# Gemini CLI 中的沙盒功能

本文档提供了 Gemini CLI 沙盒功能的指南，包括先决条件、快速入门和配置说明。

## 先决条件

在使用沙盒功能之前，你需要安装并配置 Gemini CLI：

```bash
npm install -g @google/gemini-cli
```

验证安装：

```bash
gemini --version
```

## 沙盒概述

沙盒功能将潜在的危险操作（如 shell 命令或文件修改）与你的主机系统隔离，为 AI 操作与你的环境之间提供了一道安全屏障。

沙盒的好处包括：

- **安全性**：防止意外的系统损坏或数据丢失。
- **隔离性**：限制文件系统访问仅限于项目目录。
- **一致性**：确保在不同系统上环境可重复。
- **安全性**：在处理不受信任的代码或实验性命令时降低风险。

## 沙盒方法

你理想的沙盒方法可能因平台和偏好的容器解决方案而异。

### 1. macOS Seatbelt（仅 macOS）

使用 `sandbox-exec` 的轻量级内置沙盒。

**默认配置文件**：`permissive-open` - 限制对项目目录外的写入，但允许大多数其他操作。

### 2. 基于容器（Docker/Podman）

跨平台沙盒，具有完整的进程隔离。

**注意**：需要在本地构建沙盒镜像，或使用来自你组织仓库的已发布镜像。

## 快速入门

```bash
# 使用命令标志启用沙盒
gemini -s -p "分析代码结构"

# 使用环境变量
export GEMINI_SANDBOX=true
gemini -p "运行测试套件"

# 在 settings.json 中配置
{
  "sandbox": "docker"
}
```

## 配置

### 启用沙盒（优先级顺序）

1. **命令标志**：`-s` 或 `--sandbox`
2. **环境变量**：`GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **设置文件**：在 `settings.json` 中 `"sandbox": true`

### macOS Seatbelt 配置文件

内置配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：写入限制，允许网络
- `permissive-closed`：写入限制，无网络
- `permissive-proxied`：写入限制，通过代理访问网络
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制

## Linux UID/GID 处理

沙盒会自动处理 Linux 上的用户权限。你可以通过以下方式覆盖这些权限：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用主机 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 故障排除

### 常见问题

**“Operation not permitted（操作不允许）”**

- 操作需要访问沙盒外部。
- 尝试使用更宽松的配置文件或添加挂载点。

**缺少命令**

- 添加到自定义 Dockerfile。
- 通过 `sandbox.bashrc` 安装。

**网络问题**

- 检查沙盒配置文件是否允许网络。
- 验证代理配置。

### 调试模式

```bash
DEBUG=1 gemini -s -p "调试命令"
```

### 检查沙盒

```bash
# 检查环境
gemini -s -p "运行 shell 命令: env | grep SANDBOX"

# 列出挂载点
gemini -s -p "运行 shell 命令: mount | grep workspace"
```

## 安全注意事项

- 沙盒减少了风险，但不会完全消除所有风险。
- 使用允许你工作的最严格配置文件。
- 容器的开销在首次构建后非常小。
- GUI 应用程序可能在沙盒中无法运行。

## 相关文档

- [配置](./cli/configuration.md)：完整配置选项。
- [命令](./cli/commands.md)：可用命令。
- [故障排除](./troubleshooting.md)：通用故障排除。