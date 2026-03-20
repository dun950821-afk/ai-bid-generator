/**
 * 阿里云百炼知识库类型定义
 * @description 定义知识库相关的所有TypeScript类型
 */

/**
 * 知识库类型
 */
export type StructureType = 'unstructured' | 'structured' | 'multimedia';

/**
 * 解析方式
 */
export type ParserType = 
  | 'DOCUMENT_UNDERSTANDING_ELECTRONIC'  // 电子文档解析
  | 'DOCUMENT_UNDERSTANDING_OCR'          // 文档智能解析
  | 'DOCUMENT_UNDERSTANDING_LLM'          // 大模型文档解析
  | 'QWEN_VL';                            // Qwen VL解析

/**
 * 向量存储类型
 */
export type SinkType = 'BUILT_IN' | 'ADB';

/**
 * 知识库状态
 */
export type KnowledgeBaseStatus = 'creating' | 'active' | 'failed';

/**
 * 任务状态
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 文件状态
 */
export type FileStatus = 'parsing' | 'completed' | 'failed';

/**
 * Embedding模型类型
 */
export type EmbeddingModelName = 'text-embedding-v4' | 'text-embedding-v3';

/**
 * Rerank模型类型
 */
export type RerankModelName = 
  | 'qwen3-rerank-hybrid' 
  | 'qwen3-rerank' 
  | 'gte-rerank-hybrid' 
  | 'gte-rerank';

/**
 * 知识库配置
 */
export interface KnowledgeBaseConfig {
  /** 知识库名称 (1-20字符) */
  name: string;
  /** 知识库描述 */
  description?: string;
  /** 知识库类型 */
  structureType: StructureType;
  
  // ========== 数据源配置 ==========
  /** 数据源类型 (必填) */
  sourceType: SourceType;
  /** 文件ID列表 */
  documentIds?: string[];
  /** 类目ID列表 */
  categoryIds?: string[];
  
  // ========== 模型配置 ==========
  /** Embedding模型名称 */
  embeddingModelName?: EmbeddingModelName;
  /** Rerank模型名称 */
  rerankModelName?: RerankModelName;
  /** 相似度阈值 (0.01-1.00) */
  rerankMinScore?: number;
  
  // ========== 切分配置 ==========
  /** 分段长度 (1-6000字符) */
  chunkSize?: number;
  /** 分段重叠长度 (0-1024字符) */
  overlapSize?: number;
  /** 切分策略 */
  chunkMode?: 'length' | 'page' | 'h1' | 'h2' | 'regex';
  /** 自定义分隔符 (仅 chunkMode='regex' 时生效) */
  separator?: string;
  
  // ========== 高级配置 ==========
  /** 是否启用多轮对话改写 */
  enableRewrite?: boolean;
  /** Excel文件是否启用表头 */
  enableHeaders?: boolean;
  /** 元数据提取配置 */
  metaExtractColumns?: MetaExtractColumn[];
  
  // ========== 向量存储配置 ==========
  /** 向量存储类型 */
  sinkType: SinkType;
  /** ADB实例ID (仅sinkType=ADB时需要) */
  sinkInstanceId?: string;
  /** ADB实例地域 (仅sinkType=ADB时需要) */
  sinkRegion?: string;
  
  // ========== 规格配置 ==========
  /** 知识库规格 */
  pipelineCommercialType?: 'standard' | 'enterprise';
  /** RCU数量 (1-200) */
  pipelineCommercialCu?: number;
  
  // ========== 场景配置 ==========
  /** 知识库场景 (如 visual_document_qa 支持图文并茂回复) */
  knowledgeScene?: string;
}

/**
 * 元数据提取配置
 */
export interface MetaExtractColumn {
  /** 字段名 */
  key: string;
  /** 字段值 */
  value: string;
  /** 提取类型 */
  type: 'constant' | 'variable' | 'custom_prompt' | 'regular' | 'keywords';
  /** 字段描述 */
  desc?: string;
  /** 是否使用大模型提取 */
  enableLlm?: boolean;
  /** 是否参与检索 */
  enableSearch?: boolean;
}

/**
 * 知识库信息
 * @description 完整的知识库信息，包含所有官方API返回字段
 */
export interface KnowledgeBase {
  // ========== 基础信息 ==========
  /** 知识库ID */
  id: string;
  /** 知识库名称 */
  name: string;
  /** 知识库描述 */
  description?: string;
  /** 知识库类型 */
  structureType: StructureType;
  /** 知识库状态 */
  status: KnowledgeBaseStatus;
  
  // ========== 模型配置 ==========
  /** Embedding模型名称 */
  embeddingModelName: string;
  /** Rerank模型名称 */
  rerankModelName?: string;
  /** 相似度阈值 (0.01-1.00) */
  rerankMinScore?: number;
  /** 是否启用多轮对话改写 */
  enableRewrite?: boolean;
  
  // ========== 切分配置 ==========
  /** 分段预估长度 (1-2048) */
  chunkSize?: number;
  /** 分段重叠长度 (0-1024) */
  overlapSize?: number;
  /** 分句标识符 */
  separator?: string;
  
  // ========== 数据源配置 ==========
  /** 数据源类型 */
  sourceType?: SourceType;
  /** 文件ID列表 */
  documentIds?: string[];
  /** 文档数量 */
  documentCount: number;
  
  // ========== 向量存储配置 ==========
  /** 向量存储类型 */
  sinkType?: SinkType;
  /** 向量存储实例ID */
  sinkInstanceId?: string;
  /** 向量存储实例地域 */
  sinkRegion?: string;
  
  // ========== 配置模式 ==========
  /** 知识库配置模式 */
  configModel?: 'recommend' | 'custom';
  
  // ========== 时间信息 ==========
  /** 创建时间 */
  createdAt?: Date;
  /** 更新时间 */
  updatedAt?: Date;
}

/**
 * 文件上传配置
 */
export interface FileUploadConfig {
  /** 文件名 */
  fileName: string;
  /** 文件MD5值 */
  fileMd5: string;
  /** 文件大小(字节) */
  fileSize: number;
  /** 解析方式 */
  parser?: ParserType;
  /** 类目ID */
  categoryId?: string;
  /** 标签列表 */
  tags?: string[];
}

/**
 * 文件上传租约
 */
export interface FileUploadLease {
  /** 租约ID */
  leaseId: string;
  /** 预签名URL */
  preSignedUrl: string;
  /** 上传请求头 */
  headers: Record<string, string>;
}

/**
 * 检索配置
 */
export interface RetrievalConfig {
  /** 查询文本 */
  query: string;
  /** 知识库ID列表 */
  knowledgeBaseIds: string[];
  
  // ========== 检索控制参数 ==========
  /** 向量检索数量 (默认100) */
  denseSimilarityTopK?: number;
  /** 关键词检索数量 (默认100，启用后开启混合检索) */
  sparseSimilarityTopK?: number;
  /** @deprecated 使用 denseSimilarityTopK 代替 */
  topK?: number;
  
  // ========== 重排序控制参数 ==========
  /** 是否启用重排序 (默认true) */
  enableReranking?: boolean;
  /** 相似度阈值 (0.01-1.00) */
  rerankMinScore?: number;
  /** 重排序后返回数量 (1-20，默认5) */
  rerankTopN?: number;
  /** 重排序模型名称 */
  rerankModelName?: RerankModelName;
  
  // ========== 多轮对话参数 ==========
  /** 是否启用查询改写 (默认false) */
  enableRewrite?: boolean;
  /** 对话历史 (启用查询改写时有效) */
  queryHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  
  // ========== 标签过滤参数 ==========
  /** 标签过滤 (使用百炼原生 SearchFilters) */
  tags?: string[];
  /** 高级检索过滤器 (支持多条件AND组合) */
  searchFilters?: Array<Record<string, any>>;
  
  // ========== 多模态检索参数 ==========
  /** 图片URL列表 (用于图片检索) */
  images?: string[];
}

/**
 * 混合检索配置
 */
export interface HybridRetrievalConfig extends RetrievalConfig {
  /** 关键词权重 */
  keywordWeight?: number;
  /** 向量权重 */
  vectorWeight?: number;
}

/**
 * 检索结果项
 */
export interface RetrievalResult {
  /** 文本内容 */
  content: string;
  /** 文档名称 */
  documentName: string;
  /** 文档ID */
  documentId: string;
  /** 相似度得分 */
  score: number;
  /** 页码 */
  pageNumber?: number;
  
  // ========== 多模态支持 ==========
  /** 图片URL列表 (带过期时间) */
  imageUrl?: string[];
  /** 音频URL */
  audioUrl?: string;
  /** 视频URL */
  videoUrl?: string;
  
  // ========== 文档结构信息 ==========
  /** 层级标题 */
  hierTitle?: string;
  /** 文档标题 */
  title?: string;
  /** 切片ID */
  chunkId?: string;
  
  /** 完整元数据 */
  metadata?: Record<string, any>;
}

/**
 * API响应基础类型
 */
export interface ApiResponse<T = any> {
  /** 请求ID */
  requestId: string;
  /** 是否成功 */
  success: boolean;
  /** 错误码 */
  code?: string;
  /** 错误信息 */
  message?: string;
  /** 响应数据 */
  data?: T;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  /** 页码 (从1开始) */
  pageNumber?: number;
  /** 每页数量 */
  pageSize?: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  /** 数据列表 */
  items: T[];
  /** 总数量 */
  totalCount: number;
  /** 当前页码 */
  pageNumber: number;
  /** 每页数量 */
  pageSize: number;
}

/**
 * 知识库创建任务状态
 */
export interface IndexJobStatus {
  /** 任务状态 */
  status: JobStatus;
  /** 进度百分比 */
  progress?: number;
  /** 状态消息 */
  message?: string;
}

/**
 * 文件解析状态
 */
export interface FileParseStatus {
  /** 解析状态 */
  status: FileStatus;
  /** 解析进度 */
  progress?: number;
  /** 状态消息 */
  message?: string;
}

/**
 * 类目信息
 */
export interface Category {
  /** 类目ID */
  id: string;
  /** 类目名称 */
  name: string;
  /** 父类目ID */
  parentId?: string;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 数据源类型
 */
export type SourceType = 'DATA_CENTER_CATEGORY' | 'DATA_CENTER_FILE' | 'DATA_CENTER_STRUCTURED_TABLE';

/**
 * 文档信息
 */
export interface DocumentInfo {
  /** 文档ID */
  id: string;
  /** 文档名称 */
  name: string;
  /** 文档类型 */
  type: string;
  /** 文档大小 */
  size: number;
  /** 解析状态 */
  status: FileStatus;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 快速开始配置
 */
export interface QuickStartConfig {
  /** 知识库名称 */
  knowledgeBaseName: string;
  /** 文件路径 */
  filePath: string;
  /** 解析方式 */
  parser?: ParserType;
  /** 知识库描述 */
  description?: string;
}

/**
 * 快速开始结果
 */
export interface QuickStartResult {
  /** 知识库ID */
  knowledgeBaseId: string;
  /** 文件ID */
  fileId: string;
}
