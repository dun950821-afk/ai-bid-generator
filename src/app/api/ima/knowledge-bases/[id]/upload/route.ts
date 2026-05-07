import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { createMedia, addKnowledge } from '@/lib/services/ima-service';

/**
 * IMA 知识库文件上传 API（两步上传）
 * POST /api/ima/knowledge-bases/[id]/upload
 * 
 * Step 1 (step=create_media): 获取COS上传凭证
 *   Body: { step: "create_media", file_name: string, file_size: number }
 * Step 2 (step=add_knowledge): 完成上传，添加知识
 *   Body: { step: "add_knowledge", media_id: string, title: string, media_type: number, folder_id?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const step = body.step || 'create_media';

  const config = await getIMAProviderConfig();
  if (!config.apiKey || !config.clientId) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  if (step === 'create_media') {
    const { file_name, file_size } = body;
    if (!file_name || !file_size) {
      return NextResponse.json({ error: 'file_name和file_size为必填' }, { status: 400 });
    }

    const result = await createMedia(config, {
      knowledge_base_id: id,
      media_type: 1,
      title: file_name,
      file_size,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } else if (step === 'add_knowledge') {
    const { media_id, title, media_type, folder_id } = body;
    if (!media_id || !title || media_type === undefined) {
      return NextResponse.json({ error: 'media_id, title, media_type为必填' }, { status: 400 });
    }

    const result = await addKnowledge(config, {
      knowledge_base_id: id,
      folder_id: folder_id || id,
      media_id,
      title,
      media_type,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  }

  return NextResponse.json({ error: '无效的step参数，请使用create_media或add_knowledge' }, { status: 400 });
}
