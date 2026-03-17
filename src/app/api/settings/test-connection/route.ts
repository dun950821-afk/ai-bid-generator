import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 测试LLM连接（支持OpenAI兼容API，包括阿里云百炼、豆包等）
async function testLLMConnection(settings: Record<string, string>) {
  try {
    const apiKey = settings.api_key;
    if (!apiKey || apiKey === '******') {
      return { success: false, error: 'API密钥未配置' };
    }

    // 构建API URL（确保以/v1/chat/completions结尾）
    let apiUrl = settings.api_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    if (!apiUrl.includes('/chat/completions')) {
      // 如果URL不包含chat/completions，自动补充
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    const model = settings.model || 'qwen-plus';
    const enableThinking = settings.enable_thinking === 'true';
    const thinkingBudget = parseInt(settings.thinking_budget || '8192');

    // 构建请求体
    const requestBody: Record<string, unknown> = {
      model: model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '你好，请简单介绍一下自己' }
      ],
      max_tokens: 50,
    };

    // 如果开启思考模式，添加思考参数（阿里云百炼特有）
    if (enableThinking) {
      requestBody.enable_thinking = true;
      // 思考预算通过 thinking_budget 参数传递（如果API支持）
      // 注意：百炼API可能使用不同的参数名，这里使用通用的方式
      requestBody.thinking_budget = thinkingBudget;
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
      
      // 构建成功消息
      let message = `LLM连接正常，模型: ${model}`;
      if (enableThinking) {
        message += `，思考模式: 已开启 (预算: ${thinkingBudget} tokens)`;
        
        // 检查响应中是否包含思考内容
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
        
        // 特殊处理额度不足的情况
        if (errorMsg.includes('free tier') || errorMsg.includes('exhausted')) {
          errorMsg = 'API密钥有效，但免费额度已用完，请充值后使用';
        }
      } catch {
        // 无法解析JSON，使用原始文本
      }
      return { success: false, error: errorMsg };
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
