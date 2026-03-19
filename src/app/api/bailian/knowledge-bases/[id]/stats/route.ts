/**
 * 百炼知识库统计API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取知识库统计信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取文档数量和总大小
    const { data: documents, error } = await client
      .from('knowledge_documents')
      .select('id, file_size, vector_status')
      .eq('knowledge_base_id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 获取知识块数量
    const docIds = documents?.map(d => d.id) || [];
    let chunkCount = 0;
    
    if (docIds.length > 0) {
      const { count } = await client
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .in('document_id', docIds);
      chunkCount = count || 0;
    }

    const stats = {
      documentCount: documents?.length || 0,
      chunkCount,
      totalSize: documents?.reduce((sum, d) => sum + (d.file_size || 0), 0) || 0,
      completedCount: documents?.filter(d => d.vector_status === 'completed').length || 0,
      processingCount: documents?.filter(d => d.vector_status === 'processing').length || 0,
      failedCount: documents?.filter(d => d.vector_status === 'failed').length || 0,
      pendingCount: documents?.filter(d => d.vector_status === 'pending').length || 0,
    };

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Bailian API] Get stats failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取统计信息失败' },
      { status: 500 }
    );
  }
}
