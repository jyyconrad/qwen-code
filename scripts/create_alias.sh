#!/bin/bash

# 此脚本为 Gemini CLI 创建别名

# 确定项目目录
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ALIAS_COMMAND="alias gemini='node $PROJECT_DIR/scripts/start.js'"

# 检测 shell 并设置配置文件路径
if [[ "$SHELL" == *"/bash" ]]; then
    CONFIG_FILE="$HOME/.bashrc"
elif [[ "$SHELL" == *"/zsh" ]]; then
    CONFIG_FILE="$HOME/.zshrc"
else
    echo "不支持的 shell。仅支持 bash 和 zsh。"
    exit 1
fi

echo "此脚本将向您的 shell 配置文件 ($CONFIG_FILE) 添加以下别名："
echo "  $ALIAS_COMMAND"
echo ""

# 检查别名是否已存在
if grep -q "alias gemini=" "$CONFIG_FILE"; then
    echo "'gemini' 别名已在 $CONFIG_FILE 中存在。未进行任何更改。"
    exit 0
fi

read -p "是否继续？(y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "$ALIAS_COMMAND" >> "$CONFIG_FILE"
    echo ""
    echo "别名已添加到 $CONFIG_FILE。"
    echo "请运行 'source $CONFIG_FILE' 或打开新终端以使用 'gemini' 命令。"
else
    echo "已中止。未进行任何更改。"
fi