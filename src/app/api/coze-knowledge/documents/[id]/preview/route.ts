import { NextRequest, NextResponse } from 'next/server';
import { listDatasets, listDocuments, getCozeSettings } from '@/lib/services/coze-api-client';

/**
 * 获取文档预览内容
 * 
 * GET /api/coze-knowledge/documents/[id]/preview?dataset_id=xxx
 * 
 * 如果没有提供 dataset_id，会遍历空间所有知识库查找该文档
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: docId } = await params;
    const { searchParams } = new URL(request.url);
    let datasetId = searchParams.get('dataset_id');

    // 如果没有提供 dataset_id，遍历所有知识库查找该文档
    if (!datasetId) {
      const settings = await getCozeSettings();
      if (!settings.apiToken || !settings.spaceId) {
        return NextResponse.json(
          { success: false, error: '请先在设置中配置扣子 Space ID 和 Authorization Token' },
          { status: 400 }
        );
      }

      const datasetsResult = await listDatasets(1, 50);
      const datasets = datasetsResult.datasets || [];

      for (const ds of datasets) {
        try {
          const docsResult = await listDocuments(ds.dataset_id, 1, 50);
          const doc = docsResult.documents?.find(
            (d: { document_id: string }) => d.document_id === docId
          );
          if (doc) {
            datasetId = ds.dataset_id;
            break;
          }
        } catch {
          // 忽略单个知识库查询失败
        }
      }

      if (!datasetId) {
        return NextResponse.json(
          { success: false, error: '未找到该文档所属的知识库，请确认文档是否通过官方 API 上传' },
          { status: 404 }
        );
      }
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
