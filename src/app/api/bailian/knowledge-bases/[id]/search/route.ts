/**
 * 百炼知识库检索API
 * POST: 检索知识库（支持连续对话模式）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';
import type { RetrievalResult } from '@/lib/bailian/types';

/**
 * 检索知识库
 * @description 支持普通检索和连续对话检索模式
 * 
 * 请求参数:
 * - query: 检索查询（必填）
 * - topK: 返回结果数量（默认5）
 * - rerankMinScore: 重排序最小分数
 * - tags: 标签过滤
 * - conversationHistory: 对话历史（用于连续对话检索）
 *   - role: 'user' | 'assistant'
 *   - content: 消息内容
 * - useConversationMode: 是否使用连续对话模式（默认false）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { 
      query, 
      topK = 5, 
      rerankMinScore, 
      tags,
      conversationHistory = [],
      useConversationMode = false,
    } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: '检索查询不能为空' },
        { status: 400 }
      );
    }

    const service = await createBailianKnowledgeService();
    
    let result;
    
    // 判断是否使用连续对话模式
    if (useConversationMode && conversationHistory.length > 0) {
      // 连续对话检索
      result = await service.retrieveWithContext(
        query,
        [id],
        conversationHistory,
        topK
      );
    } else {
      // 普通检索
      result = await service.retrieve({
        knowledgeBaseIds: [id],
        query,
        topK,
        rerankMinScore,
        tags,
      });
    }

    if (!result.success) {
      return NextResponse.json(result);
    }

    // 转换为前端期望的格式
    const results = result.data?.map((item: RetrievalResult) => ({
      content: item.content,
      source: item.documentName,
      score: item.score,
      metadata: {
        documentId: item.documentId,
        pageNumber: item.pageNumber,
        ...item.metadata,
      },
    })) || [];

    return NextResponse.json({
      success: true,
      data: { results },
    });
  } catch (error: any) {
    console.error('[Bailian API] Search failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '检索失败' },
      { status: 500 }
    );
  }
}
