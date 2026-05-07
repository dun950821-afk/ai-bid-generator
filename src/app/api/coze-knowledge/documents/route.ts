import { NextResponse } from 'next/server';
import { getCozeDocumentList, getCozeKnowledgeStats, deleteCozeDocument } from '@/lib/services/retrieval/coze-provider';

/**
 * GET /api/coze-knowledge/documents
 * 获取扣子知识库文档列表和统计
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dataset = searchParams.get('dataset') || undefined;
    const statsOnly = searchParams.get('stats_only') === 'true';

    // 获取统计信息
    const statsResult = await getCozeKnowledgeStats();

    if (statsOnly) {
      return NextResponse.json({
        success: true,
        data: {
          totalDocuments: statsResult.totalDocuments || 0,
          readyDocuments: statsResult.readyDocuments || 0,
          indexingDocuments: statsResult.indexingDocuments || 0,
        },
      });
    }

    // 获取文档列表
    const listResult = await getCozeDocumentList(dataset);

    if (!listResult.success) {
      return NextResponse.json(
        { success: false, error: listResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: listResult.documents || [],
        stats: {
          totalDocuments: statsResult.totalDocuments || 0,
          readyDocuments: statsResult.readyDocuments || 0,
          indexingDocuments: statsResult.indexingDocuments || 0,
        },
      },
    });
  } catch (error) {
    console.error('[Coze Documents API] 获取文档列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档列表失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coze-knowledge/documents?id=xxx
 * 删除文档
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('id');

    if (!docId) {
      return NextResponse.json(
        { success: false, error: '缺少文档 ID' },
        { status: 400 }
      );
    }

    const result = await deleteCozeDocument(docId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Coze Documents API] 删除文档失败:', error);
    return NextResponse.json(
      { success: false, error: '删除文档失败' },
      { status: 500 }
    );
  }
}
