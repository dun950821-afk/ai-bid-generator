/**
 * IMA 检索适配器
 * @description 将 IMA 知识库 API 适配为统一的 RetrievedDocument[] 格式
 */

import { searchKnowledgeBase } from '@/lib/services/ima-service';
import { getIMAProviderConfig } from './provider';
import type { RetrievedDocument, RetrievalResponse } from './index';

/**
 * IMA 检索适配器
 */
export class IMAProvider {
  /**
   * 通过 IMA 引擎检索知识库
   */
  async retrieve(query: string, options: {
    knowledgeBaseIds: string[];
    topK?: number;
    minScore?: number;
  }): Promise<RetrievalResponse> {
    try {
      const config = await getIMAProviderConfig();
      
      if (!config.apiKey) {
        return {
          success: false,
          documents: [],
          error: 'IMA API Key 未配置，请在设置中配置 IMA 知识库',
        };
      }

      // 确定使用的知识库ID
      const knowledgeBaseIds = options.knowledgeBaseIds.length > 0
        ? options.knowledgeBaseIds
        : (config.knowledgeBaseId ? [config.knowledgeBaseId] : []);

      if (knowledgeBaseIds.length === 0) {
        return {
          success: false,
          documents: [],
          error: '未指定 IMA 知识库ID，请在设置中配置或传入知识库ID',
        };
      }

      const topK = options.topK ?? 5;

      // 对每个知识库执行搜索
      const allDocuments: RetrievedDocument[] = [];
      
      for (const kbId of knowledgeBaseIds) {
        const result = await searchKnowledgeBase(kbId, query, config, topK);
        
        if (result.success && result.data) {
          const docs: RetrievedDocument[] = result.data.results.map((item) => ({
            id: item.doc_id,
            content: item.chunk_content,
            documentName: item.doc_name,
            score: item.score,
            metadata: {
              chunkId: item.chunk_id,
              position: item.position,
              provider: 'ima',
              knowledgeBaseId: kbId,
            },
          }));
          
          // 过滤低分结果
          const filtered = options.minScore
            ? docs.filter(doc => doc.score >= (options.minScore ?? 0))
            : docs;
          
          allDocuments.push(...filtered);
        }
      }

      // 按 score 降序排序，取 topK
      allDocuments.sort((a, b) => b.score - a.score);
      const finalDocs = allDocuments.slice(0, topK);

      return {
        success: true,
        documents: finalDocs,
      };
    } catch (error) {
      console.error('[IMAProvider] 检索失败:', error);
      return {
        success: false,
        documents: [],
        error: error instanceof Error ? error.message : 'IMA 检索服务异常',
      };
    }
  }

  /**
   * 连续对话检索（IMA 暂不支持上下文，降级为普通检索）
   */
  async retrieveWithContext(
    query: string,
    options: {
      knowledgeBaseIds: string[];
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      topK?: number;
    }
  ): Promise<RetrievalResponse> {
    // IMA 不支持对话上下文检索，降级为普通检索
    // 将最近的用户消息拼接到 query 中增强语义
    const recentUserMessages = options.conversationHistory
      .filter(msg => msg.role === 'user')
      .slice(-2)
      .map(msg => msg.content);
    
    const enhancedQuery = recentUserMessages.length > 1
      ? `${recentUserMessages.join(' ')} ${query}`
      : query;

    return this.retrieve(enhancedQuery, {
      knowledgeBaseIds: options.knowledgeBaseIds,
      topK: options.topK,
    });
  }
}

// 单例
let imaProviderInstance: IMAProvider | null = null;

export function getIMAProvider(): IMAProvider {
  if (!imaProviderInstance) {
    imaProviderInstance = new IMAProvider();
  }
  return imaProviderInstance;
}
