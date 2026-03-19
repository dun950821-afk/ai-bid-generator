/**
 * RAG检索服务
 * 支持语义检索、关键词检索、混合检索
 * 优化：使用RRF算法替换线性加权
 * 修复：实现真正的向量检索
 */

import { EmbeddingClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 检索配置
 */
export interface RetrievalConfig {
  topK: number;                    // 返回结果数量
  minScore: number;                // 最小相似度阈值
  useKeywordSearch: boolean;       // 是否使用关键词检索
  useSemanticSearch: boolean;      // 是否使用语义检索
  /** @deprecated 使用 RRF 算法后不再需要此参数 */
  keywordWeight?: number;          // 关键词检索权重（已弃用）
  rrfK?: number;                   // RRF算法常数k（默认60）
  candidateCount?: number;         // 每个检索方式的候选数量（默认20）
  documentIds?: string[];          // 限定检索的文档ID列表（用于标签过滤）
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  chunkId: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  score: number;
  metadata?: {
    documentName?: string;
    pageNumber?: number;
    chunkIndex?: number;
    semanticRank?: number;         // 语义检索排名
    keywordRank?: number;          // 关键词检索排名
    semanticScore?: number;        // 原始语义分数
    keywordScore?: number;         // 原始关键词分数
  };
}

/**
 * RAG检索服务类
 */
export class RAGRetrievalService {
  private client: EmbeddingClient;
  private defaultConfig: RetrievalConfig = {
    topK: 5,
    minScore: 0.5,
    useKeywordSearch: true,
    useSemanticSearch: true,
    rrfK: 60,
    candidateCount: 20,
  };

  constructor() {
    this.client = new EmbeddingClient();
  }

  /**
   * 语义检索（使用真正的向量检索）
   */
  async semanticSearch(
    query: string,
    knowledgeBaseId: string,
    config?: Partial<RetrievalConfig>
  ): Promise<RetrievalResult[]> {
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      // 1. 生成查询向量
      const queryEmbedding = await this.client.embedText(query);

      if (!queryEmbedding || queryEmbedding.length === 0) {
        console.error('生成查询向量失败');
        return [];
      }

      // 2. 使用数据库函数执行向量检索
      const supabaseClient = getSupabaseClient();
      
      // 如果有文档ID过滤，使用带过滤的查询
      if (finalConfig.documentIds && finalConfig.documentIds.length > 0) {
        const { data: results, error } = await supabaseClient.rpc('match_documents_with_filter', {
          query_embedding: queryEmbedding,
          match_threshold: finalConfig.minScore,
          match_count: finalConfig.topK,
          filter_knowledge_base_id: knowledgeBaseId,
          filter_document_ids: finalConfig.documentIds,
        });

        if (error) {
          console.error('向量检索失败（带过滤）:', error);
          // 降级到文本相似度检索
          return this.fallbackTextSearch(query, knowledgeBaseId, finalConfig);
        }

        if (!results || results.length === 0) {
          return [];
        }

        return results.map((row: any) => ({
          chunkId: row.id,
          documentId: row.document_id,
          knowledgeBaseId: row.knowledge_base_id,
          content: row.content,
          score: row.similarity,
          metadata: {
            chunkIndex: row.chunk_index,
          },
        }));
      }

      // 无文档过滤的原始逻辑
      const { data: results, error } = await supabaseClient.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: finalConfig.minScore,
        match_count: finalConfig.topK,
        filter_knowledge_base_id: knowledgeBaseId,
      });

      if (error) {
        console.error('向量检索失败:', error);
        // 降级到文本相似度检索
        return this.fallbackTextSearch(query, knowledgeBaseId, finalConfig);
      }

      if (!results || results.length === 0) {
        return [];
      }

      // 3. 转换结果格式
      return results.map((row: any) => ({
        chunkId: row.id,
        documentId: row.document_id,
        knowledgeBaseId: row.knowledge_base_id,
        content: row.content,
        score: row.similarity,
        metadata: {
          chunkIndex: row.chunk_index,
        },
      }));
    } catch (error) {
      console.error('语义检索失败:', error);
      // 降级到文本相似度检索
      return this.fallbackTextSearch(query, knowledgeBaseId, finalConfig);
    }
  }

  /**
   * 降级文本检索（当向量检索失败时）
   */
  private async fallbackTextSearch(
    query: string,
    knowledgeBaseId: string,
    config: RetrievalConfig
  ): Promise<RetrievalResult[]> {
    console.warn('降级到文本相似度检索');

    const supabaseClient = getSupabaseClient();
    
    let query_builder = supabaseClient
      .from('document_chunks')
      .select('id, document_id, knowledge_base_id, content, chunk_index')
      .eq('knowledge_base_id', knowledgeBaseId);

    // 如果有文档ID过滤
    if (config.documentIds && config.documentIds.length > 0) {
      query_builder = query_builder.in('document_id', config.documentIds);
    }

    const { data: chunks, error } = await query_builder.limit(1000); // 限制数量，避免全表扫描

    if (error || !chunks) {
      console.error('获取知识库分块失败:', error);
      return [];
    }

    const results: RetrievalResult[] = [];

    for (const chunk of chunks) {
      const score = this.calculateTextSimilarity(query, chunk.content);

      if (score >= config.minScore) {
        results.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          knowledgeBaseId: chunk.knowledge_base_id,
          content: chunk.content,
          score,
          metadata: {
            chunkIndex: chunk.chunk_index,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, config.topK);
  }

  /**
   * 关键词检索
   */
  async keywordSearch(
    query: string,
    knowledgeBaseId: string,
    config?: Partial<RetrievalConfig>
  ): Promise<RetrievalResult[]> {
    const finalConfig = { ...this.defaultConfig, ...config };

    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) {
      return [];
    }

    const supabaseClient = getSupabaseClient();
    
    // 使用 PostgreSQL 的全文检索功能
    let query_builder = supabaseClient
      .from('document_chunks')
      .select('id, document_id, knowledge_base_id, content, chunk_index')
      .eq('knowledge_base_id', knowledgeBaseId)
      .textSearch('content', keywords.join(' | '), {
        type: 'websearch',
        config: 'simple',
      });

    // 如果有文档ID过滤
    if (finalConfig.documentIds && finalConfig.documentIds.length > 0) {
      query_builder = query_builder.in('document_id', finalConfig.documentIds);
    }

    const { data: chunks, error } = await query_builder.limit(finalConfig.topK * 2); // 获取更多候选结果

    if (error || !chunks) {
      console.error('关键词检索失败:', error);
      // 降级到简单匹配
      return this.fallbackKeywordSearch(query, knowledgeBaseId, finalConfig);
    }

    const results: RetrievalResult[] = [];

    for (const chunk of chunks) {
      const score = this.calculateKeywordScore(keywords, chunk.content);

      if (score > 0) {
        results.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          knowledgeBaseId: chunk.knowledge_base_id,
          content: chunk.content,
          score,
          metadata: {
            chunkIndex: chunk.chunk_index,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, finalConfig.topK);
  }

  /**
   * 降级关键词检索
   */
  private async fallbackKeywordSearch(
    query: string,
    knowledgeBaseId: string,
    config: RetrievalConfig
  ): Promise<RetrievalResult[]> {
    console.warn('降级到简单关键词检索');

    const keywords = this.extractKeywords(query);
    const supabaseClient = getSupabaseClient();
    
    let query_builder = supabaseClient
      .from('document_chunks')
      .select('id, document_id, knowledge_base_id, content, chunk_index')
      .eq('knowledge_base_id', knowledgeBaseId);

    // 如果有文档ID过滤
    if (config.documentIds && config.documentIds.length > 0) {
      query_builder = query_builder.in('document_id', config.documentIds);
    }

    const { data: chunks, error } = await query_builder.limit(1000); // 限制数量

    if (error || !chunks) {
      console.error('获取知识库分块失败:', error);
      return [];
    }

    const results: RetrievalResult[] = [];

    for (const chunk of chunks) {
      const score = this.calculateKeywordScore(keywords, chunk.content);

      if (score > 0) {
        results.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          knowledgeBaseId: chunk.knowledge_base_id,
          content: chunk.content,
          score,
          metadata: {
            chunkIndex: chunk.chunk_index,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, config.topK);
  }

  /**
   * 混合检索（语义 + 关键词）
   * 优化：使用RRF（Reciprocal Rank Fusion）算法
   */
  async hybridSearch(
    query: string,
    knowledgeBaseId: string,
    config?: Partial<RetrievalConfig>
  ): Promise<RetrievalResult[]> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const k = finalConfig.rrfK || 60;
    const candidateCount = finalConfig.candidateCount || 20;

    // 并行执行语义检索和关键词检索，各获取 Top candidateCount 结果
    const [semanticResults, keywordResults] = await Promise.all([
      finalConfig.useSemanticSearch
        ? this.semanticSearch(query, knowledgeBaseId, { topK: candidateCount })
        : Promise.resolve([]),
      finalConfig.useKeywordSearch
        ? this.keywordSearch(query, knowledgeBaseId, { topK: candidateCount })
        : Promise.resolve([]),
    ]);

    // 使用RRF算法融合结果
    const rrfScores = new Map<string, {
      result: RetrievalResult;
      semanticRank?: number;
      keywordRank?: number;
      semanticScore?: number;
      keywordScore?: number;
      rrfScore: number;
    }>();

    // 处理语义检索结果
    semanticResults.forEach((result, index) => {
      const rank = index + 1; // 排名从1开始
      const rrfScore = 1 / (k + rank);
      
      rrfScores.set(result.chunkId, {
        result,
        semanticRank: rank,
        semanticScore: result.score,
        rrfScore,
      });
    });

    // 处理关键词检索结果
    keywordResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      
      const existing = rrfScores.get(result.chunkId);
      if (existing) {
        // 如果chunk在两个结果集中都存在，累加RRF分数
        existing.keywordRank = rank;
        existing.keywordScore = result.score;
        existing.rrfScore += rrfScore;
      } else {
        // 如果chunk只在关键词结果集中
        rrfScores.set(result.chunkId, {
          result,
          keywordRank: rank,
          keywordScore: result.score,
          rrfScore,
        });
      }
    });

    // 按RRF总分排序
    const sortedResults = Array.from(rrfScores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore);

    // 截取前topK个结果，规范化输出格式
    const finalResults: RetrievalResult[] = sortedResults
      .slice(0, finalConfig.topK)
      .map(item => ({
        chunkId: item.result.chunkId,
        documentId: item.result.documentId,
        knowledgeBaseId: item.result.knowledgeBaseId,
        content: item.result.content,
        score: item.rrfScore, // 使用RRF分数作为最终分数
        metadata: {
          ...item.result.metadata,
          semanticRank: item.semanticRank,
          keywordRank: item.keywordRank,
          semanticScore: item.semanticScore,
          keywordScore: item.keywordScore,
        },
      }));

    return finalResults;
  }

  /**
   * 多知识库检索
   */
  async searchAcrossKnowledgeBases(
    query: string,
    knowledgeBaseIds: string[],
    config?: Partial<RetrievalConfig>
  ): Promise<RetrievalResult[]> {
    const allResults: RetrievalResult[] = [];

    for (const kbId of knowledgeBaseIds) {
      const results = await this.hybridSearch(query, kbId, config);
      allResults.push(...results);
    }

    allResults.sort((a, b) => b.score - a.score);

    const finalConfig = { ...this.defaultConfig, ...config };
    return allResults.slice(0, finalConfig.topK);
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      '的', '了', '和', '是', '在', '有', '我', '他', '她', '它',
      '们', '这', '那', '就', '也', '都', '而', '及', '与', '或',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word));

    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 计算关键词匹配分数
   */
  private calculateKeywordScore(keywords: string[], content: string): number {
    const contentLower = content.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length / keywords.length;
      }
    }

    return Math.min(score, 1);
  }

  /**
   * 计算文本相似度（简化版，用于降级）
   */
  private calculateTextSimilarity(query: string, content: string): number {
    const queryWords = new Set(
      query.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, ' ').split(/\s+/)
    );
    const contentWords = new Set(
      content.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, ' ').split(/\s+/)
    );

    let intersection = 0;
    for (const word of queryWords) {
      if (contentWords.has(word)) {
        intersection++;
      }
    }

    const union = new Set([...queryWords, ...contentWords]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * 获取相关上下文（用于LLM提示）
   */
  async getRelevantContext(
    query: string,
    knowledgeBaseId: string,
    maxTokens: number = 2000
  ): Promise<string> {
    const results = await this.hybridSearch(query, knowledgeBaseId, { topK: 10 });

    let context = '';
    let tokenCount = 0;

    for (const result of results) {
      const chunk = `\n【文档片段】\n${result.content}\n`;
      const chunkTokens = chunk.length / 2;

      if (tokenCount + chunkTokens > maxTokens) {
        break;
      }

      context += chunk;
      tokenCount += chunkTokens;
    }

    return context;
  }
}

/**
 * 创建RAG检索服务实例
 */
export function createRAGRetrievalService(): RAGRetrievalService {
  return new RAGRetrievalService();
}
