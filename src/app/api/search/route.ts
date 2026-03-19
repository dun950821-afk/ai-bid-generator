import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { RAGRetrievalService } from '@/lib/services/rag-retrieval';

// POST /api/search - 知识库检索（支持向量检索）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, knowledgeBaseId, topK = 5, useSemantic = true, useKeyword = true } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '查询内容不能为空' },
        { status: 400 }
      );
    }

    if (!knowledgeBaseId) {
      return NextResponse.json(
        { success: false, error: '知识库ID不能为空' },
        { status: 400 }
      );
    }

    console.log(`[检索] 查询: "${query}", 知识库: ${knowledgeBaseId}, topK: ${topK}`);

    // 检查知识库是否有文档和分块
    const client = getSupabaseClient();
    const { data: chunkCount, error: countError } = await client
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('knowledge_base_id', knowledgeBaseId);

    if (countError) {
      console.error('[检索] 检查分块数量失败:', countError);
    }

    console.log(`[检索] 知识库分块数量: ${chunkCount?.length || 0}`);

    // 检查是否有向量数据
    const { data: vectorCount, error: vectorError } = await client
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('knowledge_base_id', knowledgeBaseId)
      .not('embedding', 'is', null);

    if (vectorError) {
      console.error('[检索] 检查向量数量失败:', vectorError);
    }

    const hasVectors = (vectorCount?.length || 0) > 0;
    console.log(`[检索] 有向量的分块数量: ${vectorCount?.length || 0}`);

    let results: any[] = [];

    // 如果有向量数据且启用语义检索，使用向量检索
    if (hasVectors && useSemantic) {
      try {
        const retrievalService = new RAGRetrievalService();
        const retrievalResults = await retrievalService.hybridSearch(
          query,
          knowledgeBaseId,
          {
            topK,
            minScore: 0.3,
            useSemanticSearch: useSemantic,
            useKeywordSearch: useKeyword,
          }
        );

        results = retrievalResults.map(r => ({
          content: r.content,
          source: r.metadata?.documentName || r.documentId,
          score: r.score,
          metadata: r.metadata,
        }));

        console.log(`[检索] 向量检索结果: ${results.length} 条`);
      } catch (error) {
        console.error('[检索] 向量检索失败，降级到关键词搜索:', error);
      }
    }

    // 如果没有向量数据或向量检索失败，使用关键词搜索
    if (results.length === 0) {
      console.log('[检索] 使用关键词搜索');
      
      const { data: chunks, error } = await client
        .from('document_chunks')
        .select(`
          id,
          content,
          document_id,
          chunk_index,
          knowledge_base_id
        `)
        .eq('knowledge_base_id', knowledgeBaseId)
        .ilike('content', `%${query}%`)
        .limit(topK);

      if (error) {
        console.error('[检索] 关键词搜索失败:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      results = (chunks || []).map((chunk: any) => ({
        content: chunk.content,
        source: chunk.document_id,
        score: 0.8, // 关键词匹配固定分数
        metadata: {
          chunkIndex: chunk.chunk_index,
        },
      }));

      console.log(`[检索] 关键词搜索结果: ${results.length} 条`);
    }

    // 获取文档名称
    if (results.length > 0) {
      const documentIds = [...new Set(results.map(r => r.source))];
      const { data: documents } = await client
        .from('knowledge_documents')
        .select('id, original_name')
        .in('id', documentIds);

      const docNameMap = new Map((documents || []).map(d => [d.id, d.original_name]));
      
      results = results.map(r => ({
        ...r,
        source: docNameMap.get(r.source) || r.source,
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        query,
        topK,
        searchType: hasVectors && useSemantic ? 'hybrid' : 'keyword',
      },
    });
  } catch (error) {
    console.error('检索失败:', error);
    return NextResponse.json(
      { success: false, error: '检索失败' },
      { status: 500 }
    );
  }
}
