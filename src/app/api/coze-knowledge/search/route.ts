import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient } from 'coze-coding-dev-sdk';

/**
 * 搜索扣子知识库
 * 使用 coze-coding-dev-sdk（integration.coze.cn）进行搜索召回，
 * 官方 v1 API 暂不提供独立的搜索端点
 * POST /api/coze-knowledge/search
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, top_k = 5 } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '必须提供 query 参数' },
        { status: 400 }
      );
    }

    const client = new KnowledgeClient();
    const searchResult = await client.search(query, undefined, top_k);

    const chunks = (searchResult.chunks || []).map((chunk) => ({
      content: chunk.content,
      score: chunk.score,
      doc_id: chunk.doc_id || '',
      chunk_id: chunk.chunk_id || '',
    }));

    return NextResponse.json({
      success: true,
      data: { chunks },
    });
  } catch (error) {
    console.error('[Coze Knowledge] 搜索失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
