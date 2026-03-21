/**
 * 增强检索类型定义
 * @description 定义深度查询、全量检索、上下文增强相关类型
 */

// =====================================================
// 基础类型
// =====================================================

/**
 * 查询类型
 */
export type QueryType = 
  | 'topic'        // 章节主题
  | 'scoring_item' // 评分项
  | 'scoring_rule' // 评分细则
  | 'case_study'   // 实施案例
  | 'metrics'      // 数据指标
  | 'risk'         // 风险规避
  | 'writing_note' // 编写注意点
  | 'regulation';  // 法规标准

/**
 * 查询项
 */
export interface QueryItem {
  /** 查询ID */
  id: string;
  /** 查询文本 */
  query: string;
  /** 查询目的 */
  purpose: string;
  /** 查询类型 */
  type: QueryType;
  /** 权重 */
  weight: number;
  /** 关联的评分项ID */
  scoringItemId?: string;
  /** 关联的评分细则索引 */
  ruleIndex?: number;
  /** 关联的风险ID */
  riskId?: string;
}

/**
 * 查询计划
 */
export interface QueryPlan {
  /** 总查询数 */
  totalQueries: number;
  /** 查询列表 */
  queries: QueryItem[];
  /** 元数据 */
  metadata: {
    sectionId: string;
    scoringItemCount: number;
    riskCount: number;
    generatedAt: string;
  };
}

// =====================================================
// 检索结果类型
// =====================================================

/**
 * 增强的检索结果块
 */
export interface EnhancedChunk {
  /** 文本内容 */
  content: string;
  /** 文档ID */
  documentId: string;
  /** 文档名称 */
  documentName: string;
  /** 相似度得分 */
  score: number;
  /** 页码 */
  pageNumber?: number;
  /** 层级标题 */
  hierTitle?: string;
  /** 切片ID */
  chunkId?: string;
  /** 元数据 */
  metadata?: Record<string, any>;
  
  // ===== 增强字段 =====
  /** RRF分数 */
  rrfScore: number;
  /** 最高得分 */
  maxScore: number;
  /** 来源查询列表 */
  sourceQueries: SourceQuery[];
  /** 关联的评分项ID列表 */
  scoringItemIds: string[];
  /** 查询类型列表 */
  queryTypes: QueryType[];
}

/**
 * 来源查询信息
 */
export interface SourceQuery {
  /** 查询ID */
  queryId: string;
  /** 查询目的 */
  purpose: string;
  /** 排名 */
  rank: number;
  /** 得分 */
  score: number;
}

/**
 * 检索查询结果
 */
export interface RetrievalQueryResult {
  /** 查询ID */
  queryId: string;
  /** 查询目的 */
  queryPurpose: string;
  /** 查询类型 */
  queryType: QueryType;
  /** 关联的评分项ID */
  scoringItemId?: string;
  /** 权重 */
  weight: number;
  /** 结果列表 */
  results: EnhancedChunk[];
}

// =====================================================
// 全量检索结果类型
// =====================================================

/**
 * 全量检索结果
 */
export interface FullRetrievalResult {
  /** 总查询数 */
  totalQueries: number;
  /** 原始结果数量 */
  rawResultCount: number;
  /** 融合后结果数量 */
  fusedResultCount: number;
  /** 最终结果数量 */
  finalResultCount: number;
  /** 按评分项分组的结果 */
  groupedChunks: Map<string, EnhancedChunk[]>;
  /** 所有结果 */
  allChunks: EnhancedChunk[];
}

// =====================================================
// 上下文增强类型
// =====================================================

/**
 * 带上下文的增强块
 */
export interface EnhancedChunkWithContext extends EnhancedChunk {
  /** 原始内容 */
  originalContent: string;
  /** 增强内容 */
  enhancedContent: string;
  /** 周围上下文 */
  surroundingContext?: {
    before: string;
    after: string;
  };
  /** 元数据 */
  metadata: {
    documentName: string;
    documentId: string;
    pageNumber?: number;
    hierTitle?: string;
    chunkId?: string;
  };
  /** 引用ID */
  citationId: string;
  /** 是否包含图片 */
  hasImages?: boolean;
  /** 图片URL列表 */
  imageUrls?: string[];
}

/**
 * 上下文增强选项
 */
export interface ContextEnhancementOptions {
  /** 是否包含周围上下文 */
  includeSurroundingContext?: boolean;
  /** 上下文窗口字符数 */
  contextWindowChars?: number;
  /** 是否包含元数据 */
  includeMetadata?: boolean;
  /** 是否包含图片 */
  includeImages?: boolean;
}

/**
 * 上下文增强结果
 */
export interface EnhancedContextResult {
  /** 增强后的块列表 */
  chunks: EnhancedChunkWithContext[];
  /** 总Token数 */
  totalTokens: number;
  /** 格式化上下文 */
  formatteContext: string;
}

// =====================================================
// Prompt构建类型
// =====================================================

/**
 * 结构化Prompt
 */
export interface StructuredPrompt {
  /** 系统消息 */
  systemMessage: string;
  /** 上下文消息 */
  contextMessage: string;
  /** 要求消息 */
  requirementsMessage: string;
  /** 用户消息 */
  userMessage: string;
  /** 元数据 */
  metadata: {
    totalScore: number;
    estimatedWords: number;
    scoringItemCount: number;
    riskCount: number;
    contextTokenCount: number;
  };
}

// =====================================================
// 章节数据类型
// =====================================================

/**
 * 内容指导信息
 */
export interface ContentGuide {
  /** 编写要点 */
  mainPoints: string[];
  /** 素材建议 */
  materialSuggestions: string[];
  /** 知识库检索关键词 */
  knowledgeBaseQueries: string[];
}

/**
 * 章节信息
 */
export interface Section {
  id: string;
  title: string;
  level?: number;
  order?: number;
  /** 完整章节编号（如 "一、"、"2.1"、"2.1.1"） */
  fullNumber?: string;
  scoringItemIds?: string[];
  /** 内容指导信息 - 用于生成更精准的查询 */
  contentGuide?: ContentGuide;
  /** 子章节 */
  children?: Section[];
}

/**
 * 评分项
 */
export interface ScoringItem {
  id: string;
  item_name: string;
  max_score: number;
  scoring_rules?: Array<string | {
    description: string;
    score?: number;
  }>;
}

/**
 * 风险因素
 */
export interface Risk {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  risk_description: string;
  keywords?: string[];
}

/**
 * 章节准备数据
 */
export interface SectionPrepData {
  section: Section;
  scoringItems: ScoringItem[];
  risks: Risk[];
  writingNotes: string[];
}

// =====================================================
// 引用类型
// =====================================================

/**
 * 引用信息
 */
export interface Citation {
  id: string;
  citationId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  citedText: string;
  sourceText: string;
  relevanceScore: number;
  pageNumber?: number;
  hierTitle?: string;
  startOffset?: number;
  endOffset?: number;
}

// =====================================================
// LLM生成类型
// =====================================================

/**
 * LLM生成选项
 */
export interface LLMGenerationOptions {
  /** 模型名称 */
  model: string;
  /** 消息列表 */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  /** 温度 */
  temperature?: number;
  /** 最大Token */
  maxTokens?: number;
  /** 是否流式 */
  stream?: boolean;
}

/**
 * LLM生成结果
 */
export interface LLMGenerationResult {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// =====================================================
// 检索配置类型
// =====================================================

/**
 * 高级检索配置
 */
export interface AdvancedRetrievalConfig {
  /** 向量检索数量 (0-100) */
  denseSimilarityTopK: number;
  /** 关键词检索数量 (0-100) */
  sparseSimilarityTopK: number;
  /** 是否启用重排序 */
  enableReranking: boolean;
  /** 重排序阈值 */
  rerankMinScore: number;
  /** 每文档保留片段数上限 */
  maxChunksPerDocument: number;
  /** 总保留片段数上限 */
  maxTotalChunks: number;
}

/**
 * 默认检索配置
 */
export const DEFAULT_RETRIEVAL_CONFIG: AdvancedRetrievalConfig = {
  denseSimilarityTopK: 100,
  sparseSimilarityTopK: 100,
  enableReranking: true,
  rerankMinScore: 0.15,
  maxChunksPerDocument: 10,
  maxTotalChunks: 300,
};
