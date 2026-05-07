import { NextRequest, NextResponse } from 'next/server';
import { importDocumentsToCoze } from '@/lib/services/retrieval/coze-provider';

/**
 * 导入文档到扣子知识库
 * POST /api/coze-knowledge/import
 * Body: { title, content, url, type: 'text'|'url', dataset }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, url, type = 'text', dataset } = body;

    const docTitle = title || (type === 'url' ? url : `文本文档 ${new Date().toLocaleString('zh-CN')}`);
    const docContent = type === 'url' ? url : content;

    if (!docContent) {
      return NextResponse.json(
        { success: false, error: '必须提供 content 或 url 参数' },
        { status: 400 }
      );
    }

    const result = await importDocumentsToCoze(
      [{ title: docTitle, content: docContent, type }],
      dataset || 'coze_doc_knowledge'
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      docIds: result.docIds,
      message: '文档已提交，正在后台建立索引',
    });
  } catch (error) {
    console.error('[Coze Knowledge] 导入文档失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
