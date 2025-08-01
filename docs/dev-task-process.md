# 开发任务处理流程

## 简介

开发任务处理流程是一个结构化的方法来处理软件开发任务，它包括三个主要阶段：
1. 需求文档与验收标准设计
2. 技术方案设计
3. 任务拆分与执行

此流程可以通过配置选项启用或禁用。

## 配置

要启用开发任务处理流程，需要在设置文件中配置以下选项：

```json
{
  "developmentTaskSettings": {
    "enabled": true
  }
}
```

## 使用方法

当启用开发任务处理流程后，系统将自动加载专门的系统提示词，指导AI助手按照结构化流程处理任务。

### 1. 需求文档与验收标准设计

使用 **EARS（简化）模板**编写需求，文件保存在：
`项目目录/specs/<spec_name>/specs.md`

### 2. 技术方案设计

根据确认后的需求，设计技术方案并保存至：
`项目目录/specs/<spec_name>/design.md`

### 3. 任务拆分与执行

基于需求与方案，将工作任务进行拆分并记录于：
`项目目录/specs/<spec_name>/tasks.md`

系统将自动读取未执行的任务，交由模型执行，并在每次执行完成后分析任务状态。

## 任务格式

任务文件遵循以下格式：

```markdown
# 实施计划
- [ ] 任务 1：任务简述
  - 描述：具体要做的事情
  - 关联需求：需求编号（如：需求 1）
- [ ] 任务 2：……
```

## 动态任务更新

在任务执行过程中，系统会分析任务执行状态，当实际情况有偏差时，可以动态变更任务内容与状态。