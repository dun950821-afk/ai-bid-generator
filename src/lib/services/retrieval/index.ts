/**
 * 统一检索服务
 * @description 提供统一的检索接口，根据 active_provider 配置路由到百炼或 IMA 引擎
 */

import { getBailianKnowledgeService } from '@/lib/bailian/service';
import type { RetrievalResult } from '@/lib/bailian/types';
import { getActiveProvider } from './provider';
import { retrieveFromIMA } from './ima-provider';
import { retrieveFromCoze } from './coze-provider';

// 导出增强检索模块
export * from './types';
export { DeepQueryGenerator, createQueryGenerator } from './query-generator';
export { FullRetrievalService, createFullRetrievalService } from './full-retrieval';
export { ContextEnhancementService, createContextEnhancementService } from './context-enhancement';
export { StructuredPromptBuilder, createStructuredPromptBuilder } from './prompt-builder';

/**
 * 检索选项
 */
export interface RetrievalOptions {
  /** 知识库ID列表 */
  knowledgeBaseIds: string[];
  /** 返回结果数量 */
  topK?: number;
  /** 最小相似度分数 */
  minScore?: number;
  /** 标签过滤 */
  tags?: string[];
}

/**
 * 连续对话检索选项
 */
export interface ContextualRetrievalOptions extends RetrievalOptions {
  /** 对话历史 */
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * 检索结果项
 */
export interface RetrievedDocument {
  /** 文档ID */
  id: string;
  /** 文档内容 */
  content: string;
  /** 文档名称 */
  documentName: string;
  /** 相似度分数 */
  score: number;
  /** 页码 */
  pageNumber?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 检索结果
 */
export interface RetrievalResponse {
  /** 是否成功 */
  success: boolean;
  /** 检索结果 */
  documents: RetrievedDocument[];
  /** 错误信息 */
  error?: string;
  /** 请求ID */
  requestId?: string;
}

/**
 * 统一检索服务类
 */
export class RetrievalService {
  /**
   * 检索知识库 - 根据 active_provider 路由到对应引擎
   */
  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievalResponse> {
    try {
      const provider = await getActiveProvider();
      
      if (provider === 'ima') {
        return this.retrieveViaIMA(query, options);
      }
      
      if (provider === 'coze') {
        return retrieveFromCoze(query, options);
      }
      
      return this.retrieveViaBailian(query, options);
    } catch (error) {
      console.error('[RetrievalService] 检索失败:', error);
      return {
        success: false,
        documents: [],
        error: error instanceof Error ? error.message : '检索服务异常',
      };
    }
  }

  /**
   * 通过百炼引擎检索
   */
  private async retrieveViaBailian(query: string, options: RetrievalOptions): Promise<RetrievalResponse> {
    const service = await getBailianKnowledgeService();
    
    const result = await service.retrieve({
      query,
      knowledgeBaseIds: options.knowledgeBaseIds,
      topK: options.topK ?? 5,
      rerankMinScore: options.minScore,
      tags: options.tags,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        documents: [],
        error: result.message || '检索失败',
        requestId: result.requestId,
      };
    }

    // 转换为统一格式
    const documents: RetrievedDocument[] = result.data.map((item: RetrievalResult) => ({
      id: item.documentId,
      content: item.content,
      documentName: item.documentName,
      score: item.score,
      pageNumber: item.pageNumber,
      metadata: item.metadata,
    }));

    return {
      success: true,
      documents,
      requestId: result.requestId,
    };
  }

  /**
   * 通过 IMA 引擎检索
   */
  private async retrieveViaIMA(query: string, options: RetrievalOptions): Promise<RetrievalResponse> {
    return retrieveFromIMA(query, options);
  }

  /**
   * 连续对话检索 - 根据 active_provider 路由到对应引擎
   */
  async retrieveWithContext(
    query: string,
    options: ContextualRetrievalOptions
  ): Promise<RetrievalResponse> {
    try {
      const provider = await getActiveProvider();
      
      if (provider === 'ima') {
        return retrieveFromIMA(query, options);
      }
      
      if (provider === 'coze') {
        return retrieveFromCoze(query, options);
      }
      
      return this.retrieveWithContextViaBailian(query, options);
    } catch (error) {
      console.error('[RetrievalService] 连续对话检索失败:', error);
      return {
        success: false,
        documents: [],
        error: error instanceof Error ? error.message : '检索服务异常',
      };
    }
  }

  /**
   * 通过百炼引擎进行连续对话检索
   */
  private async retrieveWithContextViaBailian(
    query: string,
    options: ContextualRetrievalOptions
  ): Promise<RetrievalResponse> {
    const service = await getBailianKnowledgeService();
    
    const result = await service.retrieveWithContext(
      query,
      options.knowledgeBaseIds,
      options.conversationHistory,
      options.topK ?? 5
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        documents: [],
        error: result.message || '检索失败',
        requestId: result.requestId,
      };
    }

    // 转换为统一格式
    const documents: RetrievedDocument[] = result.data.map((item: RetrievalResult) => ({
      id: item.documentId,
      content: item.content,
      documentName: item.documentName,
      score: item.score,
      pageNumber: item.pageNumber,
      metadata: item.metadata,
    }));

    return {
      success: true,
      documents,
      requestId: result.requestId,
    };
  }

  /**
   * 获取相关上下文（用于LLM提示）
   */
  async getRelevantContext(
    query: string,
    knowledgeBaseIds: string[],
    maxTokens: number = 2000
  ): Promise<string> {
    const result = await this.retrieve(query, {
      knowledgeBaseIds,
      topK: 10,
    });

    if (!result.success || result.documents.length === 0) {
      return '';
    }

    let context = '';
    let tokenCount = 0;

    for (const doc of result.documents) {
      const chunk = `\n【文档来源: ${doc.documentName}】\n${doc.content}\n`;
      const chunkTokens = chunk.length / 2; // 简单估算

      if (tokenCount + chunkTokens > maxTokens) {
        break;
      }

      context += chunk;
      tokenCount += chunkTokens;
    }

    return context;
  }

  /**
   * 批量检索多个查询
   */
  async batchRetrieve(
    queries: string[],
    options: RetrievalOptions
  ): Promise<Map<string, RetrievedDocument[]>> {
    const results = new Map<string, RetrievedDocument[]>();

    // 并行执行所有查询
    const promises = queries.map(async (query) => {
      const result = await this.retrieve(query, options);
      results.set(query, result.documents);
    });

    await Promise.all(promises);
    return results;
  }
}

/**
 * 创建检索服务实例
 */
export function createRetrievalService(): RetrievalService {
  return new RetrievalService();
}

// 单例实例
let instance: RetrievalService | null = null;

/**
 * 获取检索服务单例
 */
export function getRetrievalService(): RetrievalService {
  if (!instance) {
    instance = new RetrievalService();
  }
  return instance;
}
