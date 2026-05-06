import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import * as imaService from '@/lib/services/ima-service';

/**
 * IMA 知识库搜索 API
 * POST /api/ima/knowledge-bases/[id]/search
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const query = body.query || '';
  const limit = body.limit || 5;

  if (!query.trim()) {
    return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
  }

  const config = await getIMAProviderConfig();
  if (!config) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  const result = await imaService.searchKnowledge(config, {
    knowledge_base_id: id,
    query,
    limit,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const data = result.data!;

  // 映射为统一格式
  const results = (data.info_list || []).map(item => ({
    id: item.media_id,
    title: item.title,
    content: item.highlight_content || '',
    mediaType: item.media_type,
    mediaTypeName: imaService.IMA_MEDIA_TYPE_MAP[item.media_type] || '未知',
    _provider: 'ima',
  }));

  return NextResponse.json({
    success: true,
    data: {
      results,
      total: results.length,
      isEnd: data.is_end,
      _provider: 'ima',
    },
  });
}
