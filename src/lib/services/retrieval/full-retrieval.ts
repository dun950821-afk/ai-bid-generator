/**
 * 全量检索服务
 * @description 执行多查询并行检索，RRF融合，多样性去重
 * 根据 active_provider 配置路由到百炼、IMA 或扣子知识库引擎
 */

import { getBailianKnowledgeService } from '@/lib/bailian/service';
import type { RetrievalResult } from '@/lib/bailian/types';
import { getActiveProvider, type KnowledgeProvider } from './provider';
import { retrieveFromIMA } from './ima-provider';
import { retrieveFromCoze } from './coze-provider';
import {
  QueryPlan,
  QueryItem,
  EnhancedChunk,
  SourceQuery,
  RetrievalQueryResult,
  FullRetrievalResult,
  DEFAULT_RETRIEVAL_CONFIG,
} from './types';

/**
 * 全量检索服务
 * 目标: 最大程度召回相关内容
 */
export class FullRetrievalService {
  private config: typeof DEFAULT_RETRIEVAL_CONFIG;

  constructor(config?: Partial<typeof DEFAULT_RETRIEVAL_CONFIG>) {
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  }

  /**
   * 执行全量检索
   * @param queryPlan 查询计划
   * @param knowledgeBaseIds 知识库ID列表
   * @returns 全量检索结果
   */
  async executeFullRetrieval(
    queryPlan: QueryPlan,
    knowledgeBaseIds: string[]
  ): Promise<FullRetrievalResult> {
    console.log(`[FullRetrieval] 开始执行 ${queryPlan.totalQueries} 个查询...`);
    const startTime = Date.now();

    // ===== Phase 1: 并行执行所有查询 =====
    const retrievalPromises = queryPlan.queries.map((q) =>
      this.executeSingleQuery(q, knowledgeBaseIds)
    );

    const allRetrievalResults = await Promise.all(retrievalPromises);

    // ===== Phase 2: RRF融合 =====
    const fusedChunks = this.reciprocalRankFusion(allRetrievalResults);
    console.log(`[FullRetrieval] RRF融合: ${this.countRawResults(allRetrievalResults)} → ${fusedChunks.length}条`);

    // ===== Phase 3: 多样性去重 =====
    const deduplicatedChunks = this.diversityDeduplication(fusedChunks);
    console.log(`[FullRetrieval] 多样性去重: ${fusedChunks.length} → ${deduplicatedChunks.length}条`);

    // ===== Phase 4: 按评分项分组 =====
    const groupedChunks = this.groupByScoringItem(deduplicatedChunks, queryPlan);

    const elapsed = Date.now() - startTime;
    console.log(`[FullRetrieval] 完成，耗时 ${elapsed}ms，最终 ${deduplicatedChunks.length} 条结果`);

    return {
      totalQueries: queryPlan.totalQueries,
      rawResultCount: this.countRawResults(allRetrievalResults),
      fusedResultCount: fusedChunks.length,
      finalResultCount: deduplicatedChunks.length,
      groupedChunks,
      allChunks: deduplicatedChunks,
    };
  }

  /**
   * 执行单个查询 - 根据 active_provider 路由
   */
  private async executeSingleQuery(
    query: QueryItem,
    knowledgeBaseIds: string[]
  ): Promise<RetrievalQueryResult> {
    try {
      const provider = await getActiveProvider();
      
      if (provider === 'ima') {
        return this.executeSingleQueryViaIMA(query, knowledgeBaseIds);
      }
      
      if (provider === 'coze') {
        return this.executeSingleQueryViaCoze(query, knowledgeBaseIds);
      }
      
      return this.executeSingleQueryViaBailian(query, knowledgeBaseIds);
    } catch (error) {
      console.error(`[FullRetrieval] 查询 ${query.id} 失败:`, error);
      return {
        queryId: query.id,
        queryPurpose: query.purpose,
        queryType: query.type,
        scoringItemId: query.scoringItemId,
        weight: query.weight,
        results: [],
      };
    }
  }

  /**
   * 通过百炼引擎执行单个查询
   */
  private async executeSingleQueryViaBailian(
    query: QueryItem,
    knowledgeBaseIds: string[]
  ): Promise<RetrievalQueryResult> {
    try {
      const service = await getBailianKnowledgeService();

      const result = await service.retrieve({
        query: query.query,
        knowledgeBaseIds,

        // 百炼API参数 - 全量检索模式
        denseSimilarityTopK: this.config.denseSimilarityTopK,
        sparseSimilarityTopK: this.config.sparseSimilarityTopK,
        enableReranking: this.config.enableReranking,
        rerankMinScore: this.config.rerankMinScore,
      });

      if (!result.success || !result.data) {
        return {
          queryId: query.id,
          queryPurpose: query.purpose,
          queryType: query.type,
          scoringItemId: query.scoringItemId,
          weight: query.weight,
          results: [],
        };
      }

      return {
        queryId: query.id,
        queryPurpose: query.purpose,
        queryType: query.type,
        scoringItemId: query.scoringItemId,
        weight: query.weight,
        results: result.data.map((item) => ({
          content: item.content,
          documentId: item.documentId,
          documentName: item.documentName,
          score: item.score,
          pageNumber: item.pageNumber,
          hierTitle: item.hierTitle,
          chunkId: item.chunkId,
          metadata: item.metadata,
          rrfScore: 0,
          maxScore: item.score,
          sourceQueries: [],
          scoringItemIds: query.scoringItemId ? [query.scoringItemId] : [],
          queryTypes: [query.type],
        })),
      };
    } catch (error) {
      console.error(`[FullRetrieval] 百炼查询 ${query.id} 失败:`, error);
      return {
        queryId: query.id,
        queryPurpose: query.purpose,
        queryType: query.type,
        scoringItemId: query.scoringItemId,
        weight: query.weight,
        results: [],
      };
    }
  }

  /**
   * 通过 IMA 引擎执行单个查询
   */
  private async executeSingleQueryViaIMA(
    query: QueryItem,
    knowledgeBaseIds: string[]
  ): Promise<RetrievalQueryResult> {
    try {
      const result = await retrieveFromIMA(query.query, {
        knowledgeBaseIds,
        topK: this.config.denseSimilarityTopK + this.config.sparseSimilarityTopK,
      });

      if (!result.success || result.documents.length === 0) {
        return {
          queryId: query.id,
          queryPurpose: query.purpose,
          queryType: query.type,
          scoringItemId: query.scoringItemId,
          weight: query.weight,
          results: [],
        };
      }

      return {
        queryId: query.id,
        queryPurpose: query.purpose,
        queryType: query.type,
        scoringItemId: query.scoringItemId,
        weight: query.weight,
        results: result.documents.map((doc) => ({
          content: doc.content,
          documentId: doc.id,
          documentName: doc.documentName,
          score: doc.score,
          pageNumber: doc.pageNumber,
          chunkId: doc.metadata?.chunkId || '',
          metadata: doc.metadata,
          rrfScore: 0,
          maxScore: doc.score,
          sourceQueries: [],
          scoringItemIds: query.scoringItemId ? [query.scoringItemId] : [],
          queryTypes: [query.type],
        })),
      };
    } catch (error) {
      console.error(`[FullRetrieval] IMA查询 ${query.id} 失败:`, error);
      return {
        queryId: query.id,
        queryPurpose: query.purpose,
        queryType: query.type,
        scoringItemId: query.scoringItemId,
        weight: query.weight,
        results: [],
      };
    }
  }

  /**
   * 通过扣子知识库执行单个查询
   */
  private async executeSingleQueryViaCoze(
    query: QueryItem,
    _knowledgeBaseIds: string[]
  ): Promise<RetrievalQueryResult> {
    try {
      const response = await retrieveFromCoze(query.query, {
        knowledgeBaseIds: [],
        topK: 10,
        minScore: 0.3,
      });

      const results: EnhancedChunk[] = (response.documents || []).map((doc) => ({
        documentId: doc.id,
        documentName: doc.documentName,
        content: doc.content,
        score: doc.score,
        pageNumber: doc.pageNumber || 0,
        metadata: doc.metadata,
        rrfScore: 0,
        maxScore: doc.score,
        sourceQueries: [],
        scoringItemIds: query.scoringItemId ? [query.scoringItemId] : [],
        queryTypes: [query.type],
      }));

      return {
        queryId: query.id,
        queryPurpose: query.purpose,
        queryType: query.type,
        scoringItemId: query.scoringItemId,
        weight: query.weight,
        results,
      };
    } catch (error) {
      console.error(`[FullRetrieval] Coze知识库查询 ${query.id} 失败:`, error);
      return {
        queryId: query.id,
        queryPurpose: query.purpose,
        queryType: query.type,
        scoringItemId: query.scoringItemId,
        weight: query.weight,
        results: [],
      };
    }
  }

  /**
   * 统计原始结果数量
   */
  private countRawResults(results: RetrievalQueryResult[]): number {
    return results.reduce((sum, r) => sum + r.results.length, 0);
  }

  /**
   * RRF融合 (Reciprocal Rank Fusion)
   * @param results 所有查询结果
   * @param k RRF参数，默认60
   * @returns 融合后的结果
   */
  private reciprocalRankFusion(
    results: RetrievalQueryResult[],
    k: number = 60
  ): EnhancedChunk[] {
    const chunkMap = new Map<string, EnhancedChunk>();

    for (const queryResult of results) {
      queryResult.results.forEach((chunk, rank) => {
        // 使用文档ID+内容前100字符作为唯一键
        const key = `${chunk.documentId}:${this.getContentKey(chunk.content)}`;
        const rrfScore = 1 / (k + rank + 1);

        if (chunkMap.has(key)) {
          const existing = chunkMap.get(key)!;
          // 累加RRF分数
          existing.rrfScore += rrfScore;
          // 添加来源查询
          existing.sourceQueries.push({
            queryId: queryResult.queryId,
            purpose: queryResult.queryPurpose,
            rank,
            score: chunk.score,
          });
          // 保留最高分
          if (chunk.score > existing.maxScore) {
            existing.maxScore = chunk.score;
          }
          // 合并评分项ID
          if (queryResult.scoringItemId && !existing.scoringItemIds.includes(queryResult.scoringItemId)) {
            existing.scoringItemIds.push(queryResult.scoringItemId);
          }
          // 合并查询类型
          if (!existing.queryTypes.includes(queryResult.queryType)) {
            existing.queryTypes.push(queryResult.queryType);
          }
        } else {
          chunkMap.set(key, {
            ...chunk,
            rrfScore,
            maxScore: chunk.score,
            sourceQueries: [{
              queryId: queryResult.queryId,
              purpose: queryResult.queryPurpose,
              rank,
              score: chunk.score,
            }],
            scoringItemIds: queryResult.scoringItemId ? [queryResult.scoringItemId] : [],
            queryTypes: [queryResult.queryType],
          });
        }
      });
    }

    // 按 RRF 分数排序
    return Array.from(chunkMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore);
  }

  /**
   * 获取内容键（用于去重）
   */
  private getContentKey(content: string): string {
    // 使用内容的前100字符作为键，避免长文本
    return content.substring(0, 100).replace(/\s+/g, ' ');
  }

  /**
   * 多样性去重
   * @param chunks 待去重的结果
   * @returns 去重后的结果
   */
  private diversityDeduplication(chunks: EnhancedChunk[]): EnhancedChunk[] {
    const result: EnhancedChunk[] = [];
    const documentCount = new Map<string, number>();
    const seenContentKeys = new Set<string>();

    for (const chunk of chunks) {
      // 检查是否达到上限
      if (result.length >= this.config.maxTotalChunks) {
        break;
      }

      // 同一文档保留的片段数限制
      const docId = chunk.documentId;
      const currentDocCount = documentCount.get(docId) || 0;
      if (currentDocCount >= this.config.maxChunksPerDocument) {
        continue;
      }

      // 内容去重（基于前200字符）
      const contentKey = chunk.content.substring(0, 200);
      if (seenContentKeys.has(contentKey)) {
        continue;
      }

      // 添加到结果
      seenContentKeys.add(contentKey);
      documentCount.set(docId, currentDocCount + 1);
      result.push(chunk);
    }

    return result;
  }

  /**
   * 按评分项分组
   */
  private groupByScoringItem(
    chunks: EnhancedChunk[],
    queryPlan: QueryPlan
  ): Map<string, EnhancedChunk[]> {
    const groups = new Map<string, EnhancedChunk[]>();

    // 初始化分组
    for (const q of queryPlan.queries) {
      if (q.scoringItemId && !groups.has(q.scoringItemId)) {
        groups.set(q.scoringItemId, []);
      }
    }
    // 添加特殊分组
    groups.set('general', []);    // 通用资料
    groups.set('risk', []);       // 风险规避
    groups.set('regulation', []); // 法规标准

    // 分配chunks到各组
    for (const chunk of chunks) {
      let assigned = false;

      // 优先按评分项ID分配
      if (chunk.scoringItemIds.length > 0) {
        for (const scoringItemId of chunk.scoringItemIds) {
          const group = groups.get(scoringItemId);
          if (group && group.length < 30) {
            group.push(chunk);
            assigned = true;
            break;
          }
        }
      }

      // 如果没有评分项ID，按查询类型分配
      if (!assigned) {
        for (const queryType of chunk.queryTypes) {
          if (queryType === 'risk') {
            groups.get('risk')?.push(chunk);
            assigned = true;
            break;
          } else if (queryType === 'regulation') {
            groups.get('regulation')?.push(chunk);
            assigned = true;
            break;
          }
        }
      }

      // 最后放入通用组
      if (!assigned) {
        groups.get('general')?.push(chunk);
      }
    }

    return groups;
  }

  /**
   * 获取检索统计信息
   */
  getRetrievalStats(result: FullRetrievalResult): string {
    const groupStats = Array.from(result.groupedChunks.entries())
      .map(([key, chunks]) => `${key}: ${chunks.length}条`)
      .join(', ');

    return `检索统计: ${result.totalQueries}个查询, ${result.rawResultCount}条原始结果 → ${result.finalResultCount}条最终结果 (${groupStats})`;
  }
}

/**
 * 创建全量检索服务实例
 */
export function createFullRetrievalService(
  config?: Partial<typeof DEFAULT_RETRIEVAL_CONFIG>
): FullRetrievalService {
  return new FullRetrievalService(config);
}
