import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

let envLoaded = false;
let cachedCredentials: SupabaseCredentials | null = null;
let credentialsLoadedFromDB = false;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

function loadEnv(): void {
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    return;
  }

  try {
    try {
      require('dotenv').config();
      if (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

function getEnvCredentials(): SupabaseCredentials {
  loadEnv();

  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('COZE_SUPABASE_URL is not set');
  }
  if (!anonKey) {
    throw new Error('COZE_SUPABASE_ANON_KEY is not set');
  }

  return { url, anonKey, serviceRoleKey };
}

/**
 * 从数据库加载 Supabase 配置（如果已配置且开关开启）
 * 使用环境变量作为初始连接，然后读取用户配置
 */
async function loadCredentialsFromDB(): Promise<SupabaseCredentials | null> {
  if (credentialsLoadedFromDB) {
    return cachedCredentials;
  }

  try {
    // 先使用环境变量创建临时客户端
    const envCreds = getEnvCredentials();
    const tempClient = createClient(envCreds.url, envCreds.serviceRoleKey || envCreds.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 查询开关配置
    const { data: switchData, error: switchError } = await tempClient
      .from('system_settings')
      .select('value')
      .eq('category', 'supabase')
      .eq('key', 'use_custom_config')
      .single();

    // 如果开关未开启或查询失败，使用环境变量
    if (switchError || switchData?.value !== 'true') {
      console.log('[Supabase] 使用环境变量配置（开关未开启）');
      credentialsLoadedFromDB = true;
      return null;
    }

    // 开关已开启，查询用户配置的 Supabase 凭据
    const { data, error } = await tempClient
      .from('system_settings')
      .select('key, value')
      .eq('category', 'supabase')
      .in('key', ['url', 'anon_key', 'service_role_key']);

    if (error || !data || data.length === 0) {
      credentialsLoadedFromDB = true;
      return null;
    }

    const settingsMap = new Map(data.map(item => [item.key, item.value]));
    const url = settingsMap.get('url');
    const anonKey = settingsMap.get('anon_key');
    const serviceRoleKey = settingsMap.get('service_role_key');

    if (url && anonKey) {
      cachedCredentials = { url, anonKey, serviceRoleKey: serviceRoleKey || undefined };
      console.log('[Supabase] 使用数据库配置:', url);
    }

    credentialsLoadedFromDB = true;
    return cachedCredentials;
  } catch (error) {
    console.error('[Supabase] 从数据库加载配置失败:', error);
    credentialsLoadedFromDB = true;
    return null;
  }
}

/**
 * 获取 Supabase 凭据
 * 优先级：数据库配置 > 环境变量
 */
function getSupabaseCredentials(): SupabaseCredentials {
  // 如果已经从数据库加载过配置，使用缓存的
  if (cachedCredentials) {
    return cachedCredentials;
  }
  // 否则使用环境变量
  return getEnvCredentials();
}

/**
 * 获取 Supabase 客户端（同步版本，使用缓存或环境变量）
 */
function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey, serviceRoleKey } = getSupabaseCredentials();

  // 服务端优先使用 service_role_key（绕过RLS）
  const key = serviceRoleKey || anonKey;

  if (token) {
    return createClient(url, key, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      db: {
        timeout: 60000,
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return createClient(url, key, {
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * 初始化并加载 Supabase 配置
 * 应在服务启动时调用
 */
async function initSupabaseConfig(): Promise<void> {
  await loadCredentialsFromDB();
}

/**
 * 清除配置缓存（用于配置更新后刷新）
 */
function clearCredentialsCache(): void {
  cachedCredentials = null;
  credentialsLoadedFromDB = false;
}

/**
 * 更新凭据缓存（用于切换数据库时直接设置新配置）
 * 这会立即更新内存中的缓存，无需从数据库读取
 */
function updateCredentialsCache(credentials: SupabaseCredentials): void {
  cachedCredentials = credentials;
  credentialsLoadedFromDB = true;
  console.log('[Supabase] 缓存已更新:', credentials.url);
}

/**
 * 创建自定义 Supabase 客户端（用于测试连接）
 */
function createCustomClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    db: { timeout: 30000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { 
  loadEnv, 
  getSupabaseCredentials, 
  getSupabaseClient,
  initSupabaseConfig,
  clearCredentialsCache,
  updateCredentialsCache,
  createCustomClient
};
