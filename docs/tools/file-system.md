# Gemini CLI 文件系统工具

Gemini CLI 提供了一整套用于与本地文件系统交互的工具。这些工具允许 Gemini 模型在您的控制下读取、写入、列出、搜索和修改文件及目录，通常在执行敏感操作时需要确认。

**注意：** 所有文件系统工具都在一个 `rootDirectory`（通常是您启动 CLI 的当前工作目录）中运行以确保安全性。您提供给这些工具的路径通常应为绝对路径，或者会相对于此根目录进行解析。

## 1. `list_directory` (ReadFolder)

`list_directory` 列出指定目录路径中的文件和子目录名称。它可以选择性地忽略与提供的 glob 模式匹配的条目。

- **工具名称：** `list_directory`
- **显示名称：** ReadFolder
- **文件：** `ls.ts`
- **参数：**
  - `path`（字符串，必需）：要列出的目录的绝对路径。
  - `ignore`（字符串数组，可选）：要从列表中排除的 glob 模式列表（例如 `["*.log", ".git"]`）。
  - `respect_git_ignore`（布尔值，可选）：在列出文件时是否遵循 `.gitignore` 模式。默认为 `true`。
- **行为：**
  - 返回文件和目录名称的列表。
  - 指示每个条目是否为目录。
  - 按目录优先、然后按字母顺序排序条目。
- **输出 (`llmContent`)：** 类似于以下内容的字符串：`Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **确认：** 否。

## 2. `read_file` (ReadFile)

`read_file` 读取并返回指定文件的内容。该工具处理文本、图像（PNG、JPG、GIF、WEBP、SVG、BMP）和 PDF 文件。对于文本文件，它可以读取特定的行范围。其他二进制文件类型通常会被跳过。

- **工具名称：** `read_file`
- **显示名称：** ReadFile
- **文件：** `read-file.ts`
- **参数：**
  - `path`（字符串，必需）：要读取的文件的绝对路径。
  - `offset`（数字，可选）：对于文本文件，从 0 开始的行号开始读取。需要设置 `limit`。
  - `limit`（数字，可选）：对于文本文件，要读取的最大行数。如果省略，则读取默认最大值（例如 2000 行）或尽可能读取整个文件。
- **行为：**
  - 对于文本文件：返回内容。如果使用了 `offset` 和 `limit`，则仅返回该行片段。如果内容因行数限制或行长度限制而被截断，则会指明。
  - 对于图像和 PDF 文件：返回适合模型使用的 base64 编码的数据结构。
  - 对于其他二进制文件：尝试识别并跳过它们，并返回消息指示这是一个通用二进制文件。
- **输出：** (`llmContent`)：
  - 对于文本文件：文件内容，可能以截断消息为前缀（例如 `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 对于图像/PDF 文件：包含 `inlineData` 的对象，其中包含 `mimeType` 和 base64 `data`（例如 `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - 对于其他二进制文件：类似 `Cannot display content of binary file: /path/to/data.bin` 的消息。
- **确认：** 否。

## 3. `write_file` (WriteFile)

`write_file` 将内容写入指定文件。如果文件存在，则会被覆盖。如果文件不存在，则会创建它（以及任何必要的父目录）。

- **工具名称：** `write_file`
- **显示名称：** WriteFile
- **文件：** `write-file.ts`
- **参数：**
  - `file_path`（字符串，必需）：要写入的文件的绝对路径。
  - `content`（字符串，必需）：要写入文件的内容。
- **行为：**
  - 将提供的 `content` 写入 `file_path`。
  - 如果不存在父目录，则创建它们。
- **输出 (`llmContent`)：** 成功消息，例如 `Successfully overwrote file: /path/to/your/file.txt` 或 `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **确认：** 是。在写入之前显示更改的差异并请求用户批准。

## 4. `glob` (FindFiles)

`glob` 查找与特定 glob 模式（例如 `src/**/*.ts`、`*.md`）匹配的文件，返回按修改时间排序的绝对路径（最新的在前）。

- **工具名称：** `glob`
- **显示名称：** FindFiles
- **文件：** `glob.ts`
- **参数：**
  - `pattern`（字符串，必需）：要匹配的 glob 模式（例如 `"*.py"`、`"src/**/*.js"`）。
  - `path`（字符串，可选）：要搜索的目录的绝对路径。如果省略，则搜索工具的根目录。
  - `case_sensitive`（布尔值，可选）：搜索是否区分大小写。默认为 `false`。
  - `respect_git_ignore`（布尔值，可选）：在查找文件时是否遵循 .gitignore 模式。默认为 `true`。
- **行为：**
  - 在指定目录中搜索与 glob 模式匹配的文件。
  - 返回按最近修改时间排序的绝对路径列表（最新的在前）。
  - 默认忽略常见的烦人目录，如 `node_modules` 和 `.git`。
- **输出 (`llmContent`)：** 类似于以下内容的消息：`Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **确认：** 否。

## 5. `search_file_content` (SearchText)

`search_file_content` 在指定目录中文件的内容中搜索正则表达式模式。可以通过 glob 模式过滤文件。返回包含匹配项的行及其文件路径和行号。

- **工具名称：** `search_file_content`
- **显示名称：** SearchText
- **文件：** `grep.ts`
- **参数：**
  - `pattern`（字符串，必需）：要搜索的正则表达式（regex）（例如 `"function\s+myFunction"`）。
  - `path`（字符串，可选）：要搜索的目录的绝对路径。默认为当前工作目录。
  - `include`（字符串，可选）：用于过滤要搜索文件的 glob 模式（例如 `"*.js"`、`"src/**/*.{ts,tsx}"`）。如果省略，则搜索大多数文件（遵循常见忽略规则）。
- **行为：**
  - 如果在 Git 仓库中可用，则使用 `git grep` 以提高速度，否则回退到系统 `grep` 或基于 JavaScript 的搜索。
  - 返回匹配行的列表，每行前缀为其文件路径（相对于搜索目录）和行号。
- **输出 (`llmContent`)：** 格式化的匹配字符串，例如：
  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  File: src/utils.ts
  L15: export function myFunction() {
  L22:   myFunction.call();
  ---
  File: src/index.ts
  L5: import { myFunction } from './utils';
  ---
  ```
- **确认：** 否。

## 6. `replace` (Edit)

`replace` 替换文件中的文本。默认情况下，替换单个出现项，但当指定 `expected_replacements` 时可以替换多个出现项。该工具旨在进行精确、有针对性的更改，并要求在 `old_string` 周围提供大量上下文以确保修改正确的位置。

- **工具名称：** `replace`
- **显示名称：** Edit
- **文件：** `edit.ts`
- **参数：**
  - `file_path`（字符串，必需）：要修改的文件的绝对路径。
  - `old_string`（字符串，必需）：要替换的确切文本。

    **关键：** 此字符串必须唯一标识要更改的单个实例。它应包含目标文本前后至少 3 行的上下文，精确匹配空白和缩进。如果 `old_string` 为空，工具会尝试在 `file_path` 创建一个新文件，并将 `new_string` 作为内容。

  - `new_string`（字符串，必需）：要替换 `old_string` 的确切文本。
  - `expected_replacements`（数字，可选）：要替换的出现项数量。默认为 `1`。

- **行为：**
  - 如果 `old_string` 为空且 `file_path` 不存在，则创建一个新文件，并将 `new_string` 作为内容。
  - 如果提供了 `old_string`，则读取 `file_path` 并尝试找到恰好一个 `old_string` 的出现项。
  - 如果找到一个出现项，则将其替换为 `new_string`。
  - **增强可靠性（多阶段编辑校正）：** 为了显著提高编辑的成功率，尤其是在模型提供的 `old_string` 可能不够精确的情况下，该工具包含一个多阶段编辑校正机制。
    - 如果初始 `old_string` 未找到或匹配多个位置，工具可以利用 Gemini 模型迭代优化 `old_string`（以及可能的 `new_string`）。
    - 此自我校正过程尝试识别模型打算修改的唯一段落，使 `replace` 操作即使在初始上下文略有不精确的情况下也更加稳健。
- **失败条件：** 尽管有校正机制，但在以下情况下工具仍会失败：
  - `file_path` 不是绝对路径或位于根目录之外。
  - `old_string` 不为空，但 `file_path` 不存在。
  - `old_string` 为空，但 `file_path` 已存在。
  - 在尝试校正后，`old_string` 未在文件中找到。
  - `old_string` 被找到多次，且自我校正机制无法将其解析为唯一、明确的匹配。
- **输出 (`llmContent`)：**
  - 成功时：`Successfully modified file: /path/to/file.txt (1 replacements).` 或 `Created new file: /path/to/new_file.txt with provided content.`
  - 失败时：解释原因的错误消息（例如 `Failed to edit, 0 occurrences found...`, `Failed to edit, expected 1 occurrences but found 2...`）。
- **确认：** 是。在写入文件之前显示建议更改的差异并请求用户批准。

这些文件系统工具为 Gemini CLI 提供了理解并与您的本地项目上下文交互的基础。