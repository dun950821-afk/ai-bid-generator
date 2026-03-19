import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/knowledge-bases/[id]/documents/[docId]/chunks - 获取文档分块列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    // 验证文档存在
    const { data: doc, error: docError } = await client
      .from('knowledge_documents')
      .select('id, name, original_name')
      .eq('id', docId)
      .eq('knowledge_base_id', id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 获取分块列表
    const { data: chunks, error: chunksError } = await client
      .from('document_chunks')
      .select('id, chunk_index, content, metadata, created_at')
      .eq('document_id', docId)
      .order('chunk_index', { ascending: true });

    if (chunksError) {
      console.error('获取分块失败:', chunksError);
      return NextResponse.json(
        { success: false, error: '获取分块失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chunks: chunks || [],
      total: chunks?.length || 0,
    });
  } catch (error) {
    console.error('获取文档分块失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档分块失败' },
      { status: 500 }
    );
  }
}
