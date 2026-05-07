import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient, Config } from 'coze-coding-dev-sdk';

/**
 * 搜索扣子知识库
 * POST /api/coze-knowledge/search
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, dataset, topK = 5, scoreThreshold = 0.0 } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '必须提供 query 参数' },
        { status: 400 }
      );
    }

    const client = new KnowledgeClient(new Config());
    const result = await client.search(
      query,
      dataset || undefined,
      topK,
      scoreThreshold
    );

    if (result.code === 0) {
      return NextResponse.json({
        success: true,
        data: {
          chunks: result.chunks?.map((chunk: { content?: string; score?: number; doc_id?: string }) => ({
            content: chunk.content,
            score: chunk.score,
            docId: chunk.doc_id,
          })) || [],
        },
      });
    }

    return NextResponse.json(
      { success: false, error: result.msg || '搜索失败' },
      { status: 500 }
    );
  } catch (error) {
    console.error('[Coze Knowledge] 搜索失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
