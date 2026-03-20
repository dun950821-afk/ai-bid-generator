/**
 * 百炼知识库文档分块API
 * GET: 获取文档分块列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取文档分块列表
 * @description 从百炼API获取指定文档的分块内容
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const service = await createBailianKnowledgeService();

    // 获取文档分块列表
    const result = await service.listDocumentChunks({
      knowledgeBaseId: id,
      documentId: docId,
      pageSize: 100,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || '获取文档分块失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chunks: result.chunks,
      total: result.total,
    });
  } catch (error: any) {
    console.error('[Bailian API] Get document chunks failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文档分块失败' },
      { status: 500 }
    );
  }
}
