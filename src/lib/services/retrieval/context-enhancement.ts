/**
 * 上下文增强服务
 * @description 为检索结果补充元数据、分配引用ID、格式化上下文
 */

import {
  EnhancedChunk,
  EnhancedChunkWithContext,
  EnhancedContextResult,
  ContextEnhancementOptions,
  QueryPlan,
} from './types';

/**
 * 上下文增强服务
 * 目标: 为每个片段补充完整上下文，便于LLM引用
 */
export class ContextEnhancementService {
  /**
   * 增强上下文
   * @param chunks 原始检索结果
   * @param queryPlan 查询计划（用于分组）
   * @param options 增强选项
   * @returns 增强后的上下文结果
   */
  async enhanceContext(
    chunks: EnhancedChunk[],
    queryPlan?: QueryPlan,
    options: ContextEnhancementOptions = {}
  ): Promise<EnhancedContextResult> {
    const {
      includeMetadata = true,
      includeImages = true,
    } = options;

    const enhancedChunks: EnhancedChunkWithContext[] = [];

    for (const chunk of chunks) {
      const enhanced: EnhancedChunkWithContext = {
        ...chunk,
        // 原始内容
        originalContent: chunk.content,
        // 增强内容（可扩展）
        enhancedContent: this.enhanceContent(chunk),
        // 元数据
        metadata: includeMetadata ? {
          documentName: chunk.documentName,
          documentId: chunk.documentId,
          pageNumber: chunk.pageNumber,
          hierTitle: chunk.hierTitle,
          chunkId: chunk.chunkId,
        } : {
          documentName: chunk.documentName,
          documentId: chunk.documentId,
        },
        // 引用ID（稍后分配）
        citationId: '',
      };

      // 处理图片（如果有）
      if (includeImages && chunk.metadata?.imageUrl) {
        enhanced.hasImages = true;
        enhanced.imageUrls = Array.isArray(chunk.metadata.imageUrl)
          ? chunk.metadata.imageUrl
          : [chunk.metadata.imageUrl];
      }

      enhancedChunks.push(enhanced);
    }

    // 生成分组引用ID
    this.assignCitationIds(enhancedChunks, queryPlan);

    // 计算Token数
    const totalTokens = this.estimateTokens(enhancedChunks);

    // 格式化上下文
    const formattedContext = this.formatContext(enhancedChunks, queryPlan);

    return {
      chunks: enhancedChunks,
      totalTokens,
      formatteContext: formattedContext,
    };
  }

  /**
   * 增强内容
   */
  private enhanceContent(chunk: EnhancedChunk): string {
    let content = chunk.content;

    // 如果有层级标题，添加上下文信息
    if (chunk.hierTitle) {
      content = `【章节: ${chunk.hierTitle}】\n${content}`;
    }

    // 如果有图片，添加图片说明
    if (chunk.metadata?.imageUrl) {
      const imageCount = Array.isArray(chunk.metadata.imageUrl)
        ? chunk.metadata.imageUrl.length
        : 1;
      content += `\n\n[包含${imageCount}张相关图片]`;
    }

    return content;
  }

  /**
   * 分配引用ID
   * 格式: [S{评分项序号}-{片段序号}] 或 [G{序号}] 或 [R{序号}]
   */
  private assignCitationIds(
    chunks: EnhancedChunkWithContext[],
    queryPlan?: QueryPlan
  ): void {
    // 统计各评分项的序号
    const scoringItemIndex = new Map<string, number>();
    let generalIndex = 0;
    let riskIndex = 0;
    let regulationIndex = 0;

    // 如果有查询计划，建立评分项ID到序号的映射
    const scoringItemIdToIndex = new Map<string, number>();
    if (queryPlan) {
      let idx = 1;
      for (const q of queryPlan.queries) {
        if (q.scoringItemId && !scoringItemIdToIndex.has(q.scoringItemId)) {
          scoringItemIdToIndex.set(q.scoringItemId, idx++);
        }
      }
    }

    for (const chunk of chunks) {
      // 优先按评分项分配
      if (chunk.scoringItemIds.length > 0) {
        const scoringItemId = chunk.scoringItemIds[0];
        const itemIndex = scoringItemIdToIndex.get(scoringItemId);
        
        if (itemIndex !== undefined) {
          const chunkIndex = (scoringItemIndex.get(scoringItemId) || 0) + 1;
          scoringItemIndex.set(scoringItemId, chunkIndex);
          chunk.citationId = `[S${itemIndex}-${chunkIndex}]`;
          continue;
        }
      }

      // 按查询类型分配
      if (chunk.queryTypes.includes('risk')) {
        chunk.citationId = `[R${++riskIndex}]`;
      } else if (chunk.queryTypes.includes('regulation')) {
        chunk.citationId = `[L${++regulationIndex}]`;
      } else {
        chunk.citationId = `[G${++generalIndex}]`;
      }
    }
  }

  /**
   * 格式化上下文
   */
  private formatContext(
    chunks: EnhancedChunkWithContext[],
    queryPlan?: QueryPlan
  ): string {
    // 按分组组织
    const grouped = this.groupChunksForFormat(chunks, queryPlan);

    const sections: string[] = [];
    let sectionIndex = 0;

    // 评分项相关资料
    for (const [groupId, groupChunks] of grouped) {
      if (groupChunks.length === 0) continue;

      // 确定分组标题
      let header: string;
      if (groupId.startsWith('scoring_')) {
        const idx = groupId.replace('scoring_', '');
        header = `### 评分项 ${idx} 相关资料`;
      } else if (groupId === 'risk') {
        header = '### 风险规避参考资料';
      } else if (groupId === 'regulation') {
        header = '### 相关法规标准';
      } else {
        header = '### 通用参考资料';
      }

      const items = groupChunks.map((chunk) => {
        const source = chunk.metadata.documentName;
        const page = chunk.metadata.pageNumber ? ` P${chunk.metadata.pageNumber}` : '';
        const hier = chunk.metadata.hierTitle ? ` (${chunk.metadata.hierTitle})` : '';
        const score = ` 相关度:${(chunk.maxScore * 100).toFixed(0)}%`;

        return `${chunk.citationId} **${source}${page}${hier}**${score}\n\n${chunk.enhancedContent}`;
      }).join('\n\n---\n\n');

      sections.push(`${header}\n\n${items}`);
      sectionIndex++;
    }

    // 添加分隔和统计
    const stats = `\n\n---\n\n**资料统计**: 共${chunks.length}条参考资料，约${this.estimateTokens(chunks).toLocaleString()} tokens`;

    return sections.join('\n\n---\n\n') + stats;
  }

  /**
   * 分组chunks用于格式化
   */
  private groupChunksForFormat(
    chunks: EnhancedChunkWithContext[],
    queryPlan?: QueryPlan
  ): Map<string, EnhancedChunkWithContext[]> {
    const groups = new Map<string, EnhancedChunkWithContext[]>();

    // 初始化评分项分组
    if (queryPlan) {
      for (const q of queryPlan.queries) {
        if (q.scoringItemId) {
          const idx = queryPlan.queries.filter(
            (qq, i) => qq.scoringItemId && i <= queryPlan.queries.indexOf(q)
          ).length;
          const key = `scoring_${idx}`;
          if (!groups.has(key)) {
            groups.set(key, []);
          }
        }
      }
    }

    // 添加特殊分组
    groups.set('general', []);
    groups.set('risk', []);
    groups.set('regulation', []);

    // 建立评分项ID到分组键的映射
    const scoringItemIdToKey = new Map<string, string>();
    if (queryPlan) {
      let idx = 1;
      for (const q of queryPlan.queries) {
        if (q.scoringItemId && !scoringItemIdToKey.has(q.scoringItemId)) {
          scoringItemIdToKey.set(q.scoringItemId, `scoring_${idx}`);
          idx++;
        }
      }
    }

    // 分配chunks
    for (const chunk of chunks) {
      if (chunk.scoringItemIds.length > 0) {
        const key = scoringItemIdToKey.get(chunk.scoringItemIds[0]);
        if (key && groups.has(key)) {
          groups.get(key)!.push(chunk);
          continue;
        }
      }

      if (chunk.queryTypes.includes('risk')) {
        groups.get('risk')!.push(chunk);
      } else if (chunk.queryTypes.includes('regulation')) {
        groups.get('regulation')!.push(chunk);
      } else {
        groups.get('general')!.push(chunk);
      }
    }

    return groups;
  }

  /**
   * 估算Token数
   * 中文约 1.5 字符/token，英文约 4 字符/token
   */
  private estimateTokens(chunks: EnhancedChunkWithContext[]): number {
    const totalChars = chunks.reduce(
      (sum, c) => sum + c.enhancedContent.length,
      0
    );
    // 保守估计，混合中英文
    return Math.ceil(totalChars / 1.5);
  }

  /**
   * 生成引用表
   */
  generateCitationTable(chunks: EnhancedChunkWithContext[]): string {
    const lines = ['| 引用ID | 来源文档 | 页码 | 相关度 |', '|--------|----------|------|--------|'];

    for (const chunk of chunks) {
      const page = chunk.metadata.pageNumber || '-';
      const score = `${(chunk.maxScore * 100).toFixed(0)}%`;
      lines.push(`| ${chunk.citationId} | ${chunk.metadata.documentName} | ${page} | ${score} |`);
    }

    return lines.join('\n');
  }
}

/**
 * 创建上下文增强服务实例
 */
export function createContextEnhancementService(): ContextEnhancementService {
  return new ContextEnhancementService();
}
