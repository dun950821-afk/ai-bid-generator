import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { searchKnowledge } from '@/lib/services/ima-service';

/**
 * IMA 知识库内容搜索 API
 * POST: 搜索知识库内容
 * 
 * Body:
 * - query: 搜索关键词（必填）
 * - cursor: 分页游标（可选）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = await getIMAProviderConfig();
    if (!config.apiKey || !config.clientId) {
      return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
    }

    const body = await request.json();
    const query = body.query || '';
    if (!query.trim()) {
      return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
    }

    const result = await searchKnowledge(config, {
      knowledge_base_id: id,
      query,
      cursor: body.cursor || '',
    });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || '搜索失败' },
        { status: 500 }
      );
    }

    const data = result.data;

    // 映射搜索结果
    const results = (data.info_list || []).map((item) => ({
      id: item.media_id,
      name: item.title,
      content: item.highlight_content,
      parentId: item.parent_folder_id,
    }));

    return NextResponse.json({
      data: {
        results,
        isEnd: data.is_end,
        nextCursor: data.next_cursor,
      },
    });
  } catch (error) {
    console.error('IMA search error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '搜索失败' },
      { status: 500 }
    );
  }
}
