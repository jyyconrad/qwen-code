# 卸载 CLI

你的卸载方法取决于你如何运行 CLI。请根据使用 npx 或全局 npm 安装的方法选择对应的说明。

## 方法 1：使用 npx

npx 从一个临时缓存运行包，而不会永久安装。要“卸载”CLI，你必须清除此缓存，这将删除 gemini-cli 和之前使用 npx 执行的其他包。

npx 缓存是你主 npm 缓存文件夹中名为 `_npx` 的目录。你可以通过运行 `npm config get cache` 查看你的 npm 缓存路径。

**对于 macOS / Linux**

```bash
# 路径通常是 ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**对于 Windows**

_命令提示符_

```cmd
:: 路径通常是 %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# 路径通常是 $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法 2：使用 npm（全局安装）

如果你是通过全局安装 CLI（例如 `npm install -g @google/gemini-cli`），请使用带有 `-g` 标志的 `npm uninstall` 命令将其卸载。

```bash
npm uninstall -g @google/gemini-cli
```

此命令将完全从系统中删除该包。