import { NextRequest, NextResponse } from 'next/server';
import { listDocuments } from '@/lib/services/coze-api-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: docId } = await params;
    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get('dataset_id');

    if (!datasetId) {
      return NextResponse.json(
        { success: false, error: '缺少 dataset_id 参数' },
        { status: 400 }
      );
    }

    // 获取文档列表，找到目标文档的 doc_tree_tos_url
    const result = await listDocuments(datasetId, 1, 50);
    const doc = result.documents?.find(
      (d: { document_id: string }) => d.document_id === docId
    );

    if (!doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    const treeUrl = doc.doc_tree_tos_url;
    const previewUrl = doc.preview_tos_url;

    if (!treeUrl && !previewUrl) {
      return NextResponse.json(
        { success: false, error: '该文档暂无预览内容' },
        { status: 404 }
      );
    }

    // 获取文档树内容（解析后的文本 chunks）
    let chunks: Array<{ html_text: string }> = [];
    if (treeUrl) {
      try {
        const treeResp = await fetch(treeUrl);
        if (treeResp.ok) {
          const treeData = await treeResp.json();
          if (treeData.chunks && Array.isArray(treeData.chunks)) {
            chunks = treeData.chunks;
          }
        }
      } catch {
        // doc_tree_tos_url 获取失败时忽略，返回空 chunks
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        document_id: doc.document_id,
        name: doc.name,
        format_type: doc.format_type,
        source_type: doc.source_type,
        char_count: doc.char_count,
        size: doc.size,
        status: doc.status,
        preview_url: previewUrl,
        chunks,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { success: false, error: `获取文档预览失败: ${message}` },
      { status: 500 }
    );
  }
}
