import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/search - 知识库检索
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, knowledgeBaseId, topK = 5 } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '查询内容不能为空' },
        { status: 400 }
      );
    }

    if (!knowledgeBaseId) {
      return NextResponse.json(
        { success: false, error: '知识库ID不能为空' },
        { status: 400 }
      );
    }

    // 简单的关键词搜索实现
    // TODO: 集成向量数据库进行语义搜索
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        knowledge_base_id: knowledgeBaseId,
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: topK,
    });

    const results = chunks.map((chunk: any) => ({
      content: chunk.content,
      source: chunk.document_id,
      score: 0.8, // 模拟得分
      metadata: chunk.metadata || {},
    }));

    return NextResponse.json({
      success: true,
      data: {
        results,
        query,
        topK,
      },
    });
  } catch (error) {
    console.error('检索失败:', error);
    return NextResponse.json(
      { success: false, error: '检索失败' },
      { status: 500 }
    );
  }
}
