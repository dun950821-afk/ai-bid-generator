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
    
    // 从百炼API获取知识库详情
    const kbResult = await service.getKnowledgeBase(id);
    
    if (!kbResult.success || !kbResult.data) {
      return NextResponse.json({
        success: false,
        error: kbResult.message || '获取知识库详情失败',
      });
    }

    // 从百炼API获取文档列表来统计大小和状态
    const docsResult = await service.listKnowledgeBaseDocuments({
      knowledgeBaseId: id,
      limit: 100,
    });

    let totalSize = 0;
    let completedCount = 0;
    let processingCount = 0;
    let failedCount = 0;

    if (docsResult.success && docsResult.data?.documents) {
      for (const doc of docsResult.data.documents) {
        totalSize += doc.file_size || 0;
        if (doc.vector_status === 'completed') completedCount++;
        else if (doc.vector_status === 'processing') processingCount++;
        else if (doc.vector_status === 'failed') failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        documentCount: kbResult.data.documentCount || docsResult.data?.total || 0,
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
