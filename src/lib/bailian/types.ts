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
 * 百炼知识库文档状态
 * @description 对应百炼API的DocumentStatus枚举
 */
export type BailianDocumentStatus = 'INSERT_ERROR' | 'RUNNING' | 'DELETED' | 'FINISH';

/**
 * 文档状态映射（前端展示用）
 */
export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'deleted';

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
 * 重排序配置
 * @description 用于 Rerank 参数，官方API要求为数组对象格式
 */
export interface RerankConfig {
  /** 相似度阈值 (0.01-1.00)，优先级大于知识库配置 */
  minScore?: number;
  /** 重排序后返回数量 (1-20，默认5) */
  topN?: number;
}

/**
 * 多轮对话改写配置
 * @description 用于 Rewrite 参数
 */
export interface RewriteConfig {
  /** 改写提示词模板 */
  promptTemplate?: string;
}

/**
 * 对话历史项
 */
export interface QueryHistoryItem {
  /** 角色 */
  role: 'user' | 'assistant';
  /** 内容 */
  content: string;
}

/**
 * 检索配置
 * @description 完整的百炼检索配置，符合官方API规范
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-retrieve
 */
export interface RetrievalConfig {
  // ========== 必填参数 ==========
  /** 查询文本 */
  query: string;
  /** 知识库ID列表 (SDK只支持单个，取第一个) */
  knowledgeBaseIds: string[];
  
  // ========== 检索控制参数 ==========
  /** 向量检索数量 (0-100，默认100) */
  denseSimilarityTopK?: number;
  /** 关键词检索数量 (0-100，启用后开启混合检索) */
  sparseSimilarityTopK?: number;
  /** @deprecated 使用 denseSimilarityTopK 代替 */
  topK?: number;
  
  // ========== 重排序控制参数 ==========
  /** 是否启用重排序 (默认true) */
  enableReranking?: boolean;
  /** 重排序配置 (官方数组格式) */
  rerank?: RerankConfig;
  /** 相似度阈值 (0.01-1.00) - 便捷参数，会转换为 rerank.minScore */
  rerankMinScore?: number;
  /** 重排序后返回数量 (1-20，默认5) - 便捷参数，会转换为 rerank.topN */
  rerankTopN?: number;
  
  // ========== 多轮对话参数 ==========
  /** 是否启用查询改写 (默认false) */
  enableRewrite?: boolean;
  /** 多轮对话改写配置 */
  rewrite?: RewriteConfig;
  /** 对话历史 (启用查询改写时有效) */
  queryHistory?: QueryHistoryItem[];
  
  // ========== 标签过滤参数 ==========
  /** 标签过滤 (使用百炼原生 SearchFilters) */
  tags?: string[];
  /** 高级检索过滤器 (支持多条件AND组合) */
  searchFilters?: Array<Record<string, any>>;
  
  // ========== 多模态检索参数 ==========
  /** 图片URL列表 (用于图片检索) */
  images?: string[];
  
  // ========== 历史记录参数 ==========
  /** 是否保存历史文本切片召回测试数据 (默认false) */
  saveRetrieverHistory?: boolean;
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
 * 百炼知识库文档信息
 * @description 完整的百炼文档信息，包含所有官方API返回字段
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindexdocuments
 */
export interface BailianDocument {
  // ========== 基础信息 ==========
  /** 文档ID */
  documentId: string;
  /** 文档名称 */
  documentName: string;
  /** 文件类型 */
  fileType?: string;
  /** 文件大小（字节） */
  sizeInBytes?: number;
  
  // ========== 状态信息 ==========
  /** 文档状态 */
  status: BailianDocumentStatus;
  /** 解析进度 */
  progress?: number;
  /** 错误信息 */
  errorMessage?: string;
  
  // ========== 来源信息 ==========
  /** 数据源类型 */
  sourceType?: string;
  /** 类目ID */
  categoryId?: string;
  /** 文件ID */
  fileId?: string;
  
  // ========== 元数据 ==========
  /** 文档标签 */
  tags?: string[];
  /** 自定义元数据 */
  metadata?: Record<string, any>;
  
  // ========== 时间信息 ==========
  /** 创建时间 */
  gmtCreate?: string;
  /** 修改时间 */
  gmtModified?: string;
}

/**
 * 文档列表查询参数
 * @description 对应百炼API list_index_documents 的请求参数
 */
export interface ListDocumentsParams {
  /** 知识库ID */
  indexId: string;
  /** 文档状态过滤 */
  documentStatus?: BailianDocumentStatus;
  /** 文件名称过滤（不含后缀） */
  documentName?: string;
  /** 是否开启文件名称模糊匹配 */
  enableNameLike?: boolean;
  /** 页码（从1开始） */
  pageNumber?: number;
  /** 每页数量 */
  pageSize?: number;
}

/**
 * 文档列表响应
 */
export interface ListDocumentsResult {
  /** 文档列表 */
  documents: BailianDocument[];
  /** 总数量 */
  totalCount: number;
  /** 当前页码 */
  pageNumber: number;
  /** 每页数量 */
  pageSize: number;
}

/**
 * 文件详情查询参数
 * @description 对应百炼API list_index_file_details 的请求参数
 */
export interface ListFileDetailsParams {
  /** 知识库ID */
  indexId: string;
  /** 文档状态过滤 */
  documentStatus?: BailianDocumentStatus;
  /** 文件名称过滤 */
  documentName?: string;
  /** 是否开启文件名称模糊匹配 */
  enableNameLike?: boolean;
  /** 页码（从1开始） */
  pageNumber?: number;
  /** 每页数量（最大10） */
  pageSize?: number;
}

/**
 * 文件详情信息
 * @description 包含分块配置等详细信息的文档
 */
export interface FileDetail {
  // ========== 基础信息 ==========
  /** 文档ID */
  id: string;
  /** 文档名称 */
  name: string;
  /** 文档类型 */
  documentType?: string;
  /** 文件大小（字节） */
  size?: number;
  /** 文件类型（后缀） */
  fileType?: string;
  
  // ========== 下载信息 ==========
  /** 解析结果下载链接 */
  parseResultDownloadUrl?: string;
  
  // ========== 状态信息 ==========
  /** 文档状态 */
  status: BailianDocumentStatus;
  /** 状态码 */
  code?: string;
  /** 错误信息 */
  message?: string;
  
  // ========== 分块配置 ==========
  /** 分块模式 */
  chunkMode?: string;
  /** 分块大小 */
  chunkSize?: string;
  /** 重叠大小 */
  overlapSize?: string;
  /** 分隔符 */
  separator?: string;
  /** 是否启用表头 */
  enableHeaders?: string;
  
  // ========== 来源信息 ==========
  /** 来源ID */
  sourceId?: string;
  
  // ========== 时间信息 ==========
  /** 创建时间 */
  gmtCreate?: string;
  /** 修改时间（时间戳） */
  gmtModified?: number;
}

/**
 * 文件详情列表结果
 */
export interface ListFileDetailsResult {
  /** 文件详情列表 */
  documents: FileDetail[];
  /** 知识库ID */
  indexId?: string;
  /** 总数量 */
  totalCount: number;
  /** 当前页码 */
  pageNumber: number;
  /** 每页数量 */
  pageSize: number;
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

/**
 * 文档预览信息
 */
export interface DocumentPreview {
  /** 预览类型（如 pdf、image 等） */
  previewType: string;
  /** 文档标题 */
  title: string;
  /** 上传时间 */
  uploadTime: string;
  /** 文档预览URL */
  url: string;
}

/**
 * 数据中心文件信息
 * @description 来自 ListFile API 的文件信息
 */
export interface DataCenterFile {
  /** 文件ID */
  fileId: string;
  /** 文件名 */
  fileName: string;
  /** 文件类型（后缀） */
  fileType?: string;
  /** 文件大小（字节） */
  sizeInBytes?: number;
  /** 类目ID */
  categoryId?: string;
  /** 解析器类型 */
  parser?: string;
  /** 文件状态 */
  status?: string;
  /** 标签列表 */
  tags?: string[];
  /** 创建时间 */
  createTime?: string;
}

/**
 * 数据中心文件列表参数
 */
export interface ListDataCenterFilesParams {
  /** 类目ID */
  categoryId?: string;
  /** 文件名（精确匹配） */
  fileName?: string;
  /** 分页Token */
  nextToken?: string;
  /** 每页数量（1-200） */
  maxResults?: number;
  /** 标签过滤（客户端过滤） */
  tags?: string[];
}

/**
 * 数据中心文件列表结果
 */
export interface ListDataCenterFilesResult {
  /** 文件列表 */
  files: DataCenterFile[];
  /** 是否有下一页 */
  hasNext: boolean;
  /** 下一页Token */
  nextToken?: string;
  /** 总数量 */
  totalCount?: number;
  /** 当前页数量 */
  maxResults: number;
}
