import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 判断是否为阿里云百炼 Responses API
function isAliyunResponsesAPI(apiUrl: string): boolean {
  return apiUrl.includes('dashscope.aliyuncs.com/api/v2') || 
         apiUrl.includes('dashscope-intl.aliyuncs.com/api/v2');
}

// 测试阿里云百炼 Responses API
async function testAliyunResponsesAPI(settings: Record<string, string>) {
  const apiKey = settings.api_key;
  if (!apiKey || apiKey === '******') {
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
  if (!apiKey || apiKey === '******') {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, settings } = body;

    let result;
    switch (type) {
      case 'llm':
        result = await testLLMConnection(settings);
        break;
      case 'storage':
        result = await testStorageConnection(settings);
        break;
      case 'database':
        result = await testDatabaseConnection();
        break;
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
