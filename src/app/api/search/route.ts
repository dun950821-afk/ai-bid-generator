import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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

    const client = getSupabaseClient();

    // 简单的关键词搜索实现
    // TODO: 集成向量数据库进行语义搜索
    const { data: chunks, error } = await client
      .from('knowledge_chunks')
      .select('*')
      .eq('knowledge_base_id', knowledgeBaseId)
      .ilike('content', `%${query}%`)
      .limit(topK);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const results = (chunks || []).map((chunk: any) => ({
      content: chunk.content,
      source: chunk.document_id,
      score: 0.8,
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
