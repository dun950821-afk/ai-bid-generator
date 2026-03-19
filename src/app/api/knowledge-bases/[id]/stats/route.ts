import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/knowledge-bases/[id]/stats - 获取知识库统计信息
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取文档数量
    const { count: documentCount, error: docError } = await client
      .from('knowledge_documents')
      .select('*', { count: 'exact', head: true })
      .eq('knowledge_base_id', id);

    if (docError) {
      return NextResponse.json(
        { success: false, error: docError.message },
        { status: 500 }
      );
    }

    // 获取知识块数量
    const { count: chunkCount, error: chunkError } = await client
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('knowledge_base_id', id);

    if (chunkError) {
      console.error('获取知识块数量失败:', chunkError);
    }

    // 获取总文件大小
    const { data: documents, error: sizeError } = await client
      .from('knowledge_documents')
      .select('file_size')
      .eq('knowledge_base_id', id);

    if (sizeError) {
      console.error('获取文件大小失败:', sizeError);
    }

    const totalSize = (documents || []).reduce((sum: number, doc: any) => sum + (doc.file_size || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        documentCount: documentCount || 0,
        chunkCount: chunkCount || 0,
        totalSize,
      },
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    return NextResponse.json(
      { success: false, error: '获取统计信息失败' },
      { status: 500 }
    );
  }
}
