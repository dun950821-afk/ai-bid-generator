import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/knowledge-bases/[id]/documents/[docId]/reprocess - 重新处理文档
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    // 检查文档是否存在
    const { data: doc, error: docError } = await client
      .from('knowledge_documents')
      .select('id')
      .eq('id', docId)
      .eq('knowledge_base_id', id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 删除旧的知识块
    await client
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', docId);

    // 更新状态为待处理
    const { error } = await client
      .from('knowledge_documents')
      .update({
        status: 'pending',
        processing_error: null,
      })
      .eq('id', docId);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // TODO: 触发异步处理任务

    return NextResponse.json({
      success: true,
      message: '已提交重新处理',
    });
  } catch (error) {
    console.error('重新处理失败:', error);
    return NextResponse.json(
      { success: false, error: '重新处理失败' },
      { status: 500 }
    );
  }
}
