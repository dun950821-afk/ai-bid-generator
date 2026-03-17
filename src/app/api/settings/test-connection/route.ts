import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 测试LLM连接
async function testLLMConnection(settings: Record<string, string>) {
  try {
    if (!settings.api_key || settings.api_key === '******') {
      return { success: false, error: 'API密钥未配置' };
    }

    const response = await fetch(settings.api_url || 'https://api.doubao.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({
        model: settings.model || 'doubao-pro-32k',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      return { success: true, message: 'LLM连接正常' };
    } else {
      const error = await response.text();
      return { success: false, error: `连接失败: ${response.status}` };
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
