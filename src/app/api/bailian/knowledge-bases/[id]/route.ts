/**
 * 百炼知识库详情API
 * GET: 获取知识库详情
 * DELETE: 删除知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取知识库详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = await createBailianKnowledgeService();
    const result = await service.getKnowledgeBase(id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Get knowledge base failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取知识库详情失败' },
      { status: 500 }
    );
  }
}

/**
 * 删除知识库
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 检查是否有关联的项目
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();
    
    const { data: linkedProjects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('knowledge_base_id', id)
      .limit(5);

    if (linkedProjects && linkedProjects.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `无法删除：知识库正被以下项目使用：${linkedProjects.map(p => p.name).join('、')}。请先解除关联。` 
        },
        { status: 400 }
      );
    }

    const service = await createBailianKnowledgeService();
    const result = await service.deleteKnowledgeBase(id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Delete knowledge base failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '删除知识库失败' },
      { status: 500 }
    );
  }
}
