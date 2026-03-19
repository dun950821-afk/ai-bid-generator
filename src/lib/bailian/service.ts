/**
 * 百炼知识库服务
 * @description 从数据库读取配置并初始化百炼服务
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { BailianClient } from './client';
import { KnowledgeBaseManager } from './knowledge-base';
import { DocumentManager } from './document';
import { RetrievalManager } from './retrieval';

/**
 * 百炼配置
 */
interface BailianSettings {
  accessKeyId: string;
  accessKeySecret: string;
  workspaceId: string;
  endpoint: string;
  regionId: string;
  defaultEmbeddingModel: string;
  defaultRerankModel: string;
  defaultChunkSize: number;
  defaultOverlapSize: number;
  defaultRerankMinScore: number;
  defaultParser: string;
  parserTimeout: number;
}

/**
 * 从数据库获取百炼配置
 */
export async function getBailianSettings(): Promise<BailianSettings | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('system_settings')
    .select('key, value')
    .eq('category', 'bailian');

  if (error || !data || data.length === 0) {
    console.error('[Bailian] Failed to fetch settings:', error);
    return null;
  }

  // 转换为键值对
  const settings: Record<string, string> = {};
  for (const item of data) {
    if (item.value) {
      settings[item.key] = item.value;
    }
  }

  // 验证必填配置
  if (!settings.access_key_id || !settings.access_key_secret || !settings.workspace_id) {
    console.error('[Bailian] Missing required settings');
    return null;
  }

  return {
    accessKeyId: settings.access_key_id,
    accessKeySecret: settings.access_key_secret,
    workspaceId: settings.workspace_id,
    endpoint: settings.endpoint || 'bailian.cn-beijing.aliyuncs.com',
    regionId: settings.region_id || 'cn-beijing',
    defaultEmbeddingModel: settings.default_embedding_model || 'text-embedding-v4',
    defaultRerankModel: settings.default_rerank_model || 'qwen3-rerank-hybrid',
    defaultChunkSize: parseInt(settings.default_chunk_size || '500'),
    defaultOverlapSize: parseInt(settings.default_overlap_size || '100'),
    defaultRerankMinScore: parseFloat(settings.default_rerank_min_score || '0.01'),
    defaultParser: settings.default_parser || 'DOCUMENT_UNDERSTANDING_LLM',
    parserTimeout: parseInt(settings.parser_timeout || '600000'),
  };
}

/**
 * 创建百炼服务实例
 */
export async function createBailianServiceFromSettings() {
  const settings = await getBailianSettings();
  
  if (!settings) {
    throw new Error('百炼配置未设置，请先在系统设置中配置百炼知识库');
  }

  const { BailianService } = await import('./index');
  
  return {
    service: new BailianService({
      accessKeyId: settings.accessKeyId,
      accessKeySecret: settings.accessKeySecret,
      workspaceId: settings.workspaceId,
      endpoint: settings.endpoint,
      regionId: settings.regionId,
    }),
    settings,
  };
}

/**
 * 百炼知识库服务封装
 * @description 提供统一的知识库管理接口，同时同步到本地数据库
 */
export class BailianKnowledgeService {
  private client: BailianClient;
  private knowledgeBaseManager: KnowledgeBaseManager;
  private documentManager: DocumentManager;
  private retrievalManager: RetrievalManager;
  private settings: BailianSettings;

  constructor(
    client: BailianClient,
    settings: BailianSettings
  ) {
    this.client = client;
    this.settings = settings;
    this.knowledgeBaseManager = new KnowledgeBaseManager(client);
    this.documentManager = new DocumentManager(client);
    this.retrievalManager = new RetrievalManager(client);
  }

  /**
   * 获取工作空间ID
   */
  getWorkspaceId(): string {
    return this.settings.workspaceId;
  }

  /**
   * 获取默认配置
   */
  getDefaultSettings() {
    return {
      embeddingModel: this.settings.defaultEmbeddingModel,
      rerankModel: this.settings.defaultRerankModel,
      chunkSize: this.settings.defaultChunkSize,
      overlapSize: this.settings.defaultOverlapSize,
      rerankMinScore: this.settings.defaultRerankMinScore,
      parser: this.settings.defaultParser,
      parserTimeout: this.settings.parserTimeout,
    };
  }

  /**
   * 创建知识库（同时在百炼和本地数据库创建）
   */
  async createKnowledgeBase(params: {
    name: string;
    description?: string;
    embeddingModel?: string;
    rerankModel?: string;
    chunkSize?: number;
    overlapSize?: number;
  }) {
    // 1. 在百炼创建知识库
    const result = await this.knowledgeBaseManager.create({
      name: params.name,
      description: params.description,
      structureType: 'unstructured',
      sinkType: 'BUILT_IN',
      embeddingModelName: (params.embeddingModel || this.settings.defaultEmbeddingModel) as any,
      rerankModelName: (params.rerankModel || this.settings.defaultRerankModel) as any,
      chunkSize: params.chunkSize || this.settings.defaultChunkSize,
      overlapSize: params.overlapSize || this.settings.defaultOverlapSize,
    });

    if (!result.success || !result.data) {
      return result;
    }

    // 2. 提交创建任务
    const jobId = result.data.id;
    const jobResult = await this.knowledgeBaseManager.submitCreateJob(jobId);
    
    if (!jobResult.success) {
      return {
        ...result,
        message: `知识库创建成功，但提交任务失败: ${jobResult.message}`,
      };
    }

    // 3. 等待创建完成（最多等待30秒）
    const statusResult = await this.knowledgeBaseManager.waitForCompletion(
      jobId,
      30000,
      2000
    );

    if (statusResult.success && statusResult.data?.status === 'completed') {
      // 4. 同步到本地数据库
      const supabase = getSupabaseClient();
      const { data: localKb, error } = await supabase
        .from('knowledge_bases')
        .insert({
          id: jobId, // 使用百炼返回的ID
          name: params.name,
          description: params.description,
          type: 'bailian',
          embedding_model: params.embeddingModel || this.settings.defaultEmbeddingModel,
          chunk_size: params.chunkSize || this.settings.defaultChunkSize,
          chunk_overlap: params.overlapSize || this.settings.defaultOverlapSize,
          metadata: {
            bailian_index_id: jobId,
            structure_type: 'unstructured',
            sink_type: 'BUILT_IN',
          },
        })
        .select()
        .single();

      if (error) {
        console.error('[Bailian] Failed to sync to local database:', error);
      }

      return {
        requestId: result.requestId,
        success: true,
        data: localKb || { id: jobId, name: params.name },
      };
    }

    return {
      requestId: result.requestId,
      success: false,
      message: `知识库创建超时或失败: ${statusResult.data?.message || '未知错误'}`,
    };
  }

  /**
   * 获取知识库列表（从百炼API获取，同步到本地数据库）
   */
  async listKnowledgeBases(params?: { limit?: number; offset?: number }) {
    try {
      // 1. 从百炼 API 获取知识库列表
      const pageNumber = Math.floor((params?.offset || 0) / (params?.limit || 20)) + 1;
      const pageSize = params?.limit || 20;
      
      const result = await this.knowledgeBaseManager.list({
        pageNumber,
        pageSize,
      });

      if (!result.success || !result.data) {
        return {
          requestId: result.requestId,
          success: false,
          message: result.message || '获取知识库列表失败',
        };
      }

      // 2. 同步到本地数据库（用于关联文档和统计）
      const supabase = getSupabaseClient();
      for (const kb of result.data.items) {
        // 检查是否已存在
        const { data: existing } = await supabase
          .from('knowledge_bases')
          .select('id')
          .eq('id', kb.id)
          .single();

        if (!existing) {
          // 不存在则插入
          await supabase
            .from('knowledge_bases')
            .insert({
              id: kb.id,
              name: kb.name,
              description: kb.description,
              type: 'bailian',
              embedding_model: kb.embeddingModelName,
              status: kb.status,
              metadata: {
                bailian_index_id: kb.id,
                structure_type: kb.structureType,
                document_count: kb.documentCount,
              },
            });
        } else {
          // 已存在则更新
          await supabase
            .from('knowledge_bases')
            .update({
              name: kb.name,
              description: kb.description,
              status: kb.status,
              metadata: {
                bailian_index_id: kb.id,
                structure_type: kb.structureType,
                document_count: kb.documentCount,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', kb.id);
        }
      }

      // 3. 返回格式化的结果
      const items = result.data.items.map(kb => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        type: 'bailian',
        document_count: kb.documentCount || 0,
        chunk_count: 0, // 百炼API不返回chunk数量
        status: kb.status,
        created_at: kb.createdAt?.toISOString() || new Date().toISOString(),
      }));

      return {
        requestId: result.requestId,
        success: true,
        data: {
          items,
          total: result.data.totalCount || items.length,
        },
      };
    } catch (error: any) {
      console.error('[Bailian] listKnowledgeBases error:', error);
      return {
        requestId: '',
        success: false,
        message: error.message || '获取知识库列表失败',
      };
    }
  }

  /**
   * 获取知识库详情（从百炼API获取）
   */
  async getKnowledgeBase(id: string) {
    try {
      // 从百炼 API 获取知识库详情
      const result = await this.knowledgeBaseManager.get(id);
      
      if (!result.success || !result.data) {
        return {
          requestId: result.requestId,
          success: false,
          message: result.message || '知识库不存在',
        };
      }

      const kb = result.data;
      
      return {
        requestId: result.requestId,
        success: true,
        data: {
          id: kb.id,
          name: kb.name,
          description: kb.description,
          type: 'bailian',
          structureType: kb.structureType,
          status: kb.status,
          embeddingModelName: kb.embeddingModelName,
          rerankModelName: kb.rerankModelName,
          documentCount: kb.documentCount || 0,
          createdAt: kb.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: kb.updatedAt?.toISOString() || new Date().toISOString(),
        },
      };
    } catch (error: any) {
      console.error('[Bailian] getKnowledgeBase error:', error);
      return {
        requestId: '',
        success: false,
        message: error.message || '获取知识库详情失败',
      };
    }
  }

  /**
   * 删除知识库
   */
  async deleteKnowledgeBase(id: string) {
    // 1. 从百炼删除
    const result = await this.knowledgeBaseManager.delete(id);

    // 2. 从本地数据库删除（无论百炼删除是否成功）
    const supabase = getSupabaseClient();
    
    // 先删除关联数据
    const { data: documents } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('knowledge_base_id', id);
    
    if (documents && documents.length > 0) {
      const docIds = documents.map(d => d.id);
      await supabase.from('document_chunks').delete().in('document_id', docIds);
    }
    
    await supabase.from('knowledge_documents').delete().eq('knowledge_base_id', id);
    await supabase.from('knowledge_bases').delete().eq('id', id);

    return result;
  }

  /**
   * 上传文档到知识库
   */
  async uploadDocument(params: {
    knowledgeBaseId: string;
    fileBuffer: Buffer;
    fileName: string;
    parser?: string;
    tags?: string[];
  }) {
    // 1. 上传文档到百炼
    const uploadResult = await this.documentManager.uploadBuffer(
      params.fileBuffer,
      params.fileName,
      {
        parser: params.parser as any || this.settings.defaultParser,
        tags: params.tags,
      }
    );

    if (!uploadResult.success || !uploadResult.data) {
      return uploadResult;
    }

    const fileId = uploadResult.data.fileId;

    // 2. 等待解析完成
    const parseResult = await this.documentManager.waitForParsing(
      fileId,
      this.settings.parserTimeout
    );

    // 3. 同步到本地数据库
    const supabase = getSupabaseClient();
    const { data: localDoc, error } = await supabase
      .from('knowledge_documents')
      .insert({
        knowledge_base_id: params.knowledgeBaseId,
        name: params.fileName,
        file_type: params.fileName.split('.').pop() || 'unknown',
        file_size: params.fileBuffer.length,
        storage_path: fileId,
        vector_status: parseResult.success && parseResult.data?.status === 'completed' 
          ? 'completed' 
          : parseResult.data?.status === 'failed' 
            ? 'failed' 
            : 'processing',
        vector_error: parseResult.data?.message,
        metadata: {
          bailian_file_id: fileId,
          parser: params.parser || this.settings.defaultParser,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('[Bailian] Failed to sync document to local:', error);
    }

    return {
      requestId: uploadResult.requestId,
      success: true,
      data: localDoc || { id: fileId, name: params.fileName },
    };
  }

  /**
   * 将文档添加到知识库
   */
  async addDocumentToKnowledgeBase(params: {
    knowledgeBaseId: string;
    documentId: string;
  }) {
    return this.documentManager.addToKnowledgeBase(
      params.knowledgeBaseId,
      [params.documentId]
    );
  }

  /**
   * 检索知识库
   */
  async retrieve(params: {
    knowledgeBaseIds: string[];
    query: string;
    topK?: number;
    rerankMinScore?: number;
    tags?: string[];
  }) {
    return this.retrievalManager.retrieve({
      query: params.query,
      knowledgeBaseIds: params.knowledgeBaseIds,
      topK: params.topK || 5,
      rerankMinScore: params.rerankMinScore || this.settings.defaultRerankMinScore,
      tags: params.tags,
    });
  }

  /**
   * 检索并格式化结果
   */
  async retrieveWithFormat(params: {
    knowledgeBaseIds: string[];
    query: string;
    topK?: number;
  }) {
    return this.retrievalManager.retrieveWithFormat({
      query: params.query,
      knowledgeBaseIds: params.knowledgeBaseIds,
      topK: params.topK || 5,
    });
  }

  /**
   * 连续对话检索
   * @description 基于对话历史进行智能检索，支持上下文理解和追问
   */
  async retrieveWithContext(
    query: string,
    knowledgeBaseIds: string[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    topK: number = 5
  ) {
    return this.retrievalManager.retrieveWithContext(
      query,
      knowledgeBaseIds,
      conversationHistory,
      topK
    );
  }

  /**
   * 获取知识库文档列表（从百炼API获取，同步到本地数据库）
   */
  async listKnowledgeBaseDocuments(params: {
    knowledgeBaseId: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      // 1. 从百炼 API 获取文档列表
      const pageNumber = Math.floor((params.offset || 0) / (params.limit || 50)) + 1;
      const pageSize = params.limit || 50;
      
      const result = await this.documentManager.listIndexDocuments(
        params.knowledgeBaseId,
        { pageNumber, pageSize }
      );

      if (!result.success || !result.data) {
        return {
          requestId: result.requestId,
          success: false,
          message: result.message || '获取文档列表失败',
        };
      }

      // 2. 同步到本地数据库
      const supabase = getSupabaseClient();
      for (const doc of result.data.items) {
        // 检查是否已存在
        const { data: existing } = await supabase
          .from('knowledge_documents')
          .select('id')
          .eq('id', doc.id)
          .single();

        const docStatus = this.mapDocumentStatus(doc.status);
        
        if (!existing) {
          // 不存在则插入
          await supabase
            .from('knowledge_documents')
            .insert({
              id: doc.id,
              knowledge_base_id: params.knowledgeBaseId,
              name: doc.name,
              file_type: doc.fileType,
              file_size: doc.size,
              vector_status: docStatus,
              storage_path: doc.id, // 百炼文档ID
              metadata: {
                bailian_document_id: doc.id,
                bailian_status: doc.status,
              },
            });
        } else {
          // 已存在则更新
          await supabase
            .from('knowledge_documents')
            .update({
              name: doc.name,
              file_type: doc.fileType,
              file_size: doc.size,
              vector_status: docStatus,
              metadata: {
                bailian_document_id: doc.id,
                bailian_status: doc.status,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', doc.id);
        }
      }

      // 3. 返回本地数据库中的文档列表（包含标签等信息）
      const { data: localDocs, error } = await supabase
        .from('knowledge_documents')
        .select(`
          *,
          tags:document_tags(
            id,
            name,
            color
          )
        `)
        .eq('knowledge_base_id', params.knowledgeBaseId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Bailian] Failed to fetch local documents:', error);
      }

      return {
        requestId: result.requestId,
        success: true,
        data: {
          documents: localDocs || [],
          total: result.data.totalCount,
        },
      };
    } catch (error: any) {
      console.error('[Bailian] listKnowledgeBaseDocuments error:', error);
      return {
        requestId: '',
        success: false,
        message: error.message || '获取文档列表失败',
      };
    }
  }

  /**
   * 映射文档状态
   */
  private mapDocumentStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'PARSING': 'processing',
      'PARSER_SUCCESS': 'completed',
      'PARSER_FAILED': 'failed',
      'INSERTING': 'processing',
      'INSERT_ERROR': 'failed',
      'FINISH': 'completed',
      'PENDING': 'pending',
      'RUNNING': 'processing',
      'COMPLETED': 'completed',
      'FAILED': 'failed',
    };
    return statusMap[status] || 'pending';
  }

  /**
   * 获取原始客户端
   */
  getRawClient() {
    return this.client;
  }

  /**
   * 获取知识库管理器
   */
  getKnowledgeBaseManager() {
    return this.knowledgeBaseManager;
  }

  /**
   * 获取文档管理器
   */
  getDocumentManager() {
    return this.documentManager;
  }

  /**
   * 获取检索管理器
   */
  getRetrievalManager() {
    return this.retrievalManager;
  }
}

/**
 * 创建百炼知识库服务
 */
export async function createBailianKnowledgeService(): Promise<BailianKnowledgeService> {
  const settings = await getBailianSettings();
  
  if (!settings) {
    throw new Error('百炼配置未设置，请先在系统设置中配置百炼知识库');
  }

  const client = new BailianClient({
    accessKeyId: settings.accessKeyId,
    accessKeySecret: settings.accessKeySecret,
    workspaceId: settings.workspaceId,
    endpoint: settings.endpoint,
    region: settings.regionId,
  });

  return new BailianKnowledgeService(client, settings);
}
