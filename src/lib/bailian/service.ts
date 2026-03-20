/**
 * 百炼知识库服务 - 统一入口
 * @description 提供单例模式的服务实例，从数据库读取配置
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { BailianClient } from './client';
import { KnowledgeBaseManager } from './knowledge-base';
import { DocumentManager } from './document';
import { RetrievalManager } from './retrieval';
import { ApiResponse, RerankModelName } from './types';

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
  
  // ========== 检索控制参数 ==========
  denseSimilarityTopK?: number;
  sparseSimilarityTopK?: number;
  /** @deprecated 使用 denseSimilarityTopK 代替 */
  topK?: number;
  
  // ========== 重排序控制参数 ==========
  enableReranking?: boolean;
  rerankMinScore?: number;
  rerankTopN?: number;
  
  // ========== 多轮对话参数 ==========
  enableRewrite?: boolean;
  queryHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** @deprecated 使用 enableRewrite 和 queryHistory 代替 */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  
  // ========== 标签过滤参数 ==========
  tags?: string[];
  searchFilters?: Array<Record<string, any>>;
  
  // ========== 多模态检索参数 ==========
  images?: string[];
  
  // ========== 历史记录参数 ==========
  /** 是否保存历史文本切片召回测试数据 */
  saveRetrieverHistory?: boolean;
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
  
  // ========== 数据源配置 ==========
  sourceType?: 'DATA_CENTER_CATEGORY' | 'DATA_CENTER_FILE' | 'DATA_CENTER_STRUCTURED_TABLE';
  documentIds?: string[];
  categoryIds?: string[];
  
  // ========== 模型配置 ==========
  embeddingModel?: string;
  rerankModel?: string;
  
  // ========== 切分配置 ==========
  chunkSize?: number;
  overlapSize?: number;
  chunkMode?: 'length' | 'page' | 'h1' | 'h2' | 'regex';
  separator?: string;
  
  // ========== 高级配置 ==========
  enableRewrite?: boolean;
  enableHeaders?: boolean;
  
  // ========== 规格配置 ==========
  pipelineCommercialType?: 'standard' | 'enterprise';
  pipelineCommercialCu?: number;
  
  // ========== 场景配置 ==========
  knowledgeScene?: string;
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
      
      // 数据源配置
      sourceType: params.sourceType || 'DATA_CENTER_CATEGORY',
      documentIds: params.documentIds,
      categoryIds: params.categoryIds,
      
      // 模型配置
      embeddingModelName: (params.embeddingModel || this.settings.defaultEmbeddingModel) as any,
      rerankModelName: (params.rerankModel || this.settings.defaultRerankModel) as any,
      
      // 切分配置
      chunkSize: params.chunkSize || this.settings.defaultChunkSize,
      overlapSize: params.overlapSize || this.settings.defaultOverlapSize,
      chunkMode: params.chunkMode,
      separator: params.separator,
      
      // 高级配置
      enableRewrite: params.enableRewrite,
      enableHeaders: params.enableHeaders,
      
      // 规格配置
      pipelineCommercialType: params.pipelineCommercialType,
      pipelineCommercialCu: params.pipelineCommercialCu,
      
      // 场景配置
      knowledgeScene: params.knowledgeScene,
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

    // 返回完整的知识库信息
    const items = result.data.items.map(kb => this.formatKnowledgeBaseForApi(kb));

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

    return {
      requestId: result.requestId,
      success: true,
      data: this.formatKnowledgeBaseForApi(result.data),
    };
  }

  /**
   * 格式化知识库信息为API返回格式
   */
  private formatKnowledgeBaseForApi(kb: any) {
    return {
      // 基础信息
      id: kb.id,
      name: kb.name,
      description: kb.description,
      type: 'bailian',
      structureType: kb.structureType,
      status: kb.status,
      
      // 模型配置
      embeddingModelName: kb.embeddingModelName,
      rerankModelName: kb.rerankModelName,
      rerankMinScore: kb.rerankMinScore,
      enableRewrite: kb.enableRewrite,
      
      // 切分配置
      chunkSize: kb.chunkSize,
      overlapSize: kb.overlapSize,
      separator: kb.separator,
      
      // 数据源配置
      sourceType: kb.sourceType,
      documentIds: kb.documentIds,
      documentCount: kb.documentCount || 0,
      
      // 向量存储配置
      sinkType: kb.sinkType,
      sinkInstanceId: kb.sinkInstanceId,
      sinkRegion: kb.sinkRegion,
      
      // 配置模式
      configModel: kb.configModel,
      
      // 时间信息
      createdAt: kb.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: kb.updatedAt?.toISOString() || new Date().toISOString(),
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
   * @description 支持状态过滤、名称搜索、模糊匹配和分页
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindexdocuments
   */
  async listKnowledgeBaseDocuments(params: {
    knowledgeBaseId: string;
    limit?: number;
    offset?: number;
    /** 文档状态过滤 */
    documentStatus?: 'INSERT_ERROR' | 'RUNNING' | 'DELETED' | 'FINISH';
    /** 文件名称过滤（不含后缀） */
    documentName?: string;
    /** 是否开启文件名称模糊匹配 */
    enableNameLike?: boolean;
  }) {
    const pageNumber = Math.floor((params.offset || 0) / (params.limit || 50)) + 1;
    const pageSize = params.limit || 50;
    
    const result = await this.documentManager.listIndexDocuments({
      indexId: params.knowledgeBaseId,
      pageNumber,
      pageSize,
      documentStatus: params.documentStatus,
      documentName: params.documentName,
      enableNameLike: params.enableNameLike,
    });

    if (!result.success || !result.data) {
      return {
        requestId: result.requestId,
        success: false,
        message: result.message || '获取文档列表失败',
        data: {
          documents: [],
          total: 0,
          pageNumber: 1,
          pageSize: 50,
        },
      };
    }

    // 批量获取文档标签信息（限制前20个文档，避免过多API调用）
    const documentsWithTags = await Promise.all(
      result.data.documents.slice(0, 20).map(async (doc) => {
        // 使用 fileId 获取标签信息
        const fileId = doc.fileId || doc.documentId;
        if (fileId) {
          try {
            const fileInfo = await this.documentManager.getFileInfo(fileId);
            if (fileInfo.success && fileInfo.data) {
              return {
                ...doc,
                tags: fileInfo.data.tags || [],
              };
            }
          } catch (error) {
            // 忽略错误，返回原始文档
          }
        }
        return doc;
      })
    );

    // 合并结果
    const documents = result.data.documents.map((doc, index) => {
      const docWithTags = index < 20 ? documentsWithTags[index] : doc;
      const tags = docWithTags?.tags || doc.tags || [];
      
      return {
        id: doc.documentId,
        knowledge_base_id: params.knowledgeBaseId,
        name: doc.documentName,
        file_type: doc.fileType || 'unknown',
        file_size: doc.sizeInBytes || 0,
        vector_status: this.mapBailianStatusToDisplay(doc.status),
        storage_path: doc.fileId || doc.documentId,
        created_at: doc.gmtCreate || new Date().toISOString(),
        updated_at: doc.gmtModified || doc.gmtCreate || new Date().toISOString(),
        metadata: {
          bailian_document_id: doc.documentId,
          bailian_status: doc.status,
          progress: doc.progress,
          error_message: doc.errorMessage,
          source_type: doc.sourceType,
          category_id: doc.categoryId,
          file_id: doc.fileId,
          tags: tags,
        },
        tags: tags?.map((tag: string, index: number) => ({
          id: `tag-${index}`,
          name: tag,
          color: this.getTagColor(tag),
        })) || [],
        // 新增字段
        progress: doc.progress,
        error_message: doc.errorMessage,
        source_type: doc.sourceType,
        category_id: doc.categoryId,
        file_id: doc.fileId,
      };
    });

    return {
      requestId: result.requestId,
      success: true,
      data: {
        documents,
        total: result.data.totalCount,
        pageNumber: result.data.pageNumber,
        pageSize: result.data.pageSize,
      },
    };
  }

  /**
   * 映射百炼状态为前端显示状态
   */
  private mapBailianStatusToDisplay(status: string): string {
    const statusMap: Record<string, string> = {
      'INSERT_ERROR': 'failed',
      'RUNNING': 'processing',
      'DELETED': 'deleted',
      'FINISH': 'completed',
      // 兼容旧状态
      'PARSING': 'processing',
      'PARSER_SUCCESS': 'completed',
      'PARSER_FAILED': 'failed',
      'INSERTING': 'processing',
      'PENDING': 'pending',
      'COMPLETED': 'completed',
      'FAILED': 'failed',
    };
    return statusMap[status] || 'pending';
  }

  /**
   * 根据标签名获取颜色
   */
  private getTagColor(tag: string): string {
    // 使用简单哈希生成颜色
    const colors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // violet
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#84cc16', // lime
    ];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * 删除知识库文档
   */
  async deleteDocument(indexId: string, documentId: string): Promise<ApiResponse<void>> {
    return this.documentManager.deleteIndexDocument(indexId, documentId);
  }

  /**
   * 获取文件详情列表
   * @description 包含分块配置等详细信息
   */
  async listFileDetails(params: {
    knowledgeBaseId: string;
    limit?: number;
    offset?: number;
    /** 文档状态过滤 */
    documentStatus?: 'INSERT_ERROR' | 'RUNNING' | 'DELETED' | 'FINISH';
    /** 文件名称过滤 */
    documentName?: string;
    /** 是否开启文件名称模糊匹配 */
    enableNameLike?: boolean;
  }) {
    const pageNumber = Math.floor((params.offset || 0) / (params.limit || 10)) + 1;
    const pageSize = params.limit || 10;
    
    const result = await this.documentManager.listIndexFileDetails({
      indexId: params.knowledgeBaseId,
      pageNumber,
      pageSize,
      documentStatus: params.documentStatus,
      documentName: params.documentName,
      enableNameLike: params.enableNameLike,
    });

    if (!result.success || !result.data) {
      return {
        requestId: result.requestId,
        success: false,
        message: result.message || '获取文件详情失败',
        data: {
          documents: [],
          total: 0,
          pageNumber: 1,
          pageSize: 10,
        },
      };
    }

    const documents = result.data.documents.map(doc => ({
      id: doc.id,
      knowledge_base_id: params.knowledgeBaseId,
      name: doc.name,
      document_type: doc.documentType,
      file_size: doc.size || 0,
      vector_status: this.mapBailianStatusToDisplay(doc.status),
      // 分块配置
      chunk_mode: doc.chunkMode,
      chunk_size: doc.chunkSize,
      overlap_size: doc.overlapSize,
      separator: doc.separator,
      enable_headers: doc.enableHeaders,
      // 来源信息
      source_id: doc.sourceId,
      // 状态信息
      code: doc.code,
      message: doc.message,
      // 时间
      updated_at: doc.gmtModified ? new Date(doc.gmtModified).toISOString() : undefined,
    }));

    return {
      requestId: result.requestId,
      success: true,
      data: {
        documents,
        total: result.data.totalCount,
        pageNumber: result.data.pageNumber,
        pageSize: result.data.pageSize,
      },
    };
  }

  /**
   * 获取单个文件详情
   */
  async getFileDetail(indexId: string, documentId: string) {
    const result = await this.documentManager.getFileDetail(indexId, documentId);

    if (!result.success || !result.data) {
      return {
        requestId: result.requestId,
        success: false,
        message: result.message || '获取文件详情失败',
        data: null,
      };
    }

    const doc = result.data;
    return {
      requestId: result.requestId,
      success: true,
      data: {
        id: doc.id,
        name: doc.name,
        document_type: doc.documentType,
        file_size: doc.size || 0,
        vector_status: this.mapBailianStatusToDisplay(doc.status),
        // 分块配置
        chunk_mode: doc.chunkMode,
        chunk_size: doc.chunkSize,
        overlap_size: doc.overlapSize,
        separator: doc.separator,
        enable_headers: doc.enableHeaders,
        // 来源信息
        source_id: doc.sourceId,
        // 状态信息
        code: doc.code,
        message: doc.message,
        // 时间
        updated_at: doc.gmtModified ? new Date(doc.gmtModified).toISOString() : undefined,
      },
    };
  }

  /**
   * 获取文件下载信息
   * @description 获取文件的下载链接等信息
   */
  async getFileDownloadInfo(fileId: string) {
    return this.documentManager.getFileInfo(fileId);
  }

  /**
   * 更新文件标签
   * @description 更新数据中心文件的标签信息
   * @param fileId 文件ID
   * @param tags 标签列表（最多32个，每个最多32字符）
   */
  async updateFileTags(fileId: string, tags: string[]) {
    return this.documentManager.updateFileTags(fileId, tags);
  }

  /**
   * 获取数据中心文件列表
   * @description 支持按类目、文件名查询，支持标签过滤
   * @param params 查询参数
   */
  async listDataCenterFiles(params: {
    /** 类目ID */
    categoryId?: string;
    /** 文件名（精确匹配） */
    fileName?: string;
    /** 分页Token */
    nextToken?: string;
    /** 每页数量（1-200） */
    maxResults?: number;
    /** 标签过滤 */
    tags?: string[];
  }) {
    const result = await this.documentManager.listDataCenterFiles({
      categoryId: params.categoryId,
      fileName: params.fileName,
      nextToken: params.nextToken,
      maxResults: params.maxResults,
      tags: params.tags,
    });

    if (!result.success || !result.data) {
      return {
        requestId: result.requestId,
        success: false,
        message: result.message || '获取文件列表失败',
        data: {
          files: [],
          hasNext: false,
          maxResults: params.maxResults || 50,
        },
      };
    }

    // 格式化文件信息
    const files = result.data.files.map(file => ({
      id: file.fileId,
      name: file.fileName,
      file_type: file.fileType,
      file_size: file.sizeInBytes || 0,
      category_id: file.categoryId,
      parser: file.parser,
      status: file.status,
      tags: file.tags || [],
      created_at: file.createTime,
    }));

    return {
      requestId: result.requestId,
      success: true,
      data: {
        files,
        hasNext: result.data.hasNext,
        nextToken: result.data.nextToken,
        totalCount: result.data.totalCount,
        maxResults: result.data.maxResults,
      },
    };
  }

  /**
   * 删除数据中心文件
   * @description 删除数据中心中的文件
   * @param fileId 文件ID
   */
  async deleteFile(fileId: string) {
    return this.documentManager.deleteFile(fileId);
  }

  // ========== 检索 ==========

  /**
   * 检索知识库
   */
  async retrieve(params: RetrieveOptions) {
    // 兼容旧的 conversationHistory 参数
    const queryHistory = params.queryHistory || params.conversationHistory;
    const enableRewrite = params.enableRewrite ?? (queryHistory && queryHistory.length > 0);
    
    return this.retrievalManager.retrieve({
      query: params.query,
      knowledgeBaseIds: params.knowledgeBaseIds,
      
      // 检索控制（兼容旧参数 topK）
      denseSimilarityTopK: params.denseSimilarityTopK || params.topK || 100,
      ...(params.sparseSimilarityTopK && { sparseSimilarityTopK: params.sparseSimilarityTopK }),
      
      // 重排序控制
      enableReranking: params.enableReranking,
      rerankMinScore: params.rerankMinScore || this.settings.defaultRerankMinScore,
      ...(params.rerankTopN && { rerankTopN: params.rerankTopN }),
      
      // 多轮对话
      enableRewrite,
      ...(queryHistory && queryHistory.length > 0 && { queryHistory }),
      
      // 标签过滤
      tags: params.tags,
      searchFilters: params.searchFilters,
      
      // 多模态检索
      ...(params.images && params.images.length > 0 && { images: params.images }),
      
      // 历史记录
      ...(params.saveRetrieverHistory !== undefined && { 
        saveRetrieverHistory: params.saveRetrieverHistory 
      }),
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
   * @description 使用百炼原生的查询改写功能
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
      { denseSimilarityTopK: topK }
    );
  }

  /**
   * 图片检索
   * @description 以图搜文或图文混合检索
   */
  async retrieveByImages(
    images: string[],
    query: string | undefined,
    knowledgeBaseIds: string[],
    options?: Partial<RetrieveOptions>
  ) {
    return this.retrievalManager.retrieveByImages(
      images,
      query,
      knowledgeBaseIds,
      options
    );
  }

  /**
   * 高级标签过滤检索
   */
  async retrieveWithFilters(
    query: string,
    knowledgeBaseIds: string[],
    searchFilters: Array<Record<string, any>>,
    options?: Partial<RetrieveOptions>
  ) {
    return this.retrievalManager.retrieveWithFilters(
      query,
      knowledgeBaseIds,
      searchFilters,
      options
    );
  }

  // ========== 工具方法 ==========

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

  // ========== 文档分块 ==========

  /**
   * 获取文档分块列表
   * @param knowledgeBaseId 知识库ID
   * @param documentId 文档ID（可选，用于筛选特定文档）
   */
  async listDocumentChunks(params: {
    knowledgeBaseId: string;
    documentId?: string;
    pageNum?: number;
    pageSize?: number;
  }) {
    const result = await this.documentManager.listChunks({
      indexId: params.knowledgeBaseId,
      fileId: params.documentId,
      pageNum: params.pageNum || 1,
      pageSize: params.pageSize || 100,
    });

    if (!result.success || !result.data) {
      return {
        requestId: result.requestId,
        success: false,
        message: result.message || '获取文档分块失败',
        chunks: [],
        total: 0,
      };
    }

    // 格式化分块数据以匹配前端期望的格式
    const chunks = result.data.chunks.map((chunk, index) => ({
      id: chunk.id,
      chunk_index: index,
      content: chunk.text,
      metadata: {
        ...chunk.metadata,
        doc_name: chunk.metadata?.doc_name,
        doc_id: chunk.metadata?.doc_id,
      },
    }));

    return {
      requestId: result.requestId,
      success: true,
      chunks,
      total: result.data.total,
    };
  }

  // ========== 文档预览 ==========

  /**
   * 获取文档预览信息
   * @param documentId 文档ID
   */
  async getDocumentPreview(documentId: string) {
    return this.documentManager.getDocumentPreview(documentId);
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
