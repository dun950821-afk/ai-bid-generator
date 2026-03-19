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
   * @param query 当前问题
   * @param knowledgeBaseIds 知识库ID列表
   * @param conversationHistory 对话历史
   * @param topK 返回结果数量
   * @returns 检索结果
   */
  async retrieveWithContext(
    query: string,
    knowledgeBaseIds: string[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    topK: number = 5
  ): Promise<ApiResponse<RetrievalResult[]>> {
    // 构建上下文增强的查询
    const contextQuery = this.buildContextQuery(query, conversationHistory);

    return this.retrieve({
      query: contextQuery,
      knowledgeBaseIds,
      topK,
    });
  }

  /**
   * 构建上下文增强的查询
   */
  private buildContextQuery(
    query: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    if (conversationHistory.length === 0) {
      return query;
    }

    // 取最近3轮对话
    const recentHistory = conversationHistory.slice(-3);
    const contextParts = recentHistory.map(
      msg => `${msg.role === 'user' ? '用户' : '助手'}：${msg.content}`
    );

    // 组合上下文和当前问题
    return [...contextParts, `当前问题：${query}`].join('\n');
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
