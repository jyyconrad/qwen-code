/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '@iflytek/iflycode-core';
import { TaskProcessingService, Task } from '../services/taskProcessingService.js';

export class DevelopmentTaskTool {
  static Name = 'development_task_processor';
  
  private config: Config;
  private taskService: TaskProcessingService;

  constructor(config: Config) {
    this.config = config;
    this.taskService = new TaskProcessingService(config);
  }

  getName(): string {
    return DevelopmentTaskTool.Name;
  }

  getDescription(): string {
    return '处理开发任务流程的工具，包括需求文档、技术方案设计和任务执行';
  }

  getParameters(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '要执行的操作: load_tasks, execute_task, analyze_status',
          enum: ['load_tasks', 'execute_task', 'analyze_status']
        },
        specName: {
          type: 'string',
          description: '规范名称，用于定位specs目录下的文件'
        },
        taskId: {
          type: 'string',
          description: '任务ID，用于执行特定任务'
        },
        taskData: {
          type: 'object',
          description: '任务数据，用于更新任务状态'
        }
      },
      required: ['action']
    };
  }

  async execute(args: {
    action: string;
    specName?: string;
    taskId?: string;
    taskData?: Record<string, unknown>;
  }): Promise<string> {
    try {
      switch (args.action) {
        case 'load_tasks':
          return await this.loadTasks(args.specName || '');
        case 'execute_task':
          return await this.executeTask(args.taskId || '');
        case 'analyze_status':
          return await this.analyzeStatus(args.taskId || '', args.taskData || {});
        default:
          return `未知操作: ${args.action}`;
      }
    } catch (error) {
      return `执行开发任务时出错: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async loadTasks(specName: string): Promise<string> {
    if (!specName) {
      return '错误: 未提供规范名称';
    }

    try {
      const tasks = await this.taskService.loadTasks(specName);
      return JSON.stringify({
        success: true,
        tasks: tasks,
        pendingTasks: this.taskService.getPendingTasks(tasks)
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async executeTask(taskId: string): Promise<string> {
    if (!taskId) {
      return '错误: 未提供任务ID';
    }

    try {
      // 这里需要从某个地方获取任务列表，暂时模拟
      // 在实际实现中，我们需要从文件或内存中获取任务列表
      const task: Task = {
        id: taskId,
        title: '示例任务',
        description: '这是一个示例任务',
        status: 'pending'
      };

      const result = await this.taskService.executeTask(task);
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async analyzeStatus(taskId: string, taskData: Record<string, unknown>): Promise<string> {
    if (!taskId) {
      return '错误: 未提供任务ID';
    }

    try {
      // 模拟任务和执行结果
      const task: Task = {
        id: taskId,
        title: taskData.title as string || '未知任务',
        description: taskData.description as string || '',
        status: 'completed'
      };

      const executionResult = {
        taskId,
        success: true,
        message: '任务执行完成'
      };

      const isCompleted = await this.taskService.analyzeTaskStatus(task, executionResult);
      return JSON.stringify({
        success: true,
        isCompleted,
        taskId
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}