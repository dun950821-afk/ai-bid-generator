/**
 * 统一配置管理服务
 * @description 提供统一的配置获取、缓存和管理功能
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// =====================================================
// 类型定义
// =====================================================

/**
 * 配置类别
 */
export type ConfigCategory = 'bailian' | 'llm' | 'supabase' | 'storage' | 'embedding';

/**
 * 配置项
 */
export interface ConfigItem {
  key: string;
  value: string | null;
}

/**
 * 百炼配置
 */
export interface BailianConfig {
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
 * LLM配置
 */
export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Supabase配置
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  region?: string;
}

// =====================================================
// 配置缓存
// =====================================================

// 配置缓存
const configCache = new Map<string, { data: any; timestamp: number }>();
// 默认缓存时间：5分钟
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

// =====================================================
// 配置服务类
// =====================================================

/**
 * 配置服务类
 */
export class ConfigService {
  /**
   * 获取配置（带缓存）
   */
  static async getConfig<T>(
    category: ConfigCategory,
    useCache = true,
    cacheTTL = DEFAULT_CACHE_TTL
  ): Promise<T | null> {
    // 检查缓存
    if (useCache) {
      const cached = configCache.get(category);
      if (cached && Date.now() - cached.timestamp < cacheTTL) {
        return cached.data;
      }
    }

    // 从数据库加载
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('system_settings')
      .select('key, value')
      .eq('category', category);

    if (error) {
      console.error(`[ConfigService] 获取配置失败 (${category}):`, error);
      // 返回缓存（如果有）
      const cached = configCache.get(category);
      return cached?.data || null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // 解析配置
    const config = this.parseConfig<T>(category, data);
    
    // 更新缓存
    configCache.set(category, {
      data: config,
      timestamp: Date.now(),
    });

    return config;
  }

  /**
   * 解析配置
   */
  private static parseConfig<T>(category: ConfigCategory, items: ConfigItem[]): T {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.value) {
        map.set(item.key, item.value);
      }
    }

    switch (category) {
      case 'bailian':
        return this.parseBailianConfig(map) as T;
      case 'llm':
        return this.parseLLMConfig(map) as T;
      case 'supabase':
        return this.parseSupabaseConfig(map) as T;
      case 'storage':
        return this.parseStorageConfig(map) as T;
      default:
        return Object.fromEntries(map) as T;
    }
  }

  /**
   * 解析百炼配置
   */
  private static parseBailianConfig(map: Map<string, string>): BailianConfig {
    return {
      accessKeyId: map.get('access_key_id') || '',
      accessKeySecret: map.get('access_key_secret') || '',
      workspaceId: map.get('workspace_id') || '',
      endpoint: map.get('endpoint') || 'bailian.cn-beijing.aliyuncs.com',
      regionId: map.get('region_id') || 'cn-beijing',
      defaultEmbeddingModel: map.get('default_embedding_model') || 'text-embedding-v4',
      defaultRerankModel: map.get('default_rerank_model') || 'qwen3-rerank-hybrid',
      defaultChunkSize: parseInt(map.get('default_chunk_size') || '500'),
      defaultOverlapSize: parseInt(map.get('default_overlap_size') || '100'),
      defaultRerankMinScore: parseFloat(map.get('default_rerank_min_score') || '0.01'),
      defaultParser: map.get('default_parser') || 'DOCUMENT_UNDERSTANDING_LLM',
      parserTimeout: parseInt(map.get('parser_timeout') || '600000'),
    };
  }

  /**
   * 解析LLM配置
   */
  private static parseLLMConfig(map: Map<string, string>): LLMConfig {
    return {
      apiUrl: map.get('api_url') || process.env.LLM_API_URL || '',
      apiKey: map.get('api_key') || process.env.LLM_API_KEY || '',
      model: map.get('model') || 'qwen3-max',
      temperature: parseFloat(map.get('temperature') || '0.7'),
      maxTokens: parseInt(map.get('max_tokens') || '8192'),
    };
  }

  /**
   * 解析Supabase配置
   */
  private static parseSupabaseConfig(map: Map<string, string>): SupabaseConfig {
    return {
      url: map.get('url') || process.env.COZE_SUPABASE_URL || '',
      anonKey: map.get('anon_key') || process.env.COZE_SUPABASE_ANON_KEY || '',
      serviceRoleKey: map.get('service_role_key') || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  /**
   * 解析存储配置
   */
  private static parseStorageConfig(map: Map<string, string>): StorageConfig {
    return {
      endpoint: map.get('endpoint') || '',
      bucket: map.get('bucket') || '',
      accessKeyId: map.get('access_key_id') || '',
      accessKeySecret: map.get('access_key_secret') || '',
      region: map.get('region'),
    };
  }

  /**
   * 设置配置
   */
  static async setConfig(category: ConfigCategory, config: Record<string, string>): Promise<boolean> {
    const client = getSupabaseClient();
    
    // 构建更新数据
    const updates = Object.entries(config).map(([key, value]) => ({
      category,
      key,
      value,
    }));

    // 批量更新（使用 upsert）
    const { error } = await client
      .from('system_settings')
      .upsert(updates, { onConflict: 'category,key' });

    if (error) {
      console.error(`[ConfigService] 设置配置失败 (${category}):`, error);
      return false;
    }

    // 清除缓存
    this.invalidateCache(category);
    return true;
  }

  /**
   * 清除配置缓存
   */
  static invalidateCache(category?: ConfigCategory): void {
    if (category) {
      configCache.delete(category);
    } else {
      configCache.clear();
    }
  }

  /**
   * 验证必填配置
   */
  static validateConfig(category: ConfigCategory, config: any): boolean {
    switch (category) {
      case 'bailian':
        return !!(config.accessKeyId && config.accessKeySecret && config.workspaceId);
      case 'llm':
        return !!(config.apiUrl && config.apiKey);
      case 'supabase':
        return !!(config.url && config.anonKey);
      case 'storage':
        return !!(config.endpoint && config.bucket && config.accessKeyId && config.accessKeySecret);
      default:
        return true;
    }
  }
}

// =====================================================
// 便捷函数
// =====================================================

/**
 * 获取百炼配置
 */
export async function getBailianConfig(): Promise<BailianConfig | null> {
  return ConfigService.getConfig<BailianConfig>('bailian');
}

/**
 * 获取LLM配置
 */
export async function getLLMConfig(): Promise<LLMConfig | null> {
  return ConfigService.getConfig<LLMConfig>('llm');
}

/**
 * 获取Supabase配置
 */
export async function getSupabaseConfig(): Promise<SupabaseConfig | null> {
  return ConfigService.getConfig<SupabaseConfig>('supabase');
}

/**
 * 获取存储配置
 */
export async function getStorageConfig(): Promise<StorageConfig | null> {
  return ConfigService.getConfig<StorageConfig>('storage');
}

/**
 * 清除所有配置缓存
 */
export function clearAllConfigCache(): void {
  ConfigService.invalidateCache();
}

/**
 * 清除指定配置缓存
 */
export function clearConfigCache(category: ConfigCategory): void {
  ConfigService.invalidateCache(category);
}
