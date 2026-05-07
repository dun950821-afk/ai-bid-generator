import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { getDocContent } from '@/lib/services/ima-service';

/**
 * IMA 笔记内容获取 API
 * POST: 获取笔记正文内容（用于预览笔记类型媒体）
 * 
 * Body:
 * - doc_id: 笔记文档ID（即知识库中 media_type=11 的 media_id）
 */
export async function POST(
  request: NextRequest
) {
  try {
    const config = await getIMAProviderConfig();
    if (!config.apiKey || !config.clientId) {
      return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
    }

    const body = await request.json();
    const docId = body.doc_id || '';
    if (!docId.trim()) {
      return NextResponse.json({ error: 'doc_id 不能为空' }, { status: 400 });
    }

    const result = await getDocContent(config, {
      doc_id: docId,
      target_content_format: 0,  // 纯文本
    });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || '获取笔记内容失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        content: result.data.content,
        docId: result.data.doc_id,
      },
    });
  } catch (error) {
    console.error('IMA notes content error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取笔记内容失败' },
      { status: 500 }
    );
  }
}
