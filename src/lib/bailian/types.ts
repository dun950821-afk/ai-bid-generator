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
  /** Embedding模型名称 */
  embeddingModelName?: EmbeddingModelName;
  /** Rerank模型名称 */
  rerankModelName?: RerankModelName;
  /** 相似度阈值 (0.01-1.00) */
  rerankMinScore?: number;
  /** 分段长度 (1-6000字符) */
  chunkSize?: number;
  /** 分段重叠长度 (0-1024字符) */
  overlapSize?: number;
  /** 向量存储类型 */
  sinkType: SinkType;
  /** ADB实例ID (仅sinkType=ADB时需要) */
  sinkInstanceId?: string;
  /** ADB实例地域 (仅sinkType=ADB时需要) */
  sinkRegion?: string;
}

/**
 * 知识库信息
 */
export interface KnowledgeBase {
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
  /** Embedding模型名称 */
  embeddingModelName: string;
  /** Rerank模型名称 */
  rerankModelName?: string;
  /** 文档数量 */
  documentCount: number;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
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
  /** 返回结果数量 */
  topK?: number;
  /** 相似度阈值 */
  rerankMinScore?: number;
  /** 标签过滤 */
  tags?: string[];
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
  /** 元数据 */
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
