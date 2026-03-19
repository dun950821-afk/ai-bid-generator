/**
 * 任务树生成 API
 * 支持精细化大纲生成，按任务类型分类
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createModel } from '@/lib/llm';
import { getLLMFileService } from '@/lib/services/llm-file-service';
import { parseJSON } from '@/lib/utils/json-parser';
import { buildTaskAnalyzerPrompt, parseTaskTreeResponse, TASK_ANALYZER_PROMPT } from '@/lib/prompts/task-analyzer';
import { createFullTaskTree, createStandardOutlineTemplate, createStandardExecutionPlan } from '@/lib/templates/standard-outline-template';
import type { TaskTree, TaskNode } from '@/types/task-tree';

// GET /api/projects/[id]/tasks - 获取任务树
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project, error } = await client
      .from('projects')
      .select('id, name, metadata')
      .eq('id', id)
      .single();

    if (error || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取任务列表
    const { data: tasks, error: tasksError } = await client
      .from('generation_tasks')
      .select('*')
      .eq('project_id', id)
      .order('execution_order', { ascending: true });

    if (tasksError) {
      console.error('获取任务失败:', tasksError);
    }

    // 获取执行计划
    const { data: plan } = await client
      .from('task_execution_plans')
      .select('*')
      .eq('project_id', id)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        tasks: tasks || [],
        executionPlan: plan || null,
        outline: project.metadata?.outline || null,
        taskTree: project.metadata?.taskTree || null,
      },
    });
  } catch (error) {
    console.error('获取任务树失败:', error);
    return NextResponse.json(
      { success: false, error: '获取任务树失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/tasks - 生成任务树
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = Date.now().toString(36);
  console.log(`[${requestId}] [任务树生成] 开始处理请求`);

  try {
    const { id } = await params;
    
    // 解析请求体
    let body: any = {};
    try {
      const text = await req.text();
      if (text && text.trim()) {
        body = JSON.parse(text);
      }
    } catch (parseError) {
      console.log(`[${requestId}] [任务树生成] 请求体解析失败，使用默认值`);
    }

    const { 
      mode = 'template',  // 'template' | 'ai'
      customInstructions = '' 
    } = body;

    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    let taskTree: TaskTree;

    if (mode === 'ai' && scoringItems && scoringItems.length > 0) {
      // AI 模式：使用 LLM 解析招标文档生成任务树
      console.log(`[${requestId}] [任务树生成] 使用 AI 模式`);
      taskTree = await generateTaskTreeWithAI(project, scoringItems, customInstructions, requestId);
    } else {
      // 模板模式：使用标准模板
      console.log(`[${requestId}] [任务树生成] 使用模板模式`);
      taskTree = createFullTaskTree({
        project_name: project.name,
        project_number: project.metadata?.tenderAnalysis?.project_basic_info?.project_number,
        purchase_unit: project.metadata?.tenderAnalysis?.project_basic_info?.purchase_unit,
        tech_summary: extractTechSummary(project.metadata?.tenderAnalysis),
      });
    }

    // 将评分项绑定到任务
    if (scoringItems && scoringItems.length > 0) {
      taskTree = bindScoringItemsToTasks(taskTree, scoringItems);
    }

    // 保存任务到数据库
    await saveTasksToDatabase(client, id, taskTree);

    // 保存任务树到项目 metadata
    await client
      .from('projects')
      .update({
        metadata: {
          ...project.metadata,
          taskTree,
          taskTreeGeneratedAt: new Date().toISOString(),
        },
      })
      .eq('id', id);

    console.log(`[${requestId}] [任务树生成] 完成`);

    return NextResponse.json({
      success: true,
      data: {
        taskTree,
        stats: {
          totalTasks: taskTree.execution_plan.total_tasks,
          byType: taskTree.execution_plan.by_type,
          reviewPoints: taskTree.execution_plan.review_points.length,
        },
      },
    });
  } catch (error) {
    console.error(`[任务树生成] 失败:`, error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '生成任务树失败',
      },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/tasks - 更新任务状态
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { taskId, status, generatedContent, notes } = await req.json();

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '请提供任务ID' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (generatedContent !== undefined) {
      updateData.generated_content = generatedContent;
    }

    if (notes !== undefined) {
      updateData.review_notes = notes;
    }

    if (status === 'completed' || status === 'needs_review') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await client
      .from('generation_tasks')
      .update(updateData)
      .eq('id', taskId)
      .eq('project_id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '任务已更新',
    });
  } catch (error) {
    console.error('更新任务失败:', error);
    return NextResponse.json(
      { success: false, error: '更新任务失败' },
      { status: 500 }
    );
  }
}

/**
 * 使用 AI 生成任务树
 */
async function generateTaskTreeWithAI(
  project: any,
  scoringItems: any[],
  customInstructions: string,
  requestId: string
): Promise<TaskTree> {
  const llm = createModel({
    enableThinking: false,
    temperature: 0.5,
    maxTokens: 16384,
  });

  // 构建招标文档摘要
  const tenderContent = buildTenderContentSummary(project.metadata?.tenderAnalysis);
  
  // 构建 Prompt
  const prompt = buildTaskAnalyzerPrompt(
    project.name,
    scoringItems,
    tenderContent,
    customInstructions
  );

  console.log(`[${requestId}] [任务树生成] 调用 LLM...`);
  const response = await llm.invokeStreaming(
    prompt,
    '你是专业的标书结构分析专家。请返回JSON格式的任务树。'
  );

  const result = parseTaskTreeResponse(response);
  
  if (!result.success || !result.data) {
    console.log(`[${requestId}] [任务树生成] AI解析失败，使用模板`);
    return createFullTaskTree({
      project_name: project.name,
    });
  }

  // 构建任务树
  const taskTree = normalizeTaskTree(result.data, project);
  return taskTree;
}

/**
 * 构建招标文档内容摘要
 */
function buildTenderContentSummary(tenderAnalysis: any): string {
  if (!tenderAnalysis) return '';

  const parts: string[] = [];

  if (tenderAnalysis.project_basic_info) {
    parts.push(`项目基本信息：
- 项目名称：${tenderAnalysis.project_basic_info.project_name || ''}
- 招标编号：${tenderAnalysis.project_basic_info.project_number || ''}
- 采购单位：${tenderAnalysis.project_basic_info.purchase_unit || ''}
- 项目预算：${tenderAnalysis.project_basic_info.project_budget || ''}`);
  }

  if (tenderAnalysis.core_tech_demand) {
    parts.push(`技术需求：\n${JSON.stringify(tenderAnalysis.core_tech_demand, null, 2).substring(0, 3000)}`);
  }

  if (tenderAnalysis.business_requirements) {
    parts.push(`商务要求：\n${JSON.stringify(tenderAnalysis.business_requirements, null, 2).substring(0, 2000)}`);
  }

  return parts.join('\n\n');
}

/**
 * 提取技术摘要
 */
function extractTechSummary(tenderAnalysis: any): string {
  if (!tenderAnalysis?.core_tech_demand) return '';

  const tech = tenderAnalysis.core_tech_demand;
  const parts: string[] = [];

  if (tech.system_upgrade_demands) {
    tech.system_upgrade_demands.forEach((item: any) => {
      parts.push(`${item.module_name}: ${item.demand_details?.join(', ')}`);
    });
  }

  return parts.join('；').substring(0, 300);
}

/**
 * 标准化任务树
 */
function normalizeTaskTree(data: any, project: any): TaskTree {
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const executionPlan = data.execution_plan || {};

  return {
    project_info: {
      project_name: project.name,
      project_number: data.project_info?.project_number || '',
      purchase_unit: data.project_info?.purchase_unit || '',
      tech_summary: data.project_info?.tech_summary || '',
      key_requirements: [],
    },
    tasks: normalizeTasks(tasks),
    execution_plan: {
      total_tasks: executionPlan.total_tasks || tasks.length,
      by_type: executionPlan.by_type || {
        rule_based_form: tasks.filter((t: any) => t.task_type === 'Rule-Based-Form').length,
        data_filling: tasks.filter((t: any) => t.task_type === 'Data-Filling').length,
        text_generation: tasks.filter((t: any) => t.task_type === 'Text-Generation').length,
      },
      phases: executionPlan.phases || [],
      review_points: executionPlan.review_points || [],
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
 * 标准化任务列表
 */
function normalizeTasks(tasks: any[]): TaskNode[] {
  return tasks.map((t, idx) => ({
    id: t.id || `task-${idx}`,
    task_code: t.task_code || t.id || `section-${idx}`,
    chapter_id: t.chapter_id || String(idx),
    chapter_name: t.chapter_name || t.title || '',
    title: t.title || t.chapter_name || '',
    level: t.level || 1,
    task_type: t.task_type || 'Text-Generation',
    task_group: t.task_group || 'technical',
    scoring_bindings: Array.isArray(t.scoring_bindings) ? t.scoring_bindings : [],
    requirements: {
      must_include: t.requirements?.must_include || [],
      format_rules: t.requirements?.format_rules || [],
      word_limit: t.requirements?.word_limit || t.word_limit || 1500,
      prohibited_terms: t.requirements?.prohibited_terms || [],
    },
    context_dependencies: Array.isArray(t.context_dependencies) ? t.context_dependencies : [],
    status: 'pending',
    progress: 0,
    review_required: t.review_required || false,
    review_priority: t.review_priority,
    execution_order: t.execution_order || idx,
    parallel_group: t.parallel_group,
    children: t.children ? normalizeTasks(t.children) : [],
    metadata: t.metadata || {},
  }));
}

/**
 * 绑定评分项到任务
 */
function bindScoringItemsToTasks(taskTree: TaskTree, scoringItems: any[]): TaskTree {
  // 实现评分项与任务的智能绑定
  // 这里可以根据评分项名称和章节名称进行匹配
  
  return taskTree;
}

/**
 * 保存任务到数据库
 */
async function saveTasksToDatabase(
  client: ReturnType<typeof getSupabaseClient>,
  projectId: string,
  taskTree: TaskTree
): Promise<void> {
  // 先删除旧任务
  await client
    .from('generation_tasks')
    .delete()
    .eq('project_id', projectId);

  // 扁平化任务列表
  const flatTasks = flattenTasks(taskTree.tasks);

  // 批量插入
  if (flatTasks.length > 0) {
    const records = flatTasks.map(task => ({
      project_id: projectId,
      task_code: task.task_code,
      chapter_id: task.chapter_id,
      chapter_name: task.chapter_name,
      level: task.level,
      parent_task_id: task.parent_task_id || null,
      task_type: task.task_type,
      task_group: task.task_group,
      scoring_bindings: task.scoring_bindings,
      word_limit: task.requirements.word_limit || 1500,
      requirements: task.requirements,
      context_dependencies: task.context_dependencies,
      status: task.status,
      progress: task.progress,
      review_required: task.review_required,
      review_priority: task.review_priority,
      execution_order: task.execution_order,
      parallel_group: task.parallel_group,
      metadata: task.metadata,
    }));

    // 分批插入，每批100条
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await client
        .from('generation_tasks')
        .insert(batch);

      if (error) {
        console.error('保存任务失败:', error);
      }
    }
  }

  // 保存执行计划
  await client
    .from('task_execution_plans')
    .upsert({
      project_id: projectId,
      total_tasks: taskTree.execution_plan.total_tasks,
      task_stats: taskTree.execution_plan.by_type,
      phases: taskTree.execution_plan.phases,
      review_points: taskTree.execution_plan.review_points,
    }, { onConflict: 'project_id' });
}

/**
 * 扁平化任务列表
 */
function flattenTasks(tasks: TaskNode[]): TaskNode[] {
  const result: TaskNode[] = [];
  
  function traverse(nodes: TaskNode[], parentId?: string) {
    for (const node of nodes) {
      result.push({ ...node, parent_task_id: parentId } as TaskNode);
      if (node.children && node.children.length > 0) {
        traverse(node.children, node.id);
      }
    }
  }
  
  traverse(tasks);
  return result;
}
