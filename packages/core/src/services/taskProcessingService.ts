/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Config } from '../config/config.js';
import { ReadFileTool } from '../tools/read-file.js';
import { WriteFileTool } from '../tools/write-file.js';
import { EditTool } from '../tools/edit.js';
import { GeminiClient } from '../core/client.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  associatedRequirement?: string;
  filePath?: string;
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  message: string;
  updatedTask?: Task;
}

export class TaskProcessingService {
  private config: Config;
  private geminiClient: GeminiClient;

  constructor(config: Config) {
    this.config = config;
    this.geminiClient = config.getGeminiClient();
  }

  /**
   * 读取任务文件并解析任务列表
   * @param specName 规范名称
   * @returns 任务列表
   */
  async loadTasks(specName: string): Promise<Task[]> {
    const tasksFilePath = path.join(
      this.config.getProjectRoot(),
      'specs',
      specName,
      'tasks.md'
    );
    
    if (!fs.existsSync(tasksFilePath)) {
      return [];
    }

    const readFileTool = new ReadFileTool(this.config);
    const result = await readFileTool.execute({
      absolute_path: tasksFilePath
    }, new AbortController().signal);

    if (typeof result === 'string') {
      return this.parseTasksFromMarkdown(result);
    }
    
    return [];
  }

  /**
   * 从 Markdown 内容中解析任务
   * @param content Markdown 内容
   * @returns 任务列表
   */
  private parseTasksFromMarkdown(content: string): Task[] {
    const tasks: Task[] = [];
    const lines = content.split('\n');
    let currentTask: Partial<Task> | null = null;
    let taskIdCounter = 1;

    for (const line of lines) {
      // 匹配任务项，例如: - [ ] 任务 1：任务简述
      const taskMatch = line.match(/^\-\s*\[([ x])\]\s*(.+)$/);
      if (taskMatch) {
        // 如果有上一个任务，保存它
        if (currentTask) {
          tasks.push(currentTask as Task);
        }

        // 创建新任务
        const isChecked = taskMatch[1] === 'x';
        const title = taskMatch[2].trim();
        
        currentTask = {
          id: `task-${taskIdCounter++}`,
          title,
          description: '',
          status: isChecked ? 'completed' : 'pending'
        };
      } else if (currentTask && line.trim().startsWith('- 描述：')) {
        currentTask.description = line.trim().substring('- 描述：'.length).trim();
      } else if (currentTask && line.trim().startsWith('- 关联需求：')) {
        currentTask.associatedRequirement = line.trim().substring('- 关联需求：'.length).trim();
      }
    }

    // 添加最后一个任务
    if (currentTask) {
      tasks.push(currentTask as Task);
    }

    return tasks;
  }

  /**
   * 获取未执行的任务
   * @param tasks 任务列表
   * @returns 未执行的任务列表
   */
  getPendingTasks(tasks: Task[]): Task[] {
    return tasks.filter(task => task.status === 'pending');
  }

  /**
   * 执行单个任务
   * @param task 要执行的任务
   * @returns 执行结果
   */
  async executeTask(task: Task): Promise<TaskExecutionResult> {
    try {
      // 这里应该调用模型来执行具体任务
      // 目前我们模拟任务执行
      task.status = 'in-progress';
      
      // 调用模型执行任务
      const result = await this.executeTaskWithModel(task);
      
      // 更新任务状态
      task.status = result.success ? 'completed' : 'failed';
      
      return {
        taskId: task.id,
        success: result.success,
        message: result.message,
        updatedTask: task
      };
    } catch (error) {
      task.status = 'failed';
      return {
        taskId: task.id,
        success: false,
        message: `执行任务时出错: ${error instanceof Error ? error.message : String(error)}`,
        updatedTask: task
      };
    }
  }

  /**
   * 调用模型执行任务
   * @param task 要执行的任务
   * @returns 执行结果
   */
  private async executeTaskWithModel(task: Task): Promise<{ success: boolean; message: string }> {
    // 构建提示词，指导模型执行任务
    const prompt = `
请执行以下开发任务：

任务标题: ${task.title}
任务描述: ${task.description}
关联需求: ${task.associatedRequirement || '无'}

请根据任务要求执行相应的操作。如果任务涉及文件操作，请使用适当的工具。
完成后，请提供执行结果的简要说明。
`;

    try {
      const chat = await this.geminiClient.getChat();
      const response = await chat.sendMessage({
        message: [{ text: prompt }],
        config: {}
      }, Math.random().toString(16).slice(2));

      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          const resultText = candidate.content.parts
            .filter(part => part.text)
            .map(part => part.text)
            .join('');
          
          return {
            success: true,
            message: resultText
          };
        }
      }
      
      return {
        success: true,
        message: '任务执行完成'
      };
    } catch (error) {
      return {
        success: false,
        message: `模型执行任务时出错: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 分析任务执行状态
   * @param task 任务
   * @param executionResult 执行结果
   * @returns 状态分析结果
   */
  async analyzeTaskStatus(task: Task, executionResult: TaskExecutionResult): Promise<boolean> {
    const prompt = `
请分析以下任务的执行状态是否达成预期：

任务标题: ${task.title}
任务描述: ${task.description}
执行结果: ${executionResult.message}

请判断任务是否已正确完成并达到预期目标。如果任务完成，请回复"YES"；如果未完成或需要调整，请回复"NO"并简要说明原因。
`;

    try {
      const chat = await this.geminiClient.getChat();
      const response = await chat.sendMessage({
        message: [{ text: prompt }],
        config: {}
      }, Math.random().toString(16).slice(2));

      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          const analysisResult = candidate.content.parts
            .filter(part => part.text)
            .map(part => part.text)
            .join('')
            .trim()
            .toUpperCase();
          
          return analysisResult.startsWith('YES');
        }
      }
      
      // 默认认为任务未完成
      return false;
    } catch (error) {
      console.error('分析任务状态时出错:', error);
      return false;
    }
  }

  /**
   * 动态更新任务内容与状态
   * @param task 任务
   * @param updates 更新内容
   * @returns 更新后的任务
   */
  updateTask(task: Task, updates: Partial<Task>): Task {
    return { ...task, ...updates };
  }
}
