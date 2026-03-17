/**
 * RAG检索API
 * POST: 在知识库中检索相关内容
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createRAGRetrievalService } from '@/lib/services/rag-retrieval';
import { HeaderUtils } from 'coze-coding-dev-sdk';

/**
 * 在知识库中检索相关内容
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const body = await request.json();
    const {
      query,
      topK = 5,
      minScore = 0.5,
      useKeywordSearch = true,
      useSemanticSearch = true,
    } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '缺少查询内容' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查知识库是否存在
    const { data: kb, error: kbError } = await client
      .from('knowledge_bases')
      .select('id, chunk_count')
      .eq('id', knowledgeBaseId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    if (kb.chunk_count === 0) {
      return NextResponse.json(
        { success: false, error: '知识库暂无内容，请先上传文档并进行向量化' },
        { status: 400 }
      );
    }

    // 创建检索服务
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const ragService = createRAGRetrievalService(customHeaders);

    // 执行混合检索
    const results = await ragService.hybridSearch(query, knowledgeBaseId, {
      topK,
      minScore,
      useKeywordSearch,
      useSemanticSearch,
    });

    // 获取文档名称
    const documentIds = [...new Set(results.map((r) => r.documentId))];
    const { data: documents } = await client
      .from('knowledge_documents')
      .select('id, name')
      .in('id', documentIds);

    const documentMap = new Map();
    (documents || []).forEach((doc) => {
      documentMap.set(doc.id, doc.name);
    });

    // 添加文档名称到结果
    const enrichedResults = results.map((result) => ({
      ...result,
      metadata: {
        ...result.metadata,
        documentName: documentMap.get(result.documentId),
      },
    }));

    return NextResponse.json({
      success: true,
      data: {
        query,
        results: enrichedResults,
        total: enrichedResults.length,
      },
    });
  } catch (error) {
    console.error('检索失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '检索失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取相关上下文（用于LLM提示）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const maxTokens = parseInt(searchParams.get('maxTokens') || '2000');

    if (!query) {
      return NextResponse.json(
        { success: false, error: '缺少查询内容' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查知识库是否存在
    const { data: kb, error: kbError } = await client
      .from('knowledge_bases')
      .select('id')
      .eq('id', knowledgeBaseId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 创建检索服务
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const ragService = createRAGRetrievalService(customHeaders);

    // 获取相关上下文
    const context = await ragService.getRelevantContext(
      query,
      knowledgeBaseId,
      maxTokens
    );

    return NextResponse.json({
      success: true,
      data: {
        query,
        context,
        tokenCount: Math.ceil(context.length / 2),
      },
    });
  } catch (error) {
    console.error('获取上下文失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取上下文失败',
      },
      { status: 500 }
    );
  }
}
