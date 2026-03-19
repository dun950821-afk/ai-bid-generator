/**
 * 任务树类型定义
 * 用于标书大纲精细化生成系统
 */

/**
 * 任务类型枚举
 * - Rule-Based-Form: 规则表单填充（封面、目录、索引表等，使用模板引擎）
 * - Data-Filling: 数据填空（需要LLM提取信息后填充）
 * - Text-Generation: 文本生成（需要长文本创作）
 */
export type TaskType = 
  | 'Rule-Based-Form'    
  | 'Data-Filling'       
  | 'Text-Generation';

/**
 * 任务状态枚举
 */
export type TaskStatus = 
  | 'pending'           // 待执行
  | 'running'           // 执行中
  | 'completed'         // 已完成
  | 'failed'            // 失败
  | 'needs_review';     // 待人工复核

/**
 * 任务分组枚举
 */
export type TaskGroup = 
  | 'cover'             // 封面与目录
  | 'index'             // 评审索引表
  | 'business'          // 核心商务与资格文件
  | 'technical'         // 技术方案（核心生成区）
  | 'compliance'        // 专项合规承诺
  | 'appendix';         // 附属文件

/**
 * 复核优先级
 */
export type ReviewPriority = 'critical' | 'high' | 'medium';

/**
 * 评分绑定
 * 将章节与评分项关联
 */
export interface ScoringBinding {
  scoring_item_id: string;       // 评分项ID（关联 scoring_items 表）
  scoring_item_name: string;     // 评分项名称
  max_score: number;             // 满分值
  scoring_criteria: string;      // 评分标准原文
  response_strategy: string;     // 响应策略建议
  key_points: string[];          // 必须响应的关键点
}

/**
 * 章节内容要求
 */
export interface SectionRequirements {
  must_include: string[];        // 必须包含的内容
  format_rules: string[];        // 格式要求
  word_limit?: number;           // 字数限制
  prohibited_terms: string[];    // 禁止出现的词汇
}

/**
 * 上下文依赖
 */
export interface ContextDependency {
  task_id: string;               // 依赖的任务ID
  dependency_type: 'content' | 'outline' | 'data';  // 依赖类型
  description: string;           // 依赖描述
}

/**
 * 任务节点（核心数据结构）
 */
export interface TaskNode {
  // 基础信息
  id: string;                    // 任务ID，如 "task-11.1"
  task_code: string;             // 任务编码，如 "section-11-1"
  chapter_id: string;            // 章节编号，如 "11.1"
  chapter_name: string;          // 章节名称
  title: string;                 // 完整标题
  
  // 层级信息
  level: number;                 // 层级：1=一级标题，2=二级标题
  parent_task_id?: string;       // 父任务ID
  
  // 任务分类
  task_type: TaskType;           // 任务类型
  task_group: TaskGroup;         // 任务分组
  
  // 评分绑定
  scoring_bindings: ScoringBinding[];
  
  // 内容要求
  requirements: SectionRequirements;
  
  // 上下文依赖
  context_dependencies: ContextDependency[];
  
  // 状态管理
  status: TaskStatus;
  progress: number;              // 进度百分比 (0-100)
  generated_content?: string;    // 已生成内容
  
  // 人工复核
  review_required: boolean;
  review_priority?: ReviewPriority;
  review_notes?: string;
  
  // 执行信息
  execution_order: number;       // 执行顺序
  parallel_group?: string;       // 可并行的任务组ID
  
  // 子任务
  children?: TaskNode[];
  
  // 元数据
  metadata: {
    section_type: string;
    estimated_duration?: string;
    [key: string]: any;
  };
}

/**
 * 项目信息摘要
 */
export interface ProjectInfoSummary {
  project_name: string;
  project_number: string;
  purchase_unit: string;
  bidder_name?: string;
  tech_summary: string;          // 300字技术需求摘要
  key_requirements: string[];    // 核心需求点
}

/**
 * 执行阶段
 */
export interface ExecutionPhase {
  phase_id: string;
  phase_name: string;
  description: string;
  tasks: string[];               // 任务ID列表
  execution_mode: 'parallel' | 'serial' | 'conditional';
  dependencies?: string[];       // 依赖的前置阶段
  estimated_duration: string;    // 预计耗时
}

/**
 * 复核点定义
 */
export interface ReviewPoint {
  task_id: string;
  reason: string;                // 需要复核的原因
  priority: ReviewPriority;
}

/**
 * 执行计划
 */
export interface ExecutionPlan {
  // 总任务统计
  total_tasks: number;
  by_type: {
    rule_based_form: number;
    data_filling: number;
    text_generation: number;
  };
  
  // 执行阶段
  phases: ExecutionPhase[];
  
  // 人工复核点
  review_points: ReviewPoint[];
}

/**
 * 评分覆盖映射项
 */
export interface ScoringMapping {
  scoring_item_id: string;
  scoring_item_name: string;
  max_score: number;
  covered_by: string[];          // 覆盖的章节ID列表
  coverage_status: 'full' | 'partial' | 'none';
}

/**
 * 评分覆盖矩阵
 */
export interface ScoringMatrix {
  total_items: number;
  covered_items: number;
  coverage_rate: number;
  mappings: ScoringMapping[];
}

/**
 * 完整任务树
 */
export interface TaskTree {
  // 项目信息
  project_info: ProjectInfoSummary;
  
  // 任务节点列表
  tasks: TaskNode[];
  
  // 执行计划
  execution_plan: ExecutionPlan;
  
  // 评分覆盖矩阵
  scoring_matrix: ScoringMatrix;
  
  // 元数据
  meta: {
    generated_at: string;
    version: string;
    source_document?: string;
  };
}

/**
 * 任务执行进度
 */
export interface TaskProgress {
  task_id: string;
  task_code: string;
  chapter_name: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

/**
 * 整体执行进度
 */
export interface ExecutionProgress {
  project_id: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  pending_tasks: number;
  needs_review_tasks: number;
  progress_rate: number;
  current_phase: number;
  current_tasks: TaskProgress[];
  started_at?: string;
  estimated_completion?: string;
}

/**
 * 任务生成请求
 */
export interface TaskGenerationRequest {
  project_id: string;
  task_id: string;
  context?: {
    previous_outlines?: { task_id: string; outline: string }[];
    extracted_data?: Record<string, any>;
  };
}

/**
 * 任务生成响应
 */
export interface TaskGenerationResponse {
  task_id: string;
  status: TaskStatus;
  generated_content?: string;
  word_count?: number;
  scoring_coverage?: number;
  error?: string;
}

/**
 * 人工复核请求
 */
export interface TaskReviewRequest {
  project_id: string;
  task_id: string;
  action: 'approve' | 'reject' | 'modify';
  modified_content?: string;
  notes?: string;
}

/**
 * 人工复核响应
 */
export interface TaskReviewResponse {
  task_id: string;
  status: TaskStatus;
  reviewed_at: string;
  reviewer_id: string;
}

// =====================================================
// 辅助函数
// =====================================================

/**
 * 创建空的任务节点
 */
export function createEmptyTaskNode(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: '',
    task_code: '',
    chapter_id: '',
    chapter_name: '',
    title: '',
    level: 1,
    task_type: 'Text-Generation',
    task_group: 'technical',
    scoring_bindings: [],
    requirements: {
      must_include: [],
      format_rules: [],
      prohibited_terms: [],
    },
    context_dependencies: [],
    status: 'pending',
    progress: 0,
    review_required: false,
    execution_order: 0,
    metadata: { section_type: 'technical' },
    ...overrides,
  };
}

/**
 * 创建空的任务树
 */
export function createEmptyTaskTree(projectInfo: Partial<ProjectInfoSummary> = {}): TaskTree {
  return {
    project_info: {
      project_name: '',
      project_number: '',
      purchase_unit: '',
      tech_summary: '',
      key_requirements: [],
      ...projectInfo,
    },
    tasks: [],
    execution_plan: {
      total_tasks: 0,
      by_type: {
        rule_based_form: 0,
        data_filling: 0,
        text_generation: 0,
      },
      phases: [],
      review_points: [],
    },
    scoring_matrix: {
      total_items: 0,
      covered_items: 0,
      coverage_rate: 0,
      mappings: [],
    },
    meta: {
      generated_at: new Date().toISOString(),
      version: '2.0',
    },
  };
}

/**
 * 获取任务类型的处理策略
 */
export function getTaskTypeStrategy(taskType: TaskType) {
  const strategies = {
    'Rule-Based-Form': {
      processor: 'template-engine',
      parallel: true,
      needsLLM: false,
      estimatedTime: 'instant',
    },
    'Data-Filling': {
      processor: 'llm-extraction',
      parallel: true,
      needsLLM: true,
      estimatedTime: '5-10s',
    },
    'Text-Generation': {
      processor: 'llm-generation',
      parallel: 'conditional',
      needsLLM: true,
      estimatedTime: '30-60s',
    },
  };
  return strategies[taskType];
}

/**
 * 扁平化任务树
 */
export function flattenTaskTree(tasks: TaskNode[]): TaskNode[] {
  const result: TaskNode[] = [];
  
  function traverse(nodes: TaskNode[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }
  
  traverse(tasks);
  return result;
}

/**
 * 根据章节ID查找任务
 */
export function findTaskByChapterId(tasks: TaskNode[], chapterId: string): TaskNode | null {
  for (const task of tasks) {
    if (task.chapter_id === chapterId) {
      return task;
    }
    if (task.children) {
      const found = findTaskByChapterId(task.children, chapterId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 获取任务的依赖任务列表
 */
export function getTaskDependencies(task: TaskNode, allTasks: TaskNode[]): TaskNode[] {
  return task.context_dependencies
    .map(dep => allTasks.find(t => t.task_code === dep.task_id || t.id === dep.task_id))
    .filter((t): t is TaskNode => t !== undefined);
}

/**
 * 计算任务树统计信息
 */
export function calculateTaskStats(tasks: TaskNode[]): ExecutionPlan['by_type'] {
  const flatTasks = flattenTaskTree(tasks);
  return {
    rule_based_form: flatTasks.filter(t => t.task_type === 'Rule-Based-Form').length,
    data_filling: flatTasks.filter(t => t.task_type === 'Data-Filling').length,
    text_generation: flatTasks.filter(t => t.task_type === 'Text-Generation').length,
  };
}
