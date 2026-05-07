import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient, Config, DataSourceType } from 'coze-coding-dev-sdk';

/**
 * 导入文档到扣子知识库
 * POST /api/coze-knowledge/import
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, url, dataset, docType } = body;

    const client = new KnowledgeClient(new Config());
    const datasetName = dataset || 'default';

    let documents: Array<{ source: number; raw_data?: string; url?: string }>;

    if (docType === 'url' && url) {
      documents = [{ source: DataSourceType.URL, url }];
    } else if (content) {
      documents = [{ source: DataSourceType.TEXT, raw_data: content }];
    } else {
      return NextResponse.json(
        { success: false, error: '必须提供 content 或 url 参数' },
        { status: 400 }
      );
    }

    const result = await client.addDocuments(documents, datasetName);

    if (result.code === 0) {
      return NextResponse.json({
        success: true,
        docIds: result.doc_ids,
        message: '文档已提交，正在后台建立索引',
      });
    }

    return NextResponse.json(
      { success: false, error: result.msg || '导入失败' },
      { status: 500 }
    );
  } catch (error) {
    console.error('[Coze Knowledge] 导入文档失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
