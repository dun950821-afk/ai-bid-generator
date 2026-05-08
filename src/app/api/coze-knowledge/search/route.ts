import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient } from 'coze-coding-dev-sdk';
import { getCozeSettings, listDatasets, listDocuments } from '@/lib/services/coze-api-client';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 搜索扣子知识库
 * 使用 coze-coding-dev-sdk（integration.coze.cn）进行搜索召回，
 * 然后通过官方 API 和数据库查询文档名称以补全信息
 * 
 * 注：integration.coze.cn 返回的 content 字段是加密的，无法直接展示，
 * 因此我们遍历知识库查找文档名称来展示搜索结果
 * 
 * POST /api/coze-knowledge/search
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, top_k = 5 } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '必须提供 query 参数' },
        { status: 400 }
      );
    }

    // 1. 使用 SDK 进行搜索召回
    const client = new KnowledgeClient();
    const searchResult = await client.search(query, undefined, top_k);

    const rawChunks = searchResult.chunks || [];

    if (rawChunks.length === 0) {
      return NextResponse.json({
        success: true,
        data: { chunks: [] },
      });
    }

    // 2. 收集所有 doc_id，多来源查找文档名称
    const docNameMap = new Map<string, string>();

    // 2a. 通过官方 API 遍历所有知识库查找文档名称
    try {
      const settings = await getCozeSettings();
      if (settings.apiToken && settings.spaceId) {
        const datasetsResult = await listDatasets(1, 50);
        const datasets = datasetsResult.datasets || [];

        for (const ds of datasets) {
          try {
            const docsResult = await listDocuments(ds.dataset_id, 1, 50);
            const docs = docsResult.documents || [];
            for (const doc of docs) {
              if (doc.document_id) {
                docNameMap.set(doc.document_id, doc.name || '未知文档');
              }
            }
          } catch {
            // 忽略单个知识库查询失败
          }
        }
      }
    } catch {
      // 获取文档名称失败不影响搜索结果
    }

    // 2b. 通过 Supabase 数据库查找文档名称（SDK 上传的文档记录在本地 DB）
    try {
      const supabase = getSupabaseClient();
      const docIds = rawChunks.map(c => c.doc_id).filter(Boolean) as string[];
      if (docIds.length > 0) {
        const { data: dbDocs } = await supabase
          .from('coze_documents')
          .select('doc_id, title')
          .in('doc_id', docIds);
        if (dbDocs) {
          for (const doc of dbDocs) {
            if (doc.doc_id && doc.title) {
              docNameMap.set(doc.doc_id, doc.title);
            }
          }
        }
      }
    } catch {
      // DB 查询失败不影响搜索结果
    }

    // 3. 组装结果
    const chunks = rawChunks.map((chunk) => {
      const docName = docNameMap.get(chunk.doc_id || '');
      return {
        doc_name: docName || '',
        score: chunk.score,
        doc_id: chunk.doc_id || '',
        chunk_id: chunk.chunk_id || '',
      };
    });

    return NextResponse.json({
      success: true,
      data: { chunks },
    });
  } catch (error) {
    console.error('[Coze Knowledge] 搜索失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
