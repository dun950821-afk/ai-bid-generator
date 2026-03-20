/**
 * 百炼知识库服务 - 统一入口
 * @description 提供单例模式的服务实例，从数据库读取配置
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { BailianClient } from './client';
import { KnowledgeBaseManager } from './knowledge-base';
import { DocumentManager } from './document';
import { RetrievalManager } from './retrieval';
import { ApiResponse } from './types';

// =====================================================
// 类型定义
// =====================================================

/**
 * 百炼配置
 */
export interface BailianSettings {
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
 * 检索选项
 */
export interface RetrieveOptions {
  knowledgeBaseIds: string[];
  query: string;
  topK?: number;
  rerankMinScore?: number;
  tags?: string[];
}

/**
 * 上传选项
 */
export interface UploadOptions {
  knowledgeBaseId: string;
  fileBuffer: Buffer;
  fileName: string;
  parser?: string;
  tags?: string[];
}

/**
 * 创建知识库选项
 */
export interface CreateKnowledgeBaseOptions {
  name: string;
  description?: string;
  embeddingModel?: string;
  rerankModel?: string;
  chunkSize?: number;
  overlapSize?: number;
}

// =====================================================
// 配置管理
// =====================================================

// 配置缓存
let cachedSettings: BailianSettings | null = null;
let settingsLoadTime = 0;
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 从数据库获取百炼配置
 * @param useCache 是否使用缓存（默认true）
 */
export async function getBailianSettings(useCache = true): Promise<BailianSettings | null> {
  // 检查缓存是否有效
  if (useCache && cachedSettings && Date.now() - settingsLoadTime < SETTINGS_CACHE_TTL) {
    return cachedSettings;
  }

  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('system_settings')
    .select('key, value')
    .eq('category', 'bailian');

  if (error || !data || data.length === 0) {
    console.error('[Bailian] Failed to fetch settings:', error);
    return cachedSettings; // 返回缓存（如果有）
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

  cachedSettings = {
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
  
  settingsLoadTime = Date.now();
  return cachedSettings;
}

/**
 * 清除配置缓存
 */
export function clearBailianSettingsCache(): void {
  cachedSettings = null;
  settingsLoadTime = 0;
  serviceInstance = null;
}

// =====================================================
// 服务实例管理
// =====================================================

// 服务单例
let serviceInstance: BailianKnowledgeService | null = null;

/**
 * 百炼知识库服务类
 * @description 提供统一的知识库管理接口
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

  // ========== 配置获取 ==========
  
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

  // ========== 知识库管理 ==========

  /**
   * 创建知识库
   */
  async createKnowledgeBase(params: CreateKnowledgeBaseOptions) {
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

    const jobId = result.data.id;
    const jobResult = await this.knowledgeBaseManager.submitCreateJob(jobId);
    
    if (!jobResult.success) {
      return {
        ...result,
        message: `知识库创建成功，但提交任务失败: ${jobResult.message}`,
      };
    }

    const statusResult = await this.knowledgeBaseManager.waitForCompletion(
      jobId,
      30000,
      2000
    );

    if (statusResult.success && statusResult.data?.status === 'completed') {
      return {
        requestId: result.requestId,
        success: true,
        data: { id: jobId, name: params.name },
      };
    }

    return {
      requestId: result.requestId,
      success: false,
      message: `知识库创建超时或失败: ${statusResult.data?.message || '未知错误'}`,
    };
  }

  /**
   * 获取知识库列表
   */
  async listKnowledgeBases(params?: { limit?: number; offset?: number }) {
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

    const items = result.data.items.map(kb => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      type: 'bailian',
      document_count: kb.documentCount || 0,
      chunk_count: 0,
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
  }

  /**
   * 获取知识库详情
   */
  async getKnowledgeBase(id: string) {
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
  }

  /**
   * 删除知识库
   */
  async deleteKnowledgeBase(id: string) {
    return await this.knowledgeBaseManager.delete(id);
  }

  // ========== 文档管理 ==========

  /**
   * 上传文档到知识库
   */
  async uploadDocument(params: UploadOptions): Promise<ApiResponse<{ id: string; name: string; status: string; message?: string }>> {
    const uploadResult = await this.documentManager.uploadBuffer(
      params.fileBuffer,
      params.fileName,
      {
        parser: params.parser as any || this.settings.defaultParser,
        tags: params.tags,
      }
    );

    if (!uploadResult.success || !uploadResult.data) {
      return {
        requestId: uploadResult.requestId,
        success: false,
        message: uploadResult.message,
      };
    }

    const fileId = uploadResult.data.fileId;
    const parseResult = await this.documentManager.waitForParsing(
      fileId,
      this.settings.parserTimeout
    );

    return {
      requestId: uploadResult.requestId,
      success: true,
      data: {
        id: fileId,
        name: params.fileName,
        status: parseResult.success && parseResult.data?.status === 'completed'
          ? 'completed'
          : parseResult.data?.status === 'failed'
            ? 'failed'
            : 'processing',
        message: parseResult.data?.message,
      },
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
   * 获取知识库文档列表
   */
  async listKnowledgeBaseDocuments(params: {
    knowledgeBaseId: string;
    limit?: number;
    offset?: number;
  }) {
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

    const documents = result.data.items.map(doc => ({
      id: doc.id,
      knowledge_base_id: params.knowledgeBaseId,
      name: doc.name,
      file_type: doc.fileType,
      file_size: doc.size,
      vector_status: this.mapDocumentStatus(doc.status),
      storage_path: doc.id,
      created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
      updated_at: doc.createdAt?.toISOString() || new Date().toISOString(),
      metadata: {
        bailian_document_id: doc.id,
        bailian_status: doc.status,
      },
      tags: [],
    }));

    return {
      requestId: result.requestId,
      success: true,
      data: {
        documents,
        total: result.data.totalCount,
      },
    };
  }

  /**
   * 删除知识库文档
   */
  async deleteDocument(indexId: string, documentId: string): Promise<ApiResponse<void>> {
    return this.documentManager.deleteIndexDocument(indexId, documentId);
  }

  // ========== 检索 ==========

  /**
   * 检索知识库
   */
  async retrieve(params: RetrieveOptions) {
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

  // ========== 工具方法 ==========

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

// =====================================================
// 工厂函数
// =====================================================

/**
 * 创建百炼知识库服务实例（每次创建新实例）
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

/**
 * 获取百炼知识库服务单例（推荐使用）
 */
export async function getBailianKnowledgeService(): Promise<BailianKnowledgeService> {
  // 检查缓存是否有效
  if (serviceInstance && cachedSettings && Date.now() - settingsLoadTime < SETTINGS_CACHE_TTL) {
    return serviceInstance;
  }

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

  serviceInstance = new BailianKnowledgeService(client, settings);
  return serviceInstance;
}

/**
 * 创建百炼服务实例（兼容旧API）
 * @deprecated 请使用 getBailianKnowledgeService 或 createBailianKnowledgeService
 */
export async function createBailianServiceFromSettings() {
  const service = await getBailianKnowledgeService();
  const settings = await getBailianSettings();
  
  return {
    service,
    settings,
  };
}
