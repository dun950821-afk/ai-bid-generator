/**
 * 知识库检索API
 * @description 统一使用百炼API进行检索
 */

import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/api/response';
import { getRetrievalService, RetrievalOptions } from '@/lib/services/retrieval';

/**
 * POST /api/search - 知识库检索
 * 
 * 请求参数:
 * - query: 检索查询（必填）
 * - knowledgeBaseIds: 知识库ID列表（必填）
 * - topK: 返回结果数量（默认5）
 * - minScore: 最小相似度分数（默认0.01）
 * - tags: 标签过滤
 * - conversationHistory: 对话历史（用于连续对话检索）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      query, 
      knowledgeBaseIds,
      topK = 5, 
      minScore,
      tags,
      conversationHistory,
    } = body;

    // 参数验证
    if (!query) {
      return ApiResponse.badRequest('查询内容不能为空');
    }

    if (!knowledgeBaseIds || (Array.isArray(knowledgeBaseIds) && knowledgeBaseIds.length === 0)) {
      return ApiResponse.badRequest('知识库ID不能为空');
    }

    // 确保knowledgeBaseIds是数组
    const kbIds = Array.isArray(knowledgeBaseIds) ? knowledgeBaseIds : [knowledgeBaseIds];

    console.log(`[检索] 查询: "${query}", 知识库: ${kbIds.join(',')}, topK: ${topK}`);

    const retrievalService = getRetrievalService();

    // 判断是否使用连续对话模式
    let result;
    if (conversationHistory && conversationHistory.length > 0) {
      result = await retrievalService.retrieveWithContext(query, {
        knowledgeBaseIds: kbIds,
        topK,
        minScore,
        tags,
        conversationHistory,
      });
    } else {
      result = await retrievalService.retrieve(query, {
        knowledgeBaseIds: kbIds,
        topK,
        minScore,
        tags,
      });
    }

    if (!result.success) {
      return ApiResponse.error(
        result.error || '检索失败',
        'RETRIEVAL_FAILED',
        500
      );
    }

    return ApiResponse.success({
      results: result.documents,
      query,
      topK,
      searchType: conversationHistory ? 'contextual' : 'standard',
    }, undefined, result.requestId);
  } catch (error) {
    console.error('[检索] 失败:', error);
    return ApiResponse.error(
      error instanceof Error ? error.message : '检索失败',
      'RETRIEVAL_ERROR',
      500
    );
  }
}
