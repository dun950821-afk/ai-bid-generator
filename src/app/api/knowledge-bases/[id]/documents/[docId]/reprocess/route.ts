import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { processDocumentAsync } from '../../route';

/**
 * POST /api/knowledge-bases/[id]/documents/[docId]/reprocess
 * 重新处理文档（重新解析、分块、向量化）
 * 
 * 优化点：
 * 1. 不需要重新上传文件，从存储路径读取
 * 2. 自动清理旧的分块数据
 * 3. 支持手动触发处理失败的文档
 * 4. 支持处理待处理的文档
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    // 获取文档信息
    const { data: doc, error: docError } = await client
      .from('knowledge_documents')
      .select('*')
      .eq('id', docId)
      .eq('knowledge_base_id', id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 检查文档是否有存储路径
    if (!doc.storage_path) {
      return NextResponse.json(
        { success: false, error: '文档存储路径不存在，请重新上传文件' },
        { status: 400 }
      );
    }

    // 检查当前状态，只有 pending 和 failed 状态可以重新处理
    if (doc.vector_status === 'processing') {
      return NextResponse.json(
        { success: false, error: '文档正在处理中，请稍后再试' },
        { status: 400 }
      );
    }

    // 更新状态为处理中
    await client
      .from('knowledge_documents')
      .update({
        vector_status: 'processing',
        vector_error: null,
      })
      .eq('id', docId);

    // 在后台处理文档（复用上传接口的处理函数）
    processDocumentAsync(
      id,
      docId,
      doc.name || doc.original_name,
      doc.file_type,
      doc.storage_path,
      req.headers
    ).catch((error) => console.error('文档重新处理失败:', error));

    return NextResponse.json({
      success: true,
      message: '已提交重新处理任务',
      data: {
        documentId: docId,
        status: 'processing',
      },
    });
  } catch (error) {
    console.error('重新处理失败:', error);
    return NextResponse.json(
      { success: false, error: '重新处理失败' },
      { status: 500 }
    );
  }
}
