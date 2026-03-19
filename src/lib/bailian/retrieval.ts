/**
 * 知识库检索工具类
 * @description 提供知识库检索功能
 */

import { BailianClient } from './client';
import {
  RetrievalConfig,
  HybridRetrievalConfig,
  RetrievalResult,
  ApiResponse,
} from './types';
import * as $Bailian20231229 from '@alicloud/bailian20231229';
import * as $Util from '@alicloud/tea-util';

/**
 * 检索管理器
 */
export class RetrievalManager {
  constructor(private client: BailianClient) {}

  /**
   * 检索知识库
   * @param config 检索配置
   * @returns 检索结果列表
   */
  async retrieve(config: RetrievalConfig): Promise<ApiResponse<RetrievalResult[]>> {
    const request = new $Bailian20231229.RetrieveRequest({
      query: config.query,
      indexIds: config.knowledgeBaseIds,
      topK: config.topK || 5,
      rerankMinScore: config.rerankMinScore || 0.01,
      tags: config.tags,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .retrieveWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      return {
        requestId: body.requestId || '',
        success: true,
        data: (data?.chunks || []).map((chunk: any) => this.mapToRetrievalResult(chunk)),
      };
    });
  }

  /**
   * 混合检索（向量+全文）
   * @param config 混合检索配置
   * @returns 检索结果列表
   */
  async hybridRetrieve(
    config: HybridRetrievalConfig
  ): Promise<ApiResponse<RetrievalResult[]>> {
    const request = new $Bailian20231229.RetrieveRequest({
      query: config.query,
      indexIds: config.knowledgeBaseIds,
      topK: config.topK || 5,
      rerankMinScore: config.rerankMinScore || 0.01,
      tags: config.tags,
      // 注意：百炼API可能不支持直接设置权重，这里保留接口供未来扩展
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .retrieveWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      return {
        requestId: body.requestId || '',
        success: true,
        data: (data?.chunks || []).map((chunk: any) => this.mapToRetrievalResult(chunk)),
      };
    });
  }

  /**
   * 检索并返回格式化的答案
   * @param config 检索配置
   * @returns 检索结果和格式化文本
   */
  async retrieveWithFormat(
    config: RetrievalConfig
  ): Promise<
    ApiResponse<{
      results: RetrievalResult[];
      formattedText: string;
    }>
  > {
    const response = await this.retrieve(config);

    if (!response.success || !response.data) {
      return {
        requestId: response.requestId,
        success: false,
        message: response.message,
      };
    }

    // 格式化结果为文本
    const formattedText = response.data
      .map((result, index) => {
        const parts = [
          `【来源 ${index + 1}】${result.documentName}`,
          `内容：${result.content}`,
        ];
        
        if (result.pageNumber) {
          parts.push(`页码：${result.pageNumber}`);
        }
        
        parts.push(`相关度：${(result.score * 100).toFixed(1)}%`);
        
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    return {
      requestId: response.requestId,
      success: true,
      data: {
        results: response.data,
        formattedText,
      },
    };
  }

  /**
   * 按知识库分组检索
   * @param config 检索配置
   * @returns 按知识库分组的结果
   */
  async retrieveGrouped(
    config: RetrievalConfig
  ): Promise<
    ApiResponse<
      Map<
        string,
        {
          knowledgeBaseName: string;
          results: RetrievalResult[];
        }
      >
    >
  > {
    const response = await this.retrieve(config);

    if (!response.success || !response.data) {
      return {
        requestId: response.requestId,
        success: false,
        message: response.message,
      };
    }

    // 按知识库ID分组
    const groupedResults = new Map<
      string,
      {
        knowledgeBaseName: string;
        results: RetrievalResult[];
      }
    >();

    for (const result of response.data) {
      const docId = result.documentId;
      
      if (!groupedResults.has(docId)) {
        groupedResults.set(docId, {
          knowledgeBaseName: result.documentName,
          results: [],
        });
      }
      
      groupedResults.get(docId)!.results.push(result);
    }

    return {
      requestId: response.requestId,
      success: true,
      data: groupedResults,
    };
  }

  /**
   * 带重排序的检索
   * @param config 检索配置
   * @param rerankThreshold 重排序阈值
   * @returns 过滤后的检索结果
   */
  async retrieveWithRerank(
    config: RetrievalConfig,
    rerankThreshold: number = 0.3
  ): Promise<ApiResponse<RetrievalResult[]>> {
    const response = await this.retrieve(config);

    if (!response.success || !response.data) {
      return response;
    }

    // 过滤低分结果
    const filteredResults = response.data.filter(
      result => result.score >= rerankThreshold
    );

    return {
      requestId: response.requestId,
      success: true,
      data: filteredResults,
    };
  }

  /**
   * 多轮对话检索（带上下文）
   * @description 基于对话历史进行智能检索，支持上下文理解和追问
   * @param query 当前问题
   * @param knowledgeBaseIds 知识库ID列表
   * @param conversationHistory 对话历史
   * @param topK 返回结果数量
   * @returns 检索结果
   */
  async retrieveWithContext(
    query: string,
    knowledgeBaseIds: string[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    topK: number = 5
  ): Promise<ApiResponse<RetrievalResult[]>> {
    // 如果没有对话历史，直接检索
    if (conversationHistory.length === 0) {
      return this.retrieve({
        query,
        knowledgeBaseIds,
        topK,
      });
    }

    // 分析查询类型
    const queryAnalysis = this.analyzeQuery(query, conversationHistory);

    // 构建增强查询
    const enhancedQuery = this.buildEnhancedQuery(query, conversationHistory, queryAnalysis);

    // 执行检索
    const response = await this.retrieve({
      query: enhancedQuery,
      knowledgeBaseIds,
      topK: queryAnalysis.isFollowUp ? topK + 2 : topK, // 追问时多返回一些结果
    });

    if (!response.success || !response.data) {
      return response;
    }

    // 如果是追问，进行上下文相关性过滤
    if (queryAnalysis.isFollowUp) {
      const filteredResults = this.filterByContextRelevance(
        response.data,
        queryAnalysis.contextKeywords || []
      );
      
      return {
        ...response,
        data: filteredResults.slice(0, topK),
      };
    }

    return response;
  }

  /**
   * 分析查询类型和特征
   */
  private analyzeQuery(
    query: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): {
    isFollowUp: boolean;
    contextKeywords?: string[];
    needsContextExpansion: boolean;
  } {
    // 追问指示词
    const followUpIndicators = [
      '它', '这个', '那个', '上面', '刚才', '之前',
      '呢', '还有呢', '为什么', '怎么', '如何',
      '更多', '其他', '不同', '比较',
    ];

    // 检查是否是追问
    const isFollowUp = followUpIndicators.some(indicator => query.includes(indicator));

    // 提取上下文关键词
    const contextKeywords: string[] = [];
    
    if (isFollowUp && history.length > 0) {
      // 从最近的回答中提取关键词
      const lastAnswer = history[history.length - 1];
      if (lastAnswer.role === 'assistant') {
        const keywords = this.extractKeywords(lastAnswer.content);
        contextKeywords.push(...keywords);
      }
      
      // 从最近的问题中提取关键词
      const recentUserQueries = history
        .filter(msg => msg.role === 'user')
        .slice(-2)
        .map(msg => msg.content);
      
      for (const q of recentUserQueries) {
        contextKeywords.push(...this.extractKeywords(q));
      }
    }

    return {
      isFollowUp,
      contextKeywords: [...new Set(contextKeywords)],
      needsContextExpansion: isFollowUp && contextKeywords.length > 0,
    };
  }

  /**
   * 构建增强查询
   */
  private buildEnhancedQuery(
    query: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    analysis: ReturnType<typeof this.analyzeQuery>
  ): string {
    if (!analysis.isFollowUp) {
      return query;
    }

    // 对于追问，结合上下文关键词构建查询
    if (analysis.contextKeywords && analysis.contextKeywords.length > 0) {
      // 取前5个关键词
      const topKeywords = analysis.contextKeywords.slice(0, 5);
      
      // 如果查询很短，可能是完全依赖上下文的追问
      if (query.length <= 5) {
        return `${topKeywords.join(' ')} ${query}`;
      }
      
      // 否则追加关键词以增强语义
      return `${query} ${topKeywords.slice(0, 2).join(' ')}`;
    }

    // 没有明确关键词时，使用最近的问题作为上下文
    const recentQuestions = history
      .filter(msg => msg.role === 'user')
      .slice(-1)
      .map(msg => msg.content);

    if (recentQuestions.length > 0) {
      return `${recentQuestions[0]} ${query}`;
    }

    return query;
  }

  /**
   * 根据上下文相关性过滤结果
   */
  private filterByContextRelevance(
    results: RetrievalResult[],
    contextKeywords: string[]
  ): RetrievalResult[] {
    if (contextKeywords.length === 0) {
      return results;
    }

    // 为每个结果计算上下文相关性分数
    const scoredResults = results.map(result => {
      const content = result.content.toLowerCase();
      let matchScore = 0;
      
      for (const keyword of contextKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          matchScore += 1;
        }
      }
      
      return {
        ...result,
        contextScore: matchScore / contextKeywords.length,
      };
    });

    // 按原始分数和上下文相关性综合排序
    scoredResults.sort((a, b) => {
      const scoreA = a.score * 0.7 + a.contextScore * 0.3;
      const scoreB = b.score * 0.7 + b.contextScore * 0.3;
      return scoreB - scoreA;
    });

    return scoredResults;
  }

  /**
   * 提取关键词（简单实现）
   */
  private extractKeywords(text: string): string[] {
    // 移除标点符号
    const cleaned = text.replace(/[，。！？、；：""''（）【】\s]/g, ' ');
    
    // 分词（简单按空格分割，中文可能需要更复杂的分词）
    const words = cleaned.split(/\s+/).filter(w => w.length > 1);
    
    // 过滤停用词
    const stopWords = new Set([
      '是', '的', '了', '在', '有', '和', '与', '或', '这', '那',
      '一个', '这个', '那个', '可以', '能够', '需要', '应该',
      '什么', '怎么', '如何', '为什么', '哪', '谁', '何时',
    ]);
    
    return words.filter(w => !stopWords.has(w) && w.length >= 2);
  }

  /**
   * 映射检索结果
   */
  private mapToRetrievalResult(chunk: Record<string, any>): RetrievalResult {
    return {
      content: chunk.content || '',
      documentName: chunk.documentName || 'Unknown',
      documentId: chunk.documentId || '',
      score: chunk.score || 0,
      pageNumber: chunk.pageNumber,
      metadata: chunk.metadata,
    };
  }
}
