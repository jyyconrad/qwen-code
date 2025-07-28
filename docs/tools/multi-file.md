# 多文件读取工具（`read_many_files`）

本文档描述了 Gemini CLI 中的 `read_many_files` 工具。

## 描述

使用 `read_many_files` 可以从由路径或 glob 模式指定的多个文件中读取内容。该工具的行为取决于提供的文件：

- 对于文本文件，该工具将其内容连接成一个字符串。
- 对于图像（例如 PNG、JPEG）、PDF、音频（MP3、WAV）和视频（MP4、MOV）文件，只要它们是通过名称或扩展名显式请求的，该工具会读取并以 base64 编码的数据形式返回。

`read_many_files` 可用于执行诸如获取代码库概览、查找特定功能的实现位置、查阅文档或从多个配置文件中收集上下文等任务。

### 参数

`read_many_files` 接受以下参数：

- `paths`（list[string]，必需）：glob 模式或相对于工具目标目录的路径数组（例如 `["src/**/*.ts"]`、`["README.md", "docs/", "assets/logo.png"]`）。
- `exclude`（list[string]，可选）：要排除的文件/目录的 glob 模式（例如 `["**/*.log", "temp/"]`）。如果 `useDefaultExcludes` 为 true，则这些模式会添加到默认排除列表中。
- `include`（list[string]，可选）：要额外包含的 glob 模式。这些模式会与 `paths` 合并（例如，使用 `["*.test.ts"]` 来在广泛排除后特别添加测试文件，或使用 `["images/*.jpg"]` 来包含特定类型的图像）。
- `recursive`（boolean，可选）：是否递归搜索。这主要由 glob 模式中的 `**` 控制。默认为 `true`。
- `useDefaultExcludes`（boolean，可选）：是否应用默认排除模式列表（例如 `node_modules`、`.git`、未显式请求的非图像/PDF 二进制文件）。默认为 `true`。
- `respect_git_ignore`（boolean，可选）：在查找文件时是否遵循 .gitignore 模式。默认为 `true`。

## 如何在 Gemini CLI 中使用 `read_many_files`

`read_many_files` 会搜索匹配提供的 `paths` 和 `include` 模式的文件，同时尊重 `exclude` 模式和默认排除项（如果启用）。

- 对于文本文件：它会读取每个匹配文件的内容（尝试跳过未显式请求为图像/PDF 的二进制文件），并将其连接成一个字符串，每个文件内容之间用分隔符 `--- {filePath} ---` 分隔。默认使用 UTF-8 编码。
- 对于图像和 PDF 文件：如果通过名称或扩展名显式请求（例如 `paths: ["logo.png"]` 或 `include: ["*.pdf"]`），该工具会读取文件并以其 base64 编码字符串形式返回内容。
- 该工具会尝试检测并跳过其他二进制文件（那些不匹配常见图像/PDF 类型或未显式请求的文件），方法是检查其初始内容中是否存在空字节。

使用方式：

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` 示例

读取 `src` 目录下的所有 TypeScript 文件：

```
read_many_files(paths=["src/**/*.ts"])
```

读取主 README、`docs` 目录中的所有 Markdown 文件以及特定的 logo 图像，排除一个特定文件：

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

读取所有 JavaScript 文件，但显式包含测试文件和 `images` 文件夹中的所有 JPEG 文件：

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要注意事项

- **二进制文件处理：**
  - **图像/PDF/音频/视频文件：** 该工具可以读取常见的图像类型（PNG、JPEG 等）、PDF、音频（mp3、wav）和视频（mp4、mov）文件，并将其以 base64 编码的数据形式返回。这些文件 _必须_ 通过 `paths` 或 `include` 模式显式指定（例如通过指定确切的文件名如 `video.mp4` 或模式如 `*.mov`）。
  - **其他二进制文件：** 该工具会尝试通过检查其初始内容中是否存在空字节来检测并跳过其他类型的二进制文件。这些文件将被排除在其输出之外。
- **性能：** 读取大量文件或非常大的单个文件可能会消耗较多资源。
- **路径精确性：** 确保路径和 glob 模式是相对于工具目标目录正确指定的。对于图像/PDF 文件，确保模式足够具体以包含它们。
- **默认排除项：** 注意默认排除模式（如 `node_modules`、`.git`），如果需要覆盖它们，请使用 `useDefaultExcludes=False`，但应谨慎操作。