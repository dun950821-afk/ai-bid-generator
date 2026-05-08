import { NextRequest, NextResponse } from 'next/server';
import {
  createDocumentByText,
  createDocumentByUrl,
} from '@/lib/services/coze-api-client';

export const maxDuration = 300;

/**
 * 导入文档到扣子知识库（使用官方 Coze Open API）
 * POST /api/coze-knowledge/import
 * Body: { title, content, url, source_type: 'text'|'url', dataset_id, chunk_strategy? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, url, source_type = 'text', dataset_id, chunk_strategy } = body;

    if (!dataset_id) {
      return NextResponse.json(
        { success: false, error: '必须提供 dataset_id（知识库 ID）' },
        { status: 400 }
      );
    }

    if (source_type === 'url') {
      // URL 导入
      if (!url) {
        return NextResponse.json(
          { success: false, error: 'URL 不能为空' },
          { status: 400 }
        );
      }
      const docTitle = title || new URL(url).hostname;
      const result = await createDocumentByUrl(dataset_id, docTitle, url, chunk_strategy);
      return NextResponse.json({
        success: true,
        data: result,
        message: `URL「${url}」已提交，正在后台处理`,
      });
    } else {
      // 文本内容导入
      if (!content) {
        return NextResponse.json(
          { success: false, error: '文本内容不能为空' },
          { status: 400 }
        );
      }
      const docTitle = title || `文本文档 ${new Date().toLocaleString('zh-CN')}`;
      const result = await createDocumentByText(dataset_id, docTitle, content, chunk_strategy);
      return NextResponse.json({
        success: true,
        data: result,
        message: `文档「${docTitle}」已提交，提取文本 ${content.length} 字符`,
      });
    }
  } catch (error) {
    console.error('[Coze Knowledge] 导入文档失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
