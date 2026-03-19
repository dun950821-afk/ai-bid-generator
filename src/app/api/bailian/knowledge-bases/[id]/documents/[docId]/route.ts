/**
 * 百炼知识库文档操作API
 * DELETE: 删除文档
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 删除文档
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    // 获取文档信息
    const { data: doc, error: fetchError } = await client
      .from('knowledge_documents')
      .select('*')
      .eq('id', docId)
      .eq('knowledge_base_id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 删除知识块
    await client
      .from('document_chunks')
      .delete()
      .eq('document_id', docId);

    // 删除文档记录
    const { error: deleteError } = await client
      .from('knowledge_documents')
      .delete()
      .eq('id', docId);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: '删除文档失败' },
        { status: 500 }
      );
    }

    // TODO: 如果需要从百炼平台也删除，可以调用百炼API

    return NextResponse.json({
      success: true,
      message: '文档已删除',
    });
  } catch (error: any) {
    console.error('[Bailian API] Delete document failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '删除文档失败' },
      { status: 500 }
    );
  }
}
