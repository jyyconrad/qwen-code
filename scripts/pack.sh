#!/bin/bash

# 首先构建包
npm run build:packages

# 打包 CLI 包
cd packages/cli && npm pack && cd ../../

# 打包核心包  
cd packages/core && npm pack && cd ../../

# 使用绝对路径将 tgz 文件移动到根目录
cp packages/cli/*.tgz ./
cp packages/core/*.tgz ./

# 从包目录中删除原始文件
rm packages/cli/*.tgz
rm packages/core/*.tgz

echo "包创建成功："
ls -la *.tgz
