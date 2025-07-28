# 内存导入处理器

内存导入处理器是一项功能，它允许你通过使用 `@file.md` 语法导入其他 Markdown 文件的内容，从而将你的 GEMINI.md 文件模块化。

## 概述

该功能使你可以将大型 GEMINI.md 文件拆分为更小、更易管理的组件，这些组件可以在不同的上下文中重复使用。导入处理器支持相对路径和绝对路径，并内置了安全功能以防止循环导入并确保文件访问安全。

## 重要限制

**此功能仅支持 `.md`（Markdown）文件。** 尝试导入其他扩展名的文件（如 `.txt`、`.json` 等）将导致警告，并且导入会失败。

## 语法

使用 `@` 符号后接你想要导入的 Markdown 文件路径：

```markdown
# 主 GEMINI.md 文件

这是主要内容。

@./components/instructions.md

更多内容。

@./shared/configuration.md
```

## 支持的路径格式

### 相对路径

- `@./file.md` - 从当前目录导入
- `@../file.md` - 从父目录导入
- `@./components/file.md` - 从子目录导入

### 绝对路径

- `@/absolute/path/to/file.md` - 使用绝对路径导入

## 示例

### 基本导入

```markdown
# 我的 GEMINI.md

欢迎来到我的项目！

@./getting-started.md

## 特性

@./features/overview.md
```

### 嵌套导入

导入的文件本身也可以包含导入，从而创建嵌套结构：

```markdown
# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown
# header.md

# 项目标题

@./shared/title.md
```

## 安全特性

### 循环导入检测

处理器会自动检测并阻止循环导入：

```markdown
# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- 此处将被检测到并阻止 -->
```

### 文件访问安全

`validateImportPath` 函数确保仅允许从指定目录中导入文件，防止访问允许范围之外的敏感文件。

### 最大导入深度

为防止无限递归，可配置最大导入深度（默认：10 层）。

## 错误处理

### 非 Markdown 文件尝试导入

如果你尝试导入非 Markdown 文件，你将看到警告：

```markdown
@./instructions.txt <!-- 此处将显示警告并失败 -->
```

控制台输出：

```
[WARN] [ImportProcessor] 导入处理器仅支持 .md 文件。尝试导入非 .md 文件：./instructions.txt。这将失败。
```

### 缺失文件

如果引用的文件不存在，导入将优雅失败，并在输出中显示错误注释。

### 文件访问错误

权限问题或其他文件系统错误将通过适当的错误消息优雅处理。

## API 参考

### `processImports(content, basePath, debugMode?, importState?)`

处理 GEMINI.md 内容中的导入语句。

**参数：**

- `content`（字符串）：需要处理导入的内容
- `basePath`（字符串）：当前文件所在的目录路径
- `debugMode`（布尔值，可选）：是否启用调试日志（默认：false）
- `importState`（ImportState，可选）：用于防止循环导入的状态跟踪

**返回：** Promise<string> - 包含已解析导入的内容

### `validateImportPath(importPath, basePath, allowedDirectories)`

验证导入路径以确保其安全并在允许的目录范围内。

**参数：**

- `importPath`（字符串）：要验证的导入路径
- `basePath`（字符串）：用于解析相对路径的基础目录
- `allowedDirectories`（字符串数组）：允许的目录路径数组

**返回：** 布尔值 - 表示导入路径是否有效

## 最佳实践

1. **使用描述性文件名** 用于导入的组件
2. **保持导入层级浅** - 避免深度嵌套的导入链
3. **记录你的结构** - 维护一个清晰的导入文件层级结构
4. **测试你的导入** - 确保所有引用的文件都存在且可访问
5. **尽可能使用相对路径** 以提高可移植性

## 故障排除

### 常见问题

1. **导入不起作用**：检查文件是否存在且具有 `.md` 扩展名
2. **循环导入警告**：检查导入结构是否存在循环引用
3. **权限错误**：确保文件可读且位于允许的目录中
4. **路径解析问题**：如果相对路径无法正确解析，请使用绝对路径

### 调试模式

启用调试模式以查看导入过程的详细日志：

```typescript
const result = await processImports(content, basePath, true);
```