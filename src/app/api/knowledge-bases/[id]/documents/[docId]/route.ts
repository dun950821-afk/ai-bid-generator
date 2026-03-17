import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/knowledge-bases/[id]/documents/[docId] - 获取文档详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('knowledge_documents')
      .select(`
        *,
        knowledge_chunks (
          id,
          chunk_index,
          content,
          created_at
        )
      `)
      .eq('id', docId)
      .eq('knowledge_base_id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('获取文档详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档详情失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/knowledge-bases/[id]/documents/[docId] - 删除文档
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    // 删除知识块
    await client
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', docId);

    // 删除文档记录
    const { error } = await client
      .from('knowledge_documents')
      .delete()
      .eq('id', docId)
      .eq('knowledge_base_id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '文档已删除',
    });
  } catch (error) {
    console.error('删除文档失败:', error);
    return NextResponse.json(
      { success: false, error: '删除文档失败' },
      { status: 500 }
    );
  }
}
