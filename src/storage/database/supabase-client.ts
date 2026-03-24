import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

let envLoaded = false;
let cachedCredentials: SupabaseCredentials | null = null;
let credentialsLoadedFromDB = false;

// 客户端实例缓存（单例模式）
let cachedClient: SupabaseClient | null = null;
let cachedClientKey: string | null = null;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * 环境变量加载状态追踪
 */
let envLoadPromise: Promise<void> | null = null;
let envLoadAttempted = false;

/**
 * 异步加载环境变量（非阻塞）
 * 返回 Promise，允许调用者等待或继续执行
 */
async function loadEnvAsync(): Promise<void> {
  // 已经加载成功
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    return;
  }

  // 正在加载中，返回现有的 Promise
  if (envLoadPromise) {
    return envLoadPromise;
  }

  // 已经尝试过但失败了，不再重试
  if (envLoadAttempted) {
    return;
  }

  envLoadPromise = (async () => {
    try {
      // 尝试使用 dotenv
      try {
        require('dotenv').config();
        if (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) {
          envLoaded = true;
          return;
        }
      } catch {
        // dotenv not available
      }

      // 使用 spawn 异步执行 Python（非阻塞）
      const { spawn } = await import('child_process');
      
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

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn('python3', ['-c', pythonCode], {
          timeout: 10000,
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            resolve(stdout); // 即使有错误也返回 stdout
          }
        });
        
        proc.on('error', (err) => {
          resolve(''); // 失败时返回空字符串
        });
        
        // 设置超时
        setTimeout(() => {
          proc.kill();
          resolve(stdout);
        }, 10000);
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
    } finally {
      envLoadAttempted = true;
    }
  })();

  return envLoadPromise;
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
 * 获取 Supabase 客户端（单例模式，复用客户端实例）
 * 对于带 token 的情况，仍然创建新实例（因为每个用户 token 不同）
 */
function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey, serviceRoleKey } = getSupabaseCredentials();

  // 服务端优先使用 service_role_key（绕过RLS）
  const key = serviceRoleKey || anonKey;

  // 带 token 的情况，创建独立客户端（每个用户 token 不同）
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

  // 无 token 情况，使用单例缓存
  const clientKey = `${url}:${key}`;
  
  // 检查缓存是否有效
  if (cachedClient && cachedClientKey === clientKey) {
    return cachedClient;
  }

  // 创建新的客户端实例并缓存
  cachedClient = createClient(url, key, {
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  cachedClientKey = clientKey;
  
  return cachedClient;
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
 * 同时清除客户端实例缓存
 */
function clearCredentialsCache(): void {
  cachedCredentials = null;
  credentialsLoadedFromDB = false;
  // 清除客户端实例缓存，下次请求将创建新实例
  cachedClient = null;
  cachedClientKey = null;
}

/**
 * 更新凭据缓存（用于切换数据库时直接设置新配置）
 * 这会立即更新内存中的缓存，无需从数据库读取
 */
function updateCredentialsCache(credentials: SupabaseCredentials): void {
  cachedCredentials = credentials;
  credentialsLoadedFromDB = true;
  // 清除客户端实例缓存，下次请求将使用新配置创建
  cachedClient = null;
  cachedClientKey = null;
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
  loadEnvAsync,
  getSupabaseCredentials, 
  getSupabaseClient,
  initSupabaseConfig,
  clearCredentialsCache,
  updateCredentialsCache,
  createCustomClient
};
