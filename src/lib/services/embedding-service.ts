/**
 * 向量化服务
 * 使用 Embedding API 将文本转换为向量表示
 */

import { EmbeddingClient, HeaderUtils } from 'coze-coding-dev-sdk';
import type { Headers } from 'next/dist/compiled/@edge-runtime/primitives';

export interface EmbeddingOptions {
  dimensions?: number;  // 向量维度
  model?: string;       // 模型名称
}

export interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  error?: string;
}

export interface BatchEmbeddingResult {
  success: boolean;
  embeddings?: number[][];
  error?: string;
  processedCount: number;
}

const DEFAULT_OPTIONS: EmbeddingOptions = {
  dimensions: 1024,
  model: 'doubao-embedding-vision-251215',
};

/**
 * 向量化服务类
 */
export class EmbeddingService {
  private client: EmbeddingClient;
  private options: EmbeddingOptions;

  constructor(options: Partial<EmbeddingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.client = new EmbeddingClient();
  }

  /**
   * 单文本向量化
   */
  async embedText(text: string): Promise<EmbeddingResult> {
    try {
      if (!text || text.trim().length === 0) {
        return {
          success: false,
          error: '文本内容不能为空',
        };
      }

      const embedding = await this.client.embedText(text, {
        dimensions: this.options.dimensions,
      });

      return {
        success: true,
        embedding,
      };
    } catch (error) {
      console.error('文本向量化失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '向量化失败',
      };
    }
  }

  /**
   * 批量文本向量化
   */
  async embedTexts(texts: string[]): Promise<BatchEmbeddingResult> {
    try {
      if (!texts || texts.length === 0) {
        return {
          success: false,
          error: '文本列表不能为空',
          processedCount: 0,
        };
      }

      // 过滤空文本
      const validTexts = texts.filter(t => t && t.trim().length > 0);
      
      if (validTexts.length === 0) {
        return {
          success: false,
          error: '没有有效的文本内容',
          processedCount: 0,
        };
      }

      const embeddings: number[][] = [];
      
      // 批量处理（每次最多50条）
      const batchSize = 50;
      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize);
        for (const text of batch) {
          const embedding = await this.client.embedText(text, {
            dimensions: this.options.dimensions,
          });
          embeddings.push(embedding);
        }
      }

      return {
        success: true,
        embeddings,
        processedCount: embeddings.length,
      };
    } catch (error) {
      console.error('批量向量化失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '批量向量化失败',
        processedCount: 0,
      };
    }
  }

  /**
   * 计算文本相似度
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 批量计算相似度
   */
  calculateSimilarities(
    queryEmbedding: number[],
    docEmbeddings: number[][]
  ): Array<{ index: number; score: number }> {
    return docEmbeddings
      .map((embedding, index) => ({
        index,
        score: this.calculateSimilarity(queryEmbedding, embedding),
      }))
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * 创建向量化服务实例
 */
export function createEmbeddingService(
  options?: Partial<EmbeddingOptions>
): EmbeddingService {
  return new EmbeddingService(options);
}

/**
 * RAG检索器类
 */
export class RAGRetriever {
  private embeddingService: EmbeddingService;
  private chunks: Array<{
    id: string;
    content: string;
    embedding?: number[];
    metadata: Record<string, any>;
  }> = [];

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  /**
   * 添加文档块
   */
  async addChunks(
    chunks: Array<{ id: string; content: string; metadata?: Record<string, any> }>
  ): Promise<void> {
    const texts = chunks.map(c => c.content);
    const result = await this.embeddingService.embedTexts(texts);

    if (result.success && result.embeddings) {
      for (let i = 0; i < chunks.length; i++) {
        this.chunks.push({
          ...chunks[i],
          embedding: result.embeddings[i],
          metadata: chunks[i].metadata || {},
        });
      }
    }
  }

  /**
   * 检索相关内容
   */
  async retrieve(query: string, topK: number = 5): Promise<Array<{
    id: string;
    content: string;
    score: number;
    metadata: Record<string, any>;
  }>> {
    const queryResult = await this.embeddingService.embedText(query);

    if (!queryResult.success || !queryResult.embedding) {
      return [];
    }

    const embeddings = this.chunks.map(c => c.embedding!);
    const similarities = this.embeddingService.calculateSimilarities(
      queryResult.embedding,
      embeddings
    );

    return similarities.slice(0, topK).map(sim => ({
      id: this.chunks[sim.index].id,
      content: this.chunks[sim.index].content,
      score: sim.score,
      metadata: this.chunks[sim.index].metadata,
    }));
  }

  /**
   * 清空检索器
   */
  clear(): void {
    this.chunks = [];
  }

  /**
   * 获取块数量
   */
  get size(): number {
    return this.chunks.length;
  }
}

/**
 * 创建RAG检索器实例
 */
export function createRAGRetriever(embeddingService?: EmbeddingService): RAGRetriever {
  const service = embeddingService || createEmbeddingService();
  return new RAGRetriever(service);
}
