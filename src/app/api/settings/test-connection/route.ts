import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, createCustomClient, clearCredentialsCache } from '@/storage/database/supabase-client';

/**
 * 获取真实的密钥值
 * 如果传入的值是遮盖值(******)，则从数据库获取真实值
 */
async function getRealSecretValue(
  category: string, 
  key: string, 
  maskedValue: string
): Promise<string | null> {
  // 如果不是遮盖值，直接返回
  if (maskedValue && maskedValue !== '******') {
    return maskedValue;
  }
  
  // 从数据库获取真实值
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('system_settings')
    .select('value')
    .eq('category', category)
    .eq('key', key)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data.value;
}

/**
 * 解析设置，将遮盖值替换为真实值
 */
async function resolveSecretSettings(
  category: string,
  settings: Record<string, string>
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const secretKeys = getSecretKeys(category);
  
  for (const [key, value] of Object.entries(settings)) {
    if (secretKeys.includes(key) && (!value || value === '******')) {
      // 密钥字段且值为遮盖值，从数据库获取
      const realValue = await getRealSecretValue(category, key, value);
      resolved[key] = realValue || '';
    } else {
      resolved[key] = value || '';
    }
  }
  
  return resolved;
}

/**
 * 获取各分类的密钥字段列表
 */
function getSecretKeys(category: string): string[] {
  const secretKeysMap: Record<string, string[]> = {
    llm: ['api_key'],
    supabase: ['anon_key', 'service_role_key'],
    storage: ['access_key', 'secret_key'],
    bailian: ['access_key_id', 'access_key_secret'],
  };
  return secretKeysMap[category] || [];
}

// 判断是否为阿里云百炼 Responses API
function isAliyunResponsesAPI(apiUrl: string): boolean {
  return apiUrl.includes('dashscope.aliyuncs.com/api/v2') || 
         apiUrl.includes('dashscope-intl.aliyuncs.com/api/v2');
}

// 测试阿里云百炼 Responses API
async function testAliyunResponsesAPI(settings: Record<string, string>) {
  const apiKey = settings.api_key;
  if (!apiKey) {
    return { success: false, error: 'API密钥未配置' };
  }

  const apiUrl = settings.api_url || 'https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1';
  const endpoint = apiUrl.replace(/\/$/, '') + '/responses';
  
  const model = settings.model || 'qwen3.5-plus';
  const enableThinking = settings.enable_thinking === 'true';
  const thinkingBudget = parseInt(settings.thinking_budget || '8192');
  
  // 构建内置工具列表
  const tools: Array<{ type: string }> = [];
  if (settings.enable_web_search === 'true') {
    tools.push({ type: 'web_search' });
  }
  if (settings.enable_code_interpreter === 'true') {
    tools.push({ type: 'code_interpreter' });
  }
  if (settings.enable_web_extractor === 'true') {
    tools.push({ type: 'web_extractor' });
  }

  // 构建请求体 - 使用 Responses API 格式
  const requestBody: Record<string, unknown> = {
    model: model,
    input: '你好，请简单介绍一下自己',
  };

  // 思考模式参数（需要在 extra_body 中传递）
  if (enableThinking) {
    requestBody.enable_thinking = true;
  }

  // 内置工具
  if (tools.length > 0) {
    requestBody.tools = tools;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (response.ok) {
    const data = await response.json();
    
    // 构建成功消息
    let message = `LLM连接正常，模型: ${model}`;
    
    if (enableThinking) {
      message += `，思考模式: 已开启`;
      // 检查响应中是否包含思考内容
      if (data.output?.some((item: { type: string }) => item.type === 'reasoning')) {
        message += ' ✓ 思考内容已返回';
      }
    }
    
    if (tools.length > 0) {
      message += `，内置工具: ${tools.map(t => t.type).join(', ')}`;
    }
    
    return { success: true, message };
  } else {
    const errorText = await response.text();
    let errorMsg = `连接失败: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.message || errorJson.error?.message || errorMsg;
      
      if (errorMsg.includes('free tier') || errorMsg.includes('exhausted')) {
        errorMsg = 'API密钥有效，但免费额度已用完，请充值后使用';
      }
    } catch {
      // 无法解析JSON，使用原始文本
    }
    return { success: false, error: errorMsg };
  }
}

// 测试传统 Chat Completions API
async function testChatCompletionsAPI(settings: Record<string, string>) {
  const apiKey = settings.api_key;
  if (!apiKey) {
    return { success: false, error: 'API密钥未配置' };
  }

  let apiUrl = settings.api_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  if (!apiUrl.includes('/chat/completions')) {
    apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
  }

  const model = settings.model || 'qwen-plus';
  const enableThinking = settings.enable_thinking === 'true';

  const requestBody: Record<string, unknown> = {
    model: model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: '你好，请简单介绍一下自己' }
    ],
    max_tokens: 50,
  };

  if (enableThinking) {
    requestBody.enable_thinking = true;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (response.ok) {
    const data = await response.json();
    
    let message = `LLM连接正常，模型: ${model}`;
    if (enableThinking) {
      message += `，思考模式: 已开启`;
      if (data.choices?.[0]?.message?.reasoning_content) {
        message += ' ✓ 思考内容已返回';
      }
    }
    
    return { success: true, message };
  } else {
    const errorText = await response.text();
    let errorMsg = `连接失败: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.message || errorJson.error?.message || errorMsg;
      
      if (errorMsg.includes('free tier') || errorMsg.includes('exhausted')) {
        errorMsg = 'API密钥有效，但免费额度已用完，请充值后使用';
      }
    } catch {
      // 无法解析JSON，使用原始文本
    }
    return { success: false, error: errorMsg };
  }
}

// 测试LLM连接（自动识别 API 类型）
async function testLLMConnection(settings: Record<string, string>) {
  try {
    const apiUrl = settings.api_url || '';
    
    // 判断是否使用 Responses API
    if (isAliyunResponsesAPI(apiUrl)) {
      return await testAliyunResponsesAPI(settings);
    } else {
      return await testChatCompletionsAPI(settings);
    }
  } catch (error) {
    return { success: false, error: `连接错误: ${error}` };
  }
}

// 测试对象存储连接
async function testStorageConnection(settings: Record<string, string>) {
  try {
    if (!settings.endpoint_url || !settings.bucket_name) {
      return { success: false, error: 'Endpoint或Bucket未配置' };
    }

    // 简单的连接测试
    const response = await fetch(settings.endpoint_url, {
      method: 'HEAD',
    });

    return { success: true, message: '对象存储配置已保存' };
  } catch (error) {
    return { success: false, error: `连接错误: ${error}` };
  }
}

// 测试数据库连接
async function testDatabaseConnection() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('system_settings')
      .select('count')
      .limit(1);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, message: '数据库连接正常' };
  } catch (error) {
    return { success: false, error: `连接错误: ${error}` };
  }
}

// 测试 Supabase 连接（使用用户配置的凭据）
async function testSupabaseConnection(settings: Record<string, string>) {
  try {
    const url = settings.url;
    const anonKey = settings.anon_key;
    const serviceRoleKey = settings.service_role_key;

    if (!url) {
      return { success: false, error: 'Supabase URL 未配置' };
    }
    if (!anonKey) {
      return { success: false, error: 'Supabase Anon Key 未配置' };
    }

    // 验证 URL 格式
    try {
      new URL(url);
    } catch {
      return { success: false, error: 'Supabase URL 格式无效' };
    }

    // 使用用户配置创建测试客户端
    const testClient = createCustomClient(url, serviceRoleKey || anonKey);

    // 测试连接：查询 system_settings 表
    const { data, error } = await testClient
      .from('system_settings')
      .select('key')
      .limit(1);

    if (error) {
      // 如果 system_settings 表不存在，尝试查询其他表
      const { error: error2 } = await testClient
        .from('knowledge_bases')
        .select('id')
        .limit(1);
      
      if (error2) {
        return { success: false, error: `连接失败: ${error2.message}` };
      }
    }

    // 测试成功，更新缓存
    clearCredentialsCache();

    return { 
      success: true, 
      message: `Supabase 连接正常 (${url})` 
    };
  } catch (error) {
    return { success: false, error: `连接错误: ${error}` };
  }
}

// 测试阿里云百炼知识库连接
async function testBailianConnection(settings: Record<string, string>) {
  try {
    const accessKeyId = settings.access_key_id;
    const accessKeySecret = settings.access_key_secret;
    const workspaceId = settings.workspace_id;
    const endpoint = settings.endpoint || 'bailian.cn-beijing.aliyuncs.com';

    // 验证必填配置
    if (!accessKeyId) {
      return { success: false, error: 'AccessKey ID 未配置' };
    }
    if (!accessKeySecret) {
      return { success: false, error: 'AccessKey Secret 未配置' };
    }
    if (!workspaceId) {
      return { success: false, error: '工作空间ID 未配置' };
    }

    // 动态导入百炼SDK
    const Bailian20231229 = (await import('@alicloud/bailian20231229')).default;
    const { Config } = await import('@alicloud/openapi-client');
    const { ListIndicesRequest } = await import('@alicloud/bailian20231229');
    const { RuntimeOptions } = await import('@alicloud/tea-util');

    // 创建客户端配置
    const config = new Config({
      accessKeyId,
      accessKeySecret,
      endpoint,
    });

    // 创建客户端
    const client = new Bailian20231229(config);

    // 测试：获取知识库列表（只获取1条）
    const request = new ListIndicesRequest({
      pageSize: '1',
    });
    const runtime = new RuntimeOptions({});
    
    const response = await client.listIndicesWithOptions(
      workspaceId,
      request,
      {},
      runtime
    );

    if (response.statusCode === 200 || response.statusCode === 201) {
      const body = response.body;
      const count = body?.data?.indices?.length || 0;
      return { 
        success: true, 
        message: `百炼连接正常，工作空间: ${workspaceId}，知识库数量: ${count}` 
      };
    } else {
      return { 
        success: false, 
        error: `连接失败: HTTP ${response.statusCode}` 
      };
    }
  } catch (error: any) {
    console.error('[Bailian] Test connection failed:', error);
    
    // 解析错误信息
    let errorMsg = '连接失败';
    if (error.message) {
      errorMsg = error.message;
    }
    if (error.code) {
      errorMsg = `${error.code}: ${errorMsg}`;
    }
    
    // 常见错误提示
    if (errorMsg.includes('InvalidAccessKeyId')) {
      errorMsg = 'AccessKey ID 无效';
    } else if (errorMsg.includes('SignatureDoesNotMatch')) {
      errorMsg = 'AccessKey Secret 不正确';
    } else if (errorMsg.includes('WorkspaceNotFound')) {
      errorMsg = '工作空间ID 不存在';
    } else if (errorMsg.includes('Forbidden')) {
      errorMsg = '权限不足，请确保 RAM 用户已获得 AliyunBailianDataFullAccess 权限';
    }
    
    return { success: false, error: errorMsg };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, settings } = body;

    let result;
    switch (type) {
      case 'llm': {
        // 解析真实密钥值
        const resolvedSettings = await resolveSecretSettings('llm', settings);
        result = await testLLMConnection(resolvedSettings);
        break;
      }
      case 'storage': {
        const resolvedSettings = await resolveSecretSettings('storage', settings);
        result = await testStorageConnection(resolvedSettings);
        break;
      }
      case 'database':
        result = await testDatabaseConnection();
        break;
      case 'supabase': {
        const resolvedSettings = await resolveSecretSettings('supabase', settings);
        result = await testSupabaseConnection(resolvedSettings);
        break;
      }
      case 'bailian': {
        const resolvedSettings = await resolveSecretSettings('bailian', settings);
        result = await testBailianConnection(resolvedSettings);
        break;
      }
      default:
        return NextResponse.json(
          { success: false, error: '未知的测试类型' },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('测试连接失败:', error);
    return NextResponse.json(
      { success: false, error: '测试连接失败' },
      { status: 500 }
    );
  }
}
