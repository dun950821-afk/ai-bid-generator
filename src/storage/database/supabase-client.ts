import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

let envLoaded = false;
let cachedCredentials: SupabaseCredentials | null = null;
let credentialsLoadedFromDB = false;
let loadingPromise: Promise<void> | null = null;

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
 * 从数据库加载 Supabase 配置（如果已配置）
 * 使用环境变量作为初始连接，然后读取用户配置
 */
async function loadCredentialsFromDB(): Promise<void> {
  // 如果已经在加载中，等待加载完成
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  // 如果已经加载过，直接返回
  if (credentialsLoadedFromDB) {
    return;
  }

  // 创建加载 Promise
  loadingPromise = (async () => {
    try {
      // 使用环境变量创建临时客户端
      const envCreds = getEnvCredentials();
      const tempClient = createClient(envCreds.url, envCreds.serviceRoleKey || envCreds.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // 查询用户配置的 Supabase 凭据
      const { data, error } = await tempClient
        .from('system_settings')
        .select('key, value')
        .eq('category', 'supabase')
        .in('key', ['url', 'anon_key', 'service_role_key']);

      if (error) {
        console.error('[Supabase] 查询配置失败:', error);
        credentialsLoadedFromDB = true;
        return;
      }

      if (!data || data.length === 0) {
        console.log('[Supabase] 数据库中无配置，使用环境变量');
        credentialsLoadedFromDB = true;
        return;
      }

      const settingsMap = new Map(data.map(item => [item.key, item.value]));
      const url = settingsMap.get('url');
      const anonKey = settingsMap.get('anon_key');
      const serviceRoleKey = settingsMap.get('service_role_key');

      // 检查是否有有效配置
      if (url && anonKey && url.trim() !== '' && anonKey.trim() !== '') {
        cachedCredentials = { 
          url: url.trim(), 
          anonKey: anonKey.trim(), 
          serviceRoleKey: serviceRoleKey?.trim() || undefined 
        };
        console.log('[Supabase] ✅ 已加载数据库配置:', url);
      } else {
        console.log('[Supabase] 数据库配置不完整，使用环境变量');
      }

      credentialsLoadedFromDB = true;
    } catch (error) {
      console.error('[Supabase] 从数据库加载配置失败:', error);
      credentialsLoadedFromDB = true;
    } finally {
      loadingPromise = null;
    }
  })();

  await loadingPromise;
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
 * 注意：首次调用时可能还未从数据库加载配置，需要调用 getSupabaseClientAsync
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
 * 获取 Supabase 客户端（异步版本，会先检查数据库配置）
 * 推荐在 API routes 中使用此版本
 */
async function getSupabaseClientAsync(token?: string): Promise<SupabaseClient> {
  // 先尝试从数据库加载配置
  await loadCredentialsFromDB();
  
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
 * 应在服务启动时或每次请求开始时调用
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
  loadingPromise = null;
  console.log('[Supabase] 配置缓存已清除');
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
  getSupabaseClientAsync,
  initSupabaseConfig,
  clearCredentialsCache,
  createCustomClient
};
