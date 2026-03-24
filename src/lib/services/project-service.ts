/**
 * 项目服务
 * 提供项目相关的业务逻辑
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 关联数据表配置
 * 定义删除项目时需要清理的关联表
 */
const RELATED_TABLES = [
  { table: 'scoring_items', column: 'project_id' },
  { table: 'disqualification_risks', column: 'project_id' },
  { table: 'bid_sections', column: 'project_id' },
  { table: 'content_citations', column: 'project_id' },
  { table: 'validation_results', column: 'project_id' },
  { table: 'mapping_matrices', column: 'project_id' },
  { table: 'upload_sessions', column: 'project_id' },
  { table: 'extraction_tasks', column: 'project_id' },
  { table: 'segment_tasks', column: 'project_id' },
] as const;

/**
 * 删除项目及其关联数据
 * @param projectId 项目ID
 * @returns 删除结果
 */
export async function deleteProjectWithRelations(projectId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const client = getSupabaseClient();

  try {
    // 1. 检查项目是否存在
    const { data: project, error: fetchError } = await client
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      return {
        success: false,
        error: '项目不存在',
      };
    }

    // 2. 删除关联数据
    for (const { table, column } of RELATED_TABLES) {
      const { error: deleteError } = await client
        .from(table)
        .delete()
        .eq(column, projectId);

      if (deleteError) {
        console.warn(`[ProjectService] 删除 ${table} 失败:`, deleteError.message);
        // 继续删除其他表，不中断流程
      }
    }

    // 3. 删除项目本身
    const { error: deleteError } = await client
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (deleteError) {
      console.error('[ProjectService] 删除项目失败:', deleteError);
      return {
        success: false,
        error: '删除项目失败',
      };
    }

    return {
      success: true,
      message: `项目"${project.name}"已删除`,
    };
  } catch (error) {
    console.error('[ProjectService] 删除项目异常:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除项目失败',
    };
  }
}

/**
 * 检查项目是否存在
 * @param projectId 项目ID
 * @returns 项目是否存在
 */
export async function projectExists(projectId: string): Promise<boolean> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  return !error && !!data;
}
