/**
 * 文档向量化服务
 * 支持文本分块、向量化、存储
 */

import { EmbeddingClient, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 文档分块配置
 */
export interface ChunkConfig {
  chunkSize: number;      // 分块大小（字符数）
  chunkOverlap: number;   // 分块重叠（字符数）
}

/**
 * 文档分块结果
 */
export interface TextChunk {
  content: string;
  index: number;
  startPosition: number;
  endPosition: number;
  pageNumber?: number;
}

/**
 * 向量化结果
 */
export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
  dimension: number;
}

/**
 * 文档向量化服务类
 */
export class DocumentEmbeddingService {
  private client: EmbeddingClient;
  private defaultChunkConfig: ChunkConfig = {
    chunkSize: 500,
    chunkOverlap: 50,
  };

  constructor(customHeaders?: Record<string, string>) {
    // EmbeddingClient 不支持 customHeaders 参数，使用默认配置
    this.client = new EmbeddingClient();
  }

  /**
   * 将文本分割成块
   */
  splitIntoChunks(
    text: string,
    config: ChunkConfig = this.defaultChunkConfig
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const paragraphs = text.split(/\n\n+/);
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    let startIndex = 0;
    let globalIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphLength = paragraph.length;

      // 如果当前段落超过了分块大小，需要进一步分割
      if (paragraphLength > config.chunkSize) {
        // 先保存当前块
        if (currentChunk.length > 0) {
          const content = currentChunk.join('\n\n');
          chunks.push({
            content,
            index: chunks.length,
            startPosition: startIndex,
            endPosition: startIndex + content.length,
          });
          currentChunk = [];
          currentLength = 0;
        }

        // 分割长段落
        const sentences = paragraph.split(/(?<=[。！？.!?])/);
        for (const sentence of sentences) {
          if (currentLength + sentence.length > config.chunkSize && currentChunk.length > 0) {
            const content = currentChunk.join('');
            chunks.push({
              content,
              index: chunks.length,
              startPosition: startIndex,
              endPosition: startIndex + content.length,
            });
            startIndex += content.length - config.chunkOverlap;
            currentChunk = [sentence.slice(0, config.chunkOverlap)];
            currentLength = config.chunkOverlap;
          }
          currentChunk.push(sentence);
          currentLength += sentence.length;
        }
      } else {
        // 如果添加这个段落会超过分块大小，先保存当前块
        if (currentLength + paragraphLength > config.chunkSize && currentChunk.length > 0) {
          const content = currentChunk.join('\n\n');
          chunks.push({
            content,
            index: chunks.length,
            startPosition: startIndex,
            endPosition: startIndex + content.length,
          });
          startIndex += content.length - config.chunkOverlap;
          currentChunk = [];
          currentLength = 0;
        }

        currentChunk.push(paragraph);
        currentLength += paragraphLength + 2; // +2 for '\n\n'
      }
    }

    // 保存最后一个块
    if (currentChunk.length > 0) {
      const content = currentChunk.join('\n\n');
      chunks.push({
        content,
        index: chunks.length,
        startPosition: startIndex,
        endPosition: startIndex + content.length,
      });
    }

    return chunks;
  }

  /**
   * 生成文本向量
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const embedding = await this.client.embedText(text);
    return embedding;
  }

  /**
   * 批量生成向量
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }
    return embeddings;
  }

  /**
   * 处理文档：分块 + 向量化 + 存储
   */
  async processDocument(
    documentId: string,
    knowledgeBaseId: string,
    content: string,
    config?: ChunkConfig
  ): Promise<{
    chunkCount: number;
    chunks: TextChunk[];
    success: boolean;
    error?: string;
  }> {
    try {
      // 1. 分块
      const chunks = this.splitIntoChunks(content, config || this.defaultChunkConfig);

      // 2. 向量化并存储
      const supabaseClient = getSupabaseClient();
      const createdChunks: TextChunk[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // 生成向量
        const embedding = await this.generateEmbedding(chunk.content);

        // 存储到数据库
        const { data, error } = await supabaseClient
          .from('knowledge_chunks')
          .insert({
            document_id: documentId,
            knowledge_base_id: knowledgeBaseId,
            content: chunk.content,
            chunk_index: chunk.index,
            start_position: chunk.startPosition,
            end_position: chunk.endPosition,
            page_number: chunk.pageNumber,
            // 向量ID暂存为uuid，实际向量存储在向量数据库中
            vector_id: crypto.randomUUID(),
          })
          .select('id')
          .single();

        if (error) {
          console.error(`存储分块 ${i} 失败:`, error);
          continue;
        }

        createdChunks.push(chunk);

        // 更新文档的分块数量
        await supabaseClient
          .from('knowledge_documents')
          .update({
            chunk_count: i + 1,
            vector_status: 'processing',
          })
          .eq('id', documentId);
      }

      // 3. 更新文档状态
      await supabaseClient
        .from('knowledge_documents')
        .update({
          chunk_count: createdChunks.length,
          vector_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      // 4. 更新知识库统计
      const { count } = await supabaseClient
        .from('knowledge_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('knowledge_base_id', knowledgeBaseId);

      await supabaseClient
        .from('knowledge_bases')
        .update({
          chunk_count: count || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', knowledgeBaseId);

      return {
        chunkCount: createdChunks.length,
        chunks: createdChunks,
        success: true,
      };
    } catch (error) {
      console.error('处理文档失败:', error);
      
      // 更新文档状态为失败
      const supabaseClient = getSupabaseClient();
      await supabaseClient
        .from('knowledge_documents')
        .update({
          vector_status: 'failed',
          vector_error: error instanceof Error ? error.message : '未知错误',
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      return {
        chunkCount: 0,
        chunks: [],
        success: false,
        error: error instanceof Error ? error.message : '处理文档失败',
      };
    }
  }

  /**
   * 计算向量相似度（余弦相似度）
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('向量维度不一致');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 批量处理文档（用于后台任务）
   */
  async batchProcessDocuments(
    documents: Array<{
      id: string;
      knowledgeBaseId: string;
      content: string;
    }>,
    config?: ChunkConfig
  ): Promise<void> {
    for (const doc of documents) {
      try {
        await this.processDocument(
          doc.id,
          doc.knowledgeBaseId,
          doc.content,
          config
        );
        // 避免API限流
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`处理文档 ${doc.id} 失败:`, error);
      }
    }
  }
}

/**
 * 创建文档向量化服务实例
 */
export function createDocumentEmbeddingService(
  customHeaders?: Record<string, string>
): DocumentEmbeddingService {
  return new DocumentEmbeddingService(customHeaders);
}
