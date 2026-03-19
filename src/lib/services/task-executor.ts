/**
 * 任务执行引擎
 * 负责任务队列管理、并发控制、上下文传递
 */

import { createModel } from '@/lib/llm';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseJSON } from '@/lib/utils/json-parser';
import { buildSectionWriterPrompt, extractOutlineSummary, buildDataFillingPrompt } from '@/lib/prompts/section-writer';
import type {
  TaskNode,
  TaskTree,
  TaskStatus,
  TaskProgress,
  ExecutionProgress,
  ContextDependency,
} from '@/types/task-tree';

/**
 * 任务执行器配置
 */
export interface TaskExecutorConfig {
  projectId: string;
  onProgress?: (progress: TaskProgress) => void;
  onPhaseChange?: (phase: string) => void;
  onError?: (taskId: string, error: string) => void;
}

/**
 * 任务执行引擎
 */
export class TaskExecutor {
  private projectId: string;
  private config: TaskExecutorConfig;
  private completedTasks: Map<string, TaskNode> = new Map();
  private llm: ReturnType<typeof createModel>;

  constructor(config: TaskExecutorConfig) {
    this.projectId = config.projectId;
    this.config = config;
    this.llm = createModel({
      enableThinking: false,
      temperature: 0.7,
      maxTokens: 4096,
    });
  }

  /**
   * 执行任务树
   */
  async executeTaskTree(taskTree: TaskTree): Promise<void> {
    console.log(`[TaskExecutor] 开始执行任务树，共 ${taskTree.execution_plan.total_tasks} 个任务`);

    // 按阶段执行
    for (let i = 0; i < taskTree.execution_plan.phases.length; i++) {
      const phase = taskTree.execution_plan.phases[i];
      
      this.config.onPhaseChange?.(phase.phase_name);
      console.log(`[TaskExecutor] 进入阶段: ${phase.phase_name}`);

      // 根据执行模式处理
      if (phase.execution_mode === 'parallel') {
        await this.executeParallel(phase.tasks, taskTree);
      } else if (phase.execution_mode === 'serial') {
        await this.executeSerial(phase.tasks, taskTree);
      } else {
        // conditional 模式：根据依赖关系智能调度
        await this.executeConditional(phase.tasks, taskTree);
      }
    }

    console.log(`[TaskExecutor] 任务树执行完成`);
  }

  /**
   * 并行执行任务
   */
  private async executeParallel(taskIds: string[], taskTree: TaskTree): Promise<void> {
    const tasks = this.findTasksByIds(taskIds, taskTree.tasks);
    
    await Promise.all(
      tasks.map(task => this.executeTask(task, taskTree))
    );
  }

  /**
   * 串行执行任务
   */
  private async executeSerial(taskIds: string[], taskTree: TaskTree): Promise<void> {
    const tasks = this.findTasksByIds(taskIds, taskTree.tasks);
    
    for (const task of tasks) {
      await this.executeTask(task, taskTree);
    }
  }

  /**
   * 条件执行（根据依赖关系）
   */
  private async executeConditional(taskIds: string[], taskTree: TaskTree): Promise<void> {
    const tasks = this.findTasksByIds(taskIds, taskTree.tasks);
    const pending = new Set(tasks.map(t => t.id));
    const running = new Set<string>();

    while (pending.size > 0) {
      // 找出所有依赖已满足的任务
      const ready = tasks.filter(t => 
        pending.has(t.id) && 
        !running.has(t.id) &&
        this.areDependenciesMet(t, taskTree)
      );

      if (ready.length === 0) {
        // 没有就绪的任务，等待正在执行的任务完成
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // 并行执行就绪的任务
      const batch = ready.slice(0, 3); // 限制并发数
      batch.forEach(t => running.add(t.id));
      
      await Promise.all(
        batch.map(task => 
          this.executeTask(task, taskTree).finally(() => {
            pending.delete(task.id);
            running.delete(task.id);
          })
        )
      );
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: TaskNode, taskTree: TaskTree): Promise<void> {
    console.log(`[TaskExecutor] 执行任务: ${task.chapter_name}`);
    
    // 更新状态为运行中
    await this.updateTaskStatus(task.id, 'running', 0);
    this.config.onProgress?.({
      task_id: task.id,
      task_code: task.task_code,
      chapter_name: task.chapter_name,
      status: 'running',
      progress: 0,
    });

    try {
      let content: string | undefined;

      switch (task.task_type) {
        case 'Rule-Based-Form':
          content = await this.executeRuleBasedForm(task, taskTree);
          break;
        case 'Data-Filling':
          content = await this.executeDataFilling(task, taskTree);
          break;
        case 'Text-Generation':
          content = await this.executeTextGeneration(task, taskTree);
          break;
      }

      // 保存结果
      await this.saveTaskResult(task.id, content || '');
      
      // 更新状态
      const finalStatus: TaskStatus = task.review_required ? 'needs_review' : 'completed';
      await this.updateTaskStatus(task.id, finalStatus, 100, content);
      
      // 缓存完成的任务
      this.completedTasks.set(task.id, { ...task, generated_content: content, status: finalStatus });

      this.config.onProgress?.({
        task_id: task.id,
        task_code: task.task_code,
        chapter_name: task.chapter_name,
        status: finalStatus,
        progress: 100,
      });

      console.log(`[TaskExecutor] 任务完成: ${task.chapter_name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error(`[TaskExecutor] 任务失败: ${task.chapter_name}`, error);
      
      await this.updateTaskStatus(task.id, 'failed', 0, undefined, errorMessage);
      this.config.onError?.(task.id, errorMessage);
      
      this.config.onProgress?.({
        task_id: task.id,
        task_code: task.task_code,
        chapter_name: task.chapter_name,
        status: 'failed',
        progress: 0,
        error: errorMessage,
      });
    }
  }

  /**
   * 执行规则表单任务
   */
  private async executeRuleBasedForm(task: TaskNode, taskTree: TaskTree): Promise<string> {
    // 使用模板引擎生成内容
    const template = this.getTemplateForTask(task, taskTree);
    return template;
  }

  /**
   * 执行数据填空任务
   */
  private async executeDataFilling(task: TaskNode, taskTree: TaskTree): Promise<string> {
    const fields = task.requirements.must_include;
    
    const prompt = buildDataFillingPrompt({
      formName: task.chapter_name,
      fields,
      documentReference: `项目名称: ${taskTree.project_info.project_name}`,
      companyInfo: '',
    });

    const response = await this.llm.invokeStreaming(prompt, '你是专业的标书数据提取专家。请直接返回JSON格式结果。');
    
    const result = parseJSON(response, { allowTruncated: true });
    if (result.success && result.data) {
      return JSON.stringify(result.data, null, 2);
    }
    
    return response;
  }

  /**
   * 执行文本生成任务
   */
  private async executeTextGeneration(task: TaskNode, taskTree: TaskTree): Promise<string> {
    // 构建上下文窗口
    const contextWindow = this.buildContextWindow(task);
    
    // 构建撰写 Prompt
    const prompt = buildSectionWriterPrompt({
      projectName: taskTree.project_info.project_name,
      purchaseUnit: taskTree.project_info.purchase_unit,
      techSummary: taskTree.project_info.tech_summary,
      chapterId: task.chapter_id,
      chapterName: task.chapter_name,
      scoringBindings: task.scoring_bindings,
      requirements: task.requirements,
      wordLimit: task.requirements.word_limit || 1500,
      contextWindow,
    });

    // 调用 LLM 生成
    const response = await this.llm.invokeStreaming(
      prompt, 
      '你是顶级的标书编写专家。请撰写高质量、专业的标书内容。'
    );

    return response;
  }

  /**
   * 构建上下文窗口
   */
  private buildContextWindow(task: TaskNode): string {
    if (!task.context_dependencies || task.context_dependencies.length === 0) {
      return '';
    }

    const contexts: string[] = [];

    for (const dep of task.context_dependencies) {
      const depTask = this.completedTasks.get(dep.task_id);
      if (depTask?.generated_content) {
        const summary = extractOutlineSummary(depTask.generated_content);
        contexts.push(`【${depTask.chapter_name} 大纲摘要】\n${summary}`);
      }
    }

    return contexts.join('\n\n');
  }

  /**
   * 检查依赖是否满足
   */
  private areDependenciesMet(task: TaskNode, taskTree: TaskTree): boolean {
    if (!task.context_dependencies || task.context_dependencies.length === 0) {
      return true;
    }

    return task.context_dependencies.every(dep => 
      this.completedTasks.has(dep.task_id)
    );
  }

  /**
   * 根据ID列表查找任务
   */
  private findTasksByIds(ids: string[], tasks: TaskNode[]): TaskNode[] {
    const result: TaskNode[] = [];
    
    function traverse(nodes: TaskNode[]) {
      for (const node of nodes) {
        if (ids.includes(node.id)) {
          result.push(node);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    }
    
    traverse(tasks);
    return result;
  }

  /**
   * 获取任务模板
   */
  private getTemplateForTask(task: TaskNode, taskTree: TaskTree): string {
    const { project_info } = taskTree;
    
    // 根据任务类型返回不同的模板
    switch (task.chapter_id) {
      case 'cover-1':
        return `# 投标文件（正本）

**项目名称**：${project_info.project_name}
**招标编号**：${project_info.project_number}
**投标人名称**：${project_info.bidder_name || '_______________'}

投标人：（盖章）
法定代表人或其委托代理人：（签字）
日期：______年______月______日`;

      default:
        return `# ${task.chapter_name}

（此章节为规则表单，内容待填充）
`;
    }
  }

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    progress: number,
    content?: string,
    error?: string
  ): Promise<void> {
    try {
      const client = getSupabaseClient();
      
      const updateData: Record<string, any> = {
        status,
        progress,
        updated_at: new Date().toISOString(),
      };

      if (content) {
        updateData.generated_content = content;
      }

      if (error) {
        updateData.error_message = error;
      }

      if (status === 'running') {
        updateData.started_at = new Date().toISOString();
      }

      if (status === 'completed' || status === 'failed' || status === 'needs_review') {
        updateData.completed_at = new Date().toISOString();
      }

      await client
        .from('generation_tasks')
        .update(updateData)
        .eq('id', taskId);
    } catch (err) {
      console.error(`[TaskExecutor] 更新任务状态失败:`, err);
    }
  }

  /**
   * 保存任务结果
   */
  private async saveTaskResult(taskId: string, content: string): Promise<void> {
    try {
      const client = getSupabaseClient();
      
      await client
        .from('generation_tasks')
        .update({
          generated_content: content,
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
    } catch (err) {
      console.error(`[TaskExecutor] 保存任务结果失败:`, err);
    }
  }
}

/**
 * 创建任务执行器
 */
export function createTaskExecutor(config: TaskExecutorConfig): TaskExecutor {
  return new TaskExecutor(config);
}
