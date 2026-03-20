/**
 * 百炼知识库统计API
 * 所有数据从百炼API获取
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取知识库统计信息
 * @description 从百炼API获取知识库统计数据
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = await createBailianKnowledgeService();
    
    // 从百炼API获取文档列表来统计大小、状态和数量
    // 注意：百炼API的ListIndices不返回文档数量，必须通过ListIndexDocuments获取
    const docsResult = await service.listKnowledgeBaseDocuments({
      knowledgeBaseId: id,
      limit: 1, // 只需要获取total数量，不需要具体文档
    });

    // 文档总数直接从API返回的totalCount获取
    const documentCount = docsResult.data?.total || 0;

    // 获取完整文档列表用于统计大小和状态
    const fullDocsResult = await service.listKnowledgeBaseDocuments({
      knowledgeBaseId: id,
      limit: 100,
    });

    let totalSize = 0;
    let completedCount = 0;
    let processingCount = 0;
    let failedCount = 0;

    if (fullDocsResult.success && fullDocsResult.data?.documents) {
      for (const doc of fullDocsResult.data.documents) {
        totalSize += doc.file_size || 0;
        if (doc.vector_status === 'completed') completedCount++;
        else if (doc.vector_status === 'processing') processingCount++;
        else if (doc.vector_status === 'failed') failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        documentCount,
        chunkCount: 0, // 百炼API不返回知识块数量
        totalSize,
        completedCount,
        processingCount,
        failedCount,
        pendingCount: 0,
      },
    });
  } catch (error: any) {
    console.error('[Bailian API] Get stats failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取统计信息失败' },
      { status: 500 }
    );
  }
}
