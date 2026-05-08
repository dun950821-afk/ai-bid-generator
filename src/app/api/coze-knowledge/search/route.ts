import { NextRequest, NextResponse } from 'next/server';
import { getCozeSettings, listDatasets, listDocuments } from '@/lib/services/coze-api-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, top_k = 5, dataset_id } = body;

    if (!query || !query.trim()) {
      return NextResponse.json({ success: false, error: '请输入搜索关键词' });
    }

    const settings = await getCozeSettings();
    if (!settings.apiToken || !settings.spaceId) {
      return NextResponse.json({ success: false, error: '请先在设置中配置 Space ID 和 Authorization Token' });
    }

    // 如果指定了 dataset_id，只搜索该知识库
    // 否则搜索所有知识库
    let targetDatasetIds: string[] = [];
    const datasetNameMap = new Map<string, string>();

    if (dataset_id) {
      targetDatasetIds = [dataset_id];
      // 获取知识库名称
      try {
        const dsResult = await listDatasets();
        for (const ds of dsResult.datasets) {
          datasetNameMap.set(ds.dataset_id, ds.name);
        }
      } catch {
        // 忽略
      }
    } else {
      const datasetsResult = await listDatasets();
      for (const ds of datasetsResult.datasets) {
        targetDatasetIds.push(ds.dataset_id);
        datasetNameMap.set(ds.dataset_id, ds.name);
      }
    }

    // 从每个知识库中获取文档列表，构建文档信息映射
    const docMap = new Map<string, { name: string; dataset_id: string; dataset_name: string; char_count: number; status: number; size: number; format_type: number; source_type: number; doc_tree_tos_url?: string }>();

    for (const dsId of targetDatasetIds) {
      try {
        const docsResult = await listDocuments(dsId);
        for (const doc of docsResult.documents) {
          docMap.set(doc.document_id, {
            name: doc.name,
            dataset_id: dsId,
            dataset_name: datasetNameMap.get(dsId) || '',
            char_count: doc.char_count,
            status: doc.status,
            size: doc.size,
            format_type: doc.format_type,
            source_type: doc.source_type,
            doc_tree_tos_url: doc.doc_tree_tos_url,
          });
        }
      } catch {
        // 跳过无法访问的知识库
      }
    }

    // 从官方 API 的文档内容中搜索关键词
    const searchResults: Array<{
      doc_id: string;
      doc_name: string;
      dataset_id: string;
      dataset_name: string;
      char_count: number;
      size: number;
      format_type: number;
      source_type: number;
      status: number;
      score: number;
      matched_chunks: Array<{ chunk_index: number; text: string }>;
    }> = [];

    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

    for (const [docId, docInfo] of docMap) {
      if (searchResults.length >= top_k) break;

      try {
        // 获取文档 tree 内容
        if (!docInfo.doc_tree_tos_url) continue;

        const treeResponse = await fetch(docInfo.doc_tree_tos_url, { signal: AbortSignal.timeout(8000) });
        if (!treeResponse.ok) continue;

        const treeData = await treeResponse.json();
        const chunks = treeData?.chunks;
        if (!Array.isArray(chunks) || chunks.length === 0) continue;

        // 在每个 chunk 中搜索关键词
        const matchedChunks: Array<{ chunk_index: number; text: string }> = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const htmlText: string = chunk?.html_text || '';
          const plainText = htmlText.replace(/<[^>]*>/g, '').toLowerCase();

          // 检查是否匹配所有关键词
          const isMatch = keywords.every((kw: string) => plainText.includes(kw));
          if (isMatch) {
            // 截取匹配的文本片段（去除 HTML 标签后截取）
            const cleanText = htmlText.replace(/<[^>]*>/g, '').trim();
            const maxLen = 200;
            const text = cleanText.length > maxLen ? cleanText.substring(0, maxLen) + '...' : cleanText;
            matchedChunks.push({ chunk_index: i, text });
          }
        }

        if (matchedChunks.length > 0) {
          // 基于匹配分块比例计算相似度分数
          const score = Math.min(0.95, 0.3 + (matchedChunks.length / Math.max(chunks.length, 1)) * 0.65);

          searchResults.push({
            doc_id: docId,
            doc_name: docInfo.name,
            dataset_id: docInfo.dataset_id,
            dataset_name: docInfo.dataset_name,
            char_count: docInfo.char_count,
            size: docInfo.size,
            format_type: docInfo.format_type,
            source_type: docInfo.source_type,
            status: docInfo.status,
            score: Math.round(score * 1000) / 1000,
            matched_chunks: matchedChunks.slice(0, 5),
          });
        }
      } catch {
        // 跳过无法获取内容的文档
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: searchResults,
        total: searchResults.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '搜索失败';
    console.error('[Coze Search] Error:', message);
    return NextResponse.json({ success: false, error: message });
  }
}
