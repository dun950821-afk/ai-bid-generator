import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { getMediaInfo } from '@/lib/services/ima-service';

/**
 * 获取媒体预览链接
 * POST /api/ima/knowledge-bases/[id]/media-info
 *
 * 调用 IMA get_media_info API 获取带签名的临时访问链接
 * 返回的 url 有有效期限制，过期需重新调用
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const config = await getIMAProviderConfig();

    if (!config.apiKey || !config.clientId) {
      return NextResponse.json(
        { error: 'IMA知识库未配置' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { media_id } = body;

    if (!media_id) {
      return NextResponse.json(
        { error: 'media_id 参数必填' },
        { status: 400 }
      );
    }

    const result = await getMediaInfo(config, { media_id });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || '获取预览链接失败' },
        { status: 500 }
      );
    }

    // get_media_info 返回 url_info.url（带签名的临时访问链接）
    const previewUrl = result.data.url_info?.url || '';
    const mediaType = result.data.media_type;

    return NextResponse.json({
      data: {
        url: previewUrl,
        mediaId: media_id,
        mediaType,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取预览链接失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
