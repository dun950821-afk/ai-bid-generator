import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import * as imaService from '@/lib/services/ima-service';

/**
 * IMA 媒体信息 API
 * POST /api/ima/knowledge-bases/[id]/media-info
 * 
 * 获取知识库中媒体的详细信息（原文访问链接等）
 * 对应 IMA API: get_media_info
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const mediaIds: string[] = body.media_ids || [];

  if (mediaIds.length === 0) {
    return NextResponse.json({ error: 'media_ids 不能为空' }, { status: 400 });
  }

  const config = await getIMAProviderConfig();
  if (!config) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  const result = await imaService.getMediaInfo(config, {
    kb_id: id,
    media_ids: mediaIds,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: result.data || [],
  });
}
