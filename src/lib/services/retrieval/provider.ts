/**
 * 知识库引擎 Provider 模块
 * @description 读取 active_provider 配置，获取对应引擎配置，提供统一的引擎分发能力
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

/** 支持的知识库引擎类型 */
export type KnowledgeProvider = 'bailian' | 'ima';

/** 百炼引擎配置 */
export interface BailianProviderConfig {
  accessKeyId: string;
  accessKeySecret: string;
  workspaceId: string;
  region?: string;
  apiBaseUrl?: string;
}

/** IMA 引擎配置 */
export interface IMAProviderConfig {
  apiKey: string;
  clientId: string;
  knowledgeBaseId?: string;
}

/** 引擎配置联合类型 */
export type ProviderConfig = BailianProviderConfig | IMAProviderConfig;

/**
 * 获取当前激活的知识库引擎
 * @returns 'bailian' | 'ima'，默认 'bailian'
 */
export async function getActiveProvider(): Promise<KnowledgeProvider> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('system_settings')
      .select('value')
      .eq('category', 'knowledge_provider')
      .eq('key', 'active_provider')
      .single();

    if (error || !data?.value) {
      return 'bailian'; // 默认使用百炼
    }

    const provider = data.value as KnowledgeProvider;
    return provider === 'ima' ? 'ima' : 'bailian';
  } catch (error) {
    console.error('[Provider] 获取活跃引擎失败:', error);
    return 'bailian';
  }
}

/**
 * 设置当前激活的知识库引擎
 */
export async function setActiveProvider(provider: KnowledgeProvider): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getSupabaseClient();
    const now = new Date().toISOString();

    const { error } = await client
      .from('system_settings')
      .upsert({
        category: 'knowledge_provider',
        key: 'active_provider',
        value: provider,
        updated_at: now,
        description: '当前激活的知识库引擎',
        is_secret: false,
      }, { onConflict: 'category,key' });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: '设置引擎失败' };
  }
}

/**
 * 获取百炼引擎配置
 */
export async function getBailianProviderConfig(): Promise<BailianProviderConfig> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('system_settings')
    .select('key, value')
    .eq('category', 'bailian');

  if (error || !data) {
    throw new Error('获取百炼配置失败');
  }

  const configMap: Record<string, string> = {};
  for (const item of data) {
    configMap[item.key] = item.value || '';
  }

  return {
    accessKeyId: configMap.access_key_id || '',
    accessKeySecret: configMap.access_key_secret || '',
    workspaceId: configMap.workspace_id || '',
    region: configMap.region || 'cn-beijing',
    apiBaseUrl: configMap.api_base_url || '',
  };
}

/**
 * 获取IMA引擎配置
 */
export async function getIMAProviderConfig(): Promise<IMAProviderConfig> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('system_settings')
    .select('key, value')
    .eq('category', 'ima');

  if (error || !data) {
    throw new Error('获取IMA配置失败');
  }

  const configMap: Record<string, string> = {};
  for (const item of data) {
    configMap[item.key] = item.value || '';
  }

  return {
    apiKey: configMap.api_key || '',
    clientId: configMap.client_id || configMap.app_id || '',
    knowledgeBaseId: configMap.knowledge_base_id || '',
  };
}

/**
 * 获取当前激活引擎的配置
 */
export async function getActiveProviderConfig(): Promise<ProviderConfig> {
  const provider = await getActiveProvider();
  if (provider === 'ima') {
    return getIMAProviderConfig();
  }
  return getBailianProviderConfig();
}

/**
 * 检查当前引擎配置是否完整
 */
export async function validateActiveProviderConfig(): Promise<{ valid: boolean; provider: KnowledgeProvider; missingFields: string[] }> {
  const provider = await getActiveProvider();
  
  if (provider === 'ima') {
    const config = await getIMAProviderConfig();
    const missingFields: string[] = [];
    if (!config.apiKey) missingFields.push('API Key');
    if (!config.clientId) missingFields.push('Client ID');
    return { valid: missingFields.length === 0, provider, missingFields };
  } else {
    const config = await getBailianProviderConfig();
    const missingFields: string[] = [];
    if (!config.accessKeyId) missingFields.push('Access Key ID');
    if (!config.accessKeySecret) missingFields.push('Access Key Secret');
    return { valid: missingFields.length === 0, provider, missingFields };
  }
}
