/**
 * 知识库向量化API
 * POST: 对知识库文档进行分块和向量化
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createDocumentEmbeddingService } from '@/lib/services/embedding-service';
import { HeaderUtils } from 'coze-coding-dev-sdk';

/**
 * 对知识库文档进行向量化
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const body = await request.json();
    const { documentId, content, chunkSize, chunkOverlap } = body;

    const client = getSupabaseClient();

    // 检查知识库是否存在
    const { data: kb, error: kbError } = await client
      .from('knowledge_bases')
      .select('*')
      .eq('id', knowledgeBaseId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 如果提供了文档ID，处理单个文档
    if (documentId && content) {
      // 检查文档是否存在
      const { data: doc, error: docError } = await client
        .from('knowledge_documents')
        .select('*')
        .eq('id', documentId)
        .eq('knowledge_base_id', knowledgeBaseId)
        .single();

      if (docError || !doc) {
        return NextResponse.json(
          { success: false, error: '文档不存在' },
          { status: 404 }
        );
      }

      // 创建向量化服务
      const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
      const embeddingService = createDocumentEmbeddingService(customHeaders);

      // 处理文档
      const result = await embeddingService.processDocument(
        documentId,
        knowledgeBaseId,
        content,
        {
          chunkSize: chunkSize || kb.chunk_size || 500,
          chunkOverlap: chunkOverlap || kb.chunk_overlap || 50,
        }
      );

      return NextResponse.json({
        success: result.success,
        data: {
          documentId,
          chunkCount: result.chunkCount,
          error: result.error,
        },
      });
    }

    // 如果没有提供文档ID，处理所有待处理的文档
    const { data: pendingDocs, error: docsError } = await client
      .from('knowledge_documents')
      .select('*')
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('vector_status', 'pending');

    if (docsError) {
      console.error('获取待处理文档失败:', docsError);
      return NextResponse.json(
        { success: false, error: '获取待处理文档失败' },
        { status: 500 }
      );
    }

    if (!pendingDocs || pendingDocs.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: '没有待处理的文档',
          processedCount: 0,
        },
      });
    }

    // 批量处理文档
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const embeddingService = createDocumentEmbeddingService(customHeaders);
    const processedCount = 0;
    const errors: string[] = [];

    for (const doc of pendingDocs) {
      // 获取文档内容（这里需要从存储中读取，暂时跳过）
      // 实际实现中应该从存储服务读取文档内容
      console.log(`处理文档: ${doc.id} - ${doc.name}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        message: '文档向量化任务已提交',
        pendingCount: pendingDocs.length,
      },
    });
  } catch (error) {
    console.error('文档向量化失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '文档向量化失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取向量化状态
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const client = getSupabaseClient();

    // 获取知识库统计
    const { data: kb, error: kbError } = await client
      .from('knowledge_bases')
      .select('document_count, chunk_count')
      .eq('id', knowledgeBaseId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 获取各状态的文档数量
    const { data: statusCounts } = await client
      .from('knowledge_documents')
      .select('vector_status')
      .eq('knowledge_base_id', knowledgeBaseId);

    const statusSummary = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    (statusCounts || []).forEach((doc) => {
      const status = doc.vector_status as keyof typeof statusSummary;
      if (status && status in statusSummary) {
        statusSummary[status]++;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        documentCount: kb.document_count,
        chunkCount: kb.chunk_count,
        statusSummary,
      },
    });
  } catch (error) {
    console.error('获取向量化状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取向量化状态失败',
      },
      { status: 500 }
    );
  }
}
