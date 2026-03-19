/**
 * 百炼知识库检索API
 * POST: 检索知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 检索知识库
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { query, topK = 5, rerankMinScore, tags } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '检索查询不能为空' },
        { status: 400 }
      );
    }

    const service = await createBailianKnowledgeService();
    const result = await service.retrieve({
      knowledgeBaseIds: [id],
      query,
      topK,
      rerankMinScore,
      tags,
    });

    if (!result.success) {
      return NextResponse.json(result);
    }

    // 转换为前端期望的格式
    const results = result.data?.map((item) => ({
      content: item.content,
      source: item.documentName,
      score: item.score,
      metadata: {
        documentId: item.documentId,
        pageNumber: item.pageNumber,
        ...item.metadata,
      },
    })) || [];

    return NextResponse.json({
      success: true,
      data: { results },
    });
  } catch (error: any) {
    console.error('[Bailian API] Search failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '检索失败' },
      { status: 500 }
    );
  }
}
