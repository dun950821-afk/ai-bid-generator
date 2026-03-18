/**
 * LLM 统一配置文件
 * 集中管理所有大语言模型相关的配置
 */

/**
 * 模型类型
 */
export type ModelType = 
  | 'thinking'     // 思考模型（用于复杂推理）
  | 'standard'     // 标准模型（用于一般任务）
  | 'fast';        // 快速模型（用于简单任务）

/**
 * LLM 配置接口
 */
export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  enableThinking: boolean;
  timeout?: number;
  retries?: number;
}

/**
 * 模型配置映射
 */
export const MODEL_CONFIGS: Record<ModelType, LLMConfig> = {
  thinking: {
    model: 'doubao-seed-1-6-thinking-250715',
    temperature: 0.5,
    maxTokens: 16384,
    enableThinking: true,
    timeout: 120000, // 2分钟
    retries: 2,
  },
  standard: {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.7,
    maxTokens: 16384,
    enableThinking: false,
    timeout: 60000, // 1分钟
    retries: 2,
  },
  fast: {
    model: 'doubao-seed-1-6-flash-250628',
    temperature: 0.7,
    maxTokens: 8192,
    enableThinking: false,
    timeout: 30000, // 30秒
    retries: 1,
  },
};

/**
 * 任务类型到模型类型的映射
 */
export const TASK_MODEL_MAPPING: Record<string, ModelType> = {
  // 思考模型任务
  'outline_generation': 'thinking',
  'complex_analysis': 'thinking',
  'strategy_planning': 'thinking',
  
  // 标准模型任务
  'content_generation': 'standard',
  'extraction': 'standard',
  'optimization': 'standard',
  'validation': 'standard',
  
  // 快速模型任务
  'simple_extraction': 'fast',
  'quick_summary': 'fast',
  'format_conversion': 'fast',
};

/**
 * 获取任务对应的LLM配置
 */
export function getLLMConfig(taskType: string): LLMConfig {
  const modelType = TASK_MODEL_MAPPING[taskType] || 'standard';
  return MODEL_CONFIGS[modelType];
}

/**
 * 提取任务配置
 */
export const EXTRACTION_CONFIG = {
  // 并发配置
  maxConcurrency: 3,
  taskTimeout: 120000, // 单个提取任务超时：2分钟
  totalTimeout: 300000, // 总超时：5分钟
  
  // 重试配置
  maxRetries: 2,
  retryDelay: 2000, // 重试延迟：2秒
  
  // 分段提取任务列表
  tasks: [
    {
      name: 'basic_info',
      description: '基本信息',
      systemPromptKey: 'basicInfo',
      temperature: 0.5,
      maxTokens: 4096,
    },
    {
      name: 'scoring_criteria',
      description: '评分标准',
      systemPromptKey: 'scoringCriteria',
      temperature: 0.5,
      maxTokens: 8192,
    },
    {
      name: 'qualification_requirements',
      description: '资格要求',
      systemPromptKey: 'qualificationRequirements',
      temperature: 0.5,
      maxTokens: 4096,
    },
    {
      name: 'technical_requirements',
      description: '技术要求',
      systemPromptKey: 'technicalRequirements',
      temperature: 0.5,
      maxTokens: 8192,
    },
    {
      name: 'business_requirements',
      description: '商务要求',
      systemPromptKey: 'businessRequirements',
      temperature: 0.5,
      maxTokens: 4096,
    },
    {
      name: 'disqualification_risks',
      description: '废标风险',
      systemPromptKey: 'disqualificationRisks',
      temperature: 0.5,
      maxTokens: 4096,
    },
    {
      name: 'submission_requirements',
      description: '递交要求',
      systemPromptKey: 'submissionRequirements',
      temperature: 0.5,
      maxTokens: 4096,
    },
    {
      name: 'contact_info',
      description: '联系方式',
      systemPromptKey: 'contactInfo',
      temperature: 0.5,
      maxTokens: 2048,
    },
    {
      name: 'attachments',
      description: '附件要求',
      systemPromptKey: 'attachments',
      temperature: 0.5,
      maxTokens: 4096,
    },
  ],
};

/**
 * RAG 检索配置
 */
export const RAG_CONFIG = {
  // 检索配置
  topK: 5,
  minScore: 0.6,
  maxContextLength: 2000,
  
  // 分块配置
  chunkSize: 500,
  chunkOverlap: 50,
  
  // 缓存配置
  cacheEnabled: true,
  cacheTTL: 3600000, // 1小时
};

/**
 * 限流配置
 */
export const RATE_LIMIT_CONFIG = {
  // LLM调用限流
  llmCalls: {
    maxRequests: 60,
    windowMs: 60000, // 每分钟60次
  },
  
  // 文件上传限流
  fileUpload: {
    maxRequests: 20,
    windowMs: 60000, // 每分钟20次
  },
  
  // API请求限流
  apiRequests: {
    maxRequests: 100,
    windowMs: 60000, // 每分钟100次
  },
};
