import { NextRequest, NextResponse } from 'next/server';
import { listDatasets, listDocuments, getCozeSettings, type CozeDocument } from '@/lib/services/coze-api-client';

/**
 * 获取文档预览内容
 * 
 * GET /api/coze-knowledge/documents/[id]/preview?dataset_id=xxx&doc_name=xxx
 * 
 * 查找文档方式（优先级从高到低）：
 * 1. 通过 docId + dataset_id 直接定位
 * 2. 通过 doc_name + dataset_id 按名称匹配（搜索结果常用）
 * 3. 遍历所有知识库按 docId 查找
 * 4. 遍历所有知识库按 doc_name 查找
 * 
 * 还支持 ?preview_chunks=1 参数，直接展示搜索匹配片段
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: docId } = await params;
    const { searchParams } = new URL(request.url);
    const docName = searchParams.get('doc_name');
    const datasetIdParam = searchParams.get('dataset_id');
    const previewChunks = searchParams.get('preview_chunks');

    // 如果是直接预览搜索匹配片段模式
    if (previewChunks === '1') {
      return NextResponse.json({
        success: true,
        data: {
          document_id: docId,
          name: docName || `文档 ${docId.slice(-8)}`,
          format_type: 0,
          source_type: 0,
          char_count: 0,
          size: 0,
          status: 1,
          preview_url: '',
          chunks: [],
          preview_mode: 'search_chunks',
        },
      });
    }

    const settings = await getCozeSettings();
    if (!settings.apiToken || !settings.spaceId) {
      return NextResponse.json(
        { success: false, error: '请先在设置中配置扣子 Space ID 和 Authorization Token' },
        { status: 400 }
      );
    }

    // 获取所有知识库
    let datasets: Array<{ dataset_id: string; name: string }> = [];
    try {
      const dsResult = await listDatasets(1, 50);
      datasets = dsResult.datasets.map(ds => ({
        dataset_id: ds.dataset_id,
        name: ds.name,
      }));
    } catch {
      // 获取失败时使用空列表
    }

    // 在指定知识库中查找文档
    const findDocInDataset = async (dsId: string) => {
      try {
        const docsResult = await listDocuments(dsId, 1, 50);
        // 先按 docId 精确匹配
        const byId = docsResult.documents?.find(
          (d: { document_id: string }) => d.document_id === docId
        );
        if (byId) return { doc: byId, datasetId: dsId };

        // 再按 docName 匹配
        if (docName) {
          const byName = docsResult.documents?.find(
            (d: { name: string }) => d.name === docName
          );
          if (byName) return { doc: byName, datasetId: dsId };
        }
      } catch {
        // 忽略查询失败
      }
      return null;
    };

    let foundDoc: { doc: CozeDocument; datasetId: string } | null = null;

    // 优先在指定 dataset_id 中查找
    if (datasetIdParam) {
      foundDoc = await findDocInDataset(datasetIdParam);
    }

    // 如果指定知识库中未找到，遍历所有知识库查找
    if (!foundDoc) {
      for (const ds of datasets) {
        foundDoc = await findDocInDataset(ds.dataset_id);
        if (foundDoc) break;
      }
    }

    if (!foundDoc) {
      return NextResponse.json(
        { success: false, error: '未找到该文档，请确认文档是否已通过官方 API 上传' },
        { status: 404 }
      );
    }

    const doc = foundDoc.doc;
    const treeUrl = doc.doc_tree_tos_url as string | undefined;
    const previewUrl = doc.preview_tos_url as string | undefined;

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
        preview_mode: 'full_doc',
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
