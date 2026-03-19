import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { RAGRetrievalService } from '@/lib/services/rag-retrieval';

// POST /api/search - 知识库检索（支持向量检索和标签过滤）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, knowledgeBaseId, topK = 5, useSemantic = true, useKeyword = true, tagIds } = body;

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

    console.log(`[检索] 查询: "${query}", 知识库: ${knowledgeBaseId}, topK: ${topK}, 标签: ${tagIds?.join(',') || '无'}`);

    const client = getSupabaseClient();

    // 如果指定了标签，先获取匹配标签的文档ID
    let filteredDocIds: string[] | null = null;
    if (tagIds && tagIds.length > 0) {
      const { data: tagDocs, error: tagError } = await client
        .from('document_tags')
        .select('document_id')
        .in('tag_id', tagIds);

      if (tagError) {
        console.error('[检索] 获取标签文档失败:', tagError);
      } else {
        filteredDocIds = [...new Set((tagDocs || []).map((d: any) => d.document_id))];
        console.log(`[检索] 标签过滤后的文档数: ${filteredDocIds?.length || 0}`);
        
        // 如果没有匹配的文档，直接返回空结果
        if (filteredDocIds && filteredDocIds.length === 0) {
          return NextResponse.json({
            success: true,
            data: {
              results: [],
              query,
              topK,
              searchType: 'none',
              filteredByTags: true,
            },
          });
        }
      }
    }

    // 检查知识库是否有文档和分块
    let chunkQuery = client
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('knowledge_base_id', knowledgeBaseId);

    // 如果有标签过滤，只统计过滤后的文档
    if (filteredDocIds) {
      chunkQuery = chunkQuery.in('document_id', filteredDocIds);
    }

    const { data: chunkCount, error: countError } = await chunkQuery;

    if (countError) {
      console.error('[检索] 检查分块数量失败:', countError);
    }

    console.log(`[检索] 分块数量: ${chunkCount?.length || 0}`);

    // 检查是否有向量数据
    let vectorQuery = client
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('knowledge_base_id', knowledgeBaseId)
      .not('embedding', 'is', null);

    if (filteredDocIds) {
      vectorQuery = vectorQuery.in('document_id', filteredDocIds);
    }

    const { data: vectorCount, error: vectorError } = await vectorQuery;

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
            documentIds: filteredDocIds || undefined,
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
      
      let keywordQuery = client
        .from('document_chunks')
        .select(`
          id,
          content,
          document_id,
          chunk_index,
          knowledge_base_id
        `)
        .eq('knowledge_base_id', knowledgeBaseId)
        .ilike('content', `%${query}%`);

      // 如果有标签过滤，只搜索过滤后的文档
      if (filteredDocIds) {
        keywordQuery = keywordQuery.in('document_id', filteredDocIds);
      }

      const { data: chunks, error } = await keywordQuery.limit(topK);

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
        filteredByTags: tagIds && tagIds.length > 0,
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
