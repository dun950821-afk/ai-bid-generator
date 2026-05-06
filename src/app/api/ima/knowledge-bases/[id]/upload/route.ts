import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import * as imaService from '@/lib/services/ima-service';

/**
 * IMA 知识库文件上传 API（两步上传）
 * POST /api/ima/knowledge-bases/[id]/upload
 * 
 * Step 1 (step=create_media): 获取COS上传凭证
 * Step 2 (step=add_knowledge): 完成上传，添加知识
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const step = body.step || 'create_media'; // create_media | add_knowledge

  const config = await getIMAProviderConfig();
  if (!config) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  if (step === 'create_media') {
    // Step 1: 获取上传凭证
    const { file_name, file_size } = body;
    if (!file_name || !file_size) {
      return NextResponse.json({ error: 'file_name和file_size为必填' }, { status: 400 });
    }

    const result = await imaService.createMedia(config, {
      kb_id: id,
      file_name,
      file_size,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } else if (step === 'add_knowledge') {
    // Step 2: 完成上传
    const { media_id, title, type, url, note_id, content } = body;
    if (!type) {
      return NextResponse.json({ error: 'type为必填(file/url/note/markdown)' }, { status: 400 });
    }

    const result = await imaService.addKnowledge(config, {
      kb_id: id,
      media_id,
      title,
      type,
      url,
      note_id,
      content,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  }

  return NextResponse.json({ error: '无效的step参数' }, { status: 400 });
}
