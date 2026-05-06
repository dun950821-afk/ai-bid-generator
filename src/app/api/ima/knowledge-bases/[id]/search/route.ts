/**
 * IMA 知识库搜索 API
 * 在指定知识库内搜索内容
 * 对应 IMA API: POST /openapi/wiki/v1/search_knowledge
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { searchKnowledge, type IMAConfig } from '@/lib/services/ima-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { query, limit = 5, cursor = '' } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '搜索关键词不能为空' },
        { status: 400 }
      );
    }

    const providerConfig = await getIMAProviderConfig();
    if (!providerConfig.apiKey || !providerConfig.clientId) {
      return NextResponse.json(
        { success: false, error: 'IMA知识库未配置' },
        { status: 400 }
      );
    }

    const config: IMAConfig = {
      apiKey: providerConfig.apiKey,
      clientId: providerConfig.clientId,
    };

    const result = await searchKnowledge(config, {
      knowledge_base_id: id,
      query,
      limit,
      cursor: cursor || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '搜索知识库失败' },
        { status: 500 }
      );
    }

    // 映射为统一搜索结果格式
    const results = result.data?.info_list || [];
    return NextResponse.json({
      success: true,
      data: {
        results: results.map((r) => ({
          id: r.knowledge_id,
          title: r.title,
          content: r.content,
          score: r.score,
          highlight: r.highlight,
          type: r.type,
          knowledge_base_id: r.knowledge_base_id,
        })),
        total: results.length,
        is_end: result.data?.is_end ?? true,
        next_cursor: result.data?.next_cursor || '',
      },
    });
  } catch (error: any) {
    console.error('[IMA Search] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '搜索知识库失败' },
      { status: 500 }
    );
  }
}
