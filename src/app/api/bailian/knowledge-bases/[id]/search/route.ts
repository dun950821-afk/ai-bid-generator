/**
 * 百炼知识库检索API
 * POST: 检索知识库（支持多模态、多轮对话、高级过滤等）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';
import type { RetrievalResult } from '@/lib/bailian/types';

/**
 * 检索知识库
 * @description 支持多种检索模式和高级功能
 * 
 * 请求参数:
 * 
 * ========== 基础参数 ==========
 * - query: 检索查询（必填，图片检索时可为空）
 * 
 * ========== 检索控制参数 ==========
 * - denseSimilarityTopK: 向量检索数量（默认100）
 * - sparseSimilarityTopK: 关键词检索数量（启用后开启混合检索）
 * - topK: @deprecated 使用 denseSimilarityTopK 代替
 * 
 * ========== 重排序控制参数 ==========
 * - enableReranking: 是否启用重排序（默认true）
 * - rerankMinScore: 相似度阈值（0.01-1.00）
 * - rerankTopN: 重排序后返回数量（1-20）
 * - rerankModelName: 重排序模型名称
 * 
 * ========== 多轮对话参数 ==========
 * - enableRewrite: 是否启用查询改写（默认false）
 * - conversationHistory: 对话历史
 *   - role: 'user' | 'assistant'
 *   - content: 消息内容
 * - useConversationMode: @deprecated 使用 enableRewrite 代替
 * 
 * ========== 标签过滤参数 ==========
 * - tags: 标签过滤（多个标签是OR关系）
 * - searchFilters: 高级检索过滤器（支持多条件AND组合）
 * 
 * ========== 多模态检索参数 ==========
 * - images: 图片URL列表（用于图片检索）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const {
      // 基础参数
      query = '',
      
      // 检索控制参数
      denseSimilarityTopK,
      sparseSimilarityTopK,
      topK,
      
      // 重排序控制参数
      enableReranking,
      rerankMinScore,
      rerankTopN,
      rerankModelName,
      
      // 多轮对话参数
      enableRewrite,
      conversationHistory = [],
      useConversationMode = false,
      
      // 标签过滤参数
      tags,
      searchFilters,
      
      // 多模态检索参数
      images,
    } = body;

    // 如果没有查询且没有图片，返回错误
    if (!query && (!images || images.length === 0)) {
      return NextResponse.json(
        { success: false, error: '检索查询或图片不能为空' },
        { status: 400 }
      );
    }

    const service = await createBailianKnowledgeService();
    
    // 构建检索配置
    const retrievalConfig = {
      query,
      knowledgeBaseIds: [id],
      
      // 检索控制（兼容旧参数 topK）
      denseSimilarityTopK: denseSimilarityTopK || topK || 100,
      ...(sparseSimilarityTopK && { sparseSimilarityTopK }),
      
      // 重排序控制
      ...(enableReranking !== undefined && { enableReranking }),
      ...(rerankMinScore && { rerankMinScore }),
      ...(rerankTopN && { rerankTopN }),
      ...(rerankModelName && { rerankModelName }),
      
      // 多轮对话（兼容旧参数 useConversationMode）
      enableRewrite: enableRewrite ?? useConversationMode,
      ...(conversationHistory.length > 0 && { queryHistory: conversationHistory }),
      
      // 标签过滤
      ...(tags && tags.length > 0 && { tags }),
      ...(searchFilters && { searchFilters }),
      
      // 多模态检索
      ...(images && images.length > 0 && { images }),
    };
    
    const result = await service.retrieve(retrievalConfig);

    if (!result.success) {
      return NextResponse.json(result);
    }

    // 转换为前端期望的格式，支持多模态数据
    const results = result.data?.map((item: RetrievalResult) => ({
      content: item.content,
      source: item.documentName,
      score: item.score,
      metadata: {
        documentId: item.documentId,
        pageNumber: item.pageNumber,
        // 多模态数据
        imageUrl: item.imageUrl,
        audioUrl: item.audioUrl,
        videoUrl: item.videoUrl,
        // 文档结构信息
        hierTitle: item.hierTitle,
        title: item.title,
        chunkId: item.chunkId,
        // 完整元数据
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
