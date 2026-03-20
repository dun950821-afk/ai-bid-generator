import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, clearCredentialsCache, updateCredentialsCache } from '@/storage/database/supabase-client';

/**
 * POST /api/settings/switch-database
 * 切换到新配置的 Supabase 数据库
 * 
 * 流程：
 * 1. 从数据库读取 Supabase 配置
 * 2. 测试连接是否正常
 * 3. 清除缓存，使下次请求使用新配置
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, anonKey, serviceRoleKey } = body;

    // 验证必要参数
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Supabase URL 未配置' },
        { status: 400 }
      );
    }
    if (!anonKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase Anon Key 未配置' },
        { status: 400 }
      );
    }

    // 验证 URL 格式
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Supabase URL 格式无效' },
        { status: 400 }
      );
    }

    // 测试连接
    console.log(`[切换数据库] 测试连接: ${url}`);
    
    // 动态导入 createClient 避免循环依赖
    const { createClient } = await import('@supabase/supabase-js');
    const testClient = createClient(url, serviceRoleKey || anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 尝试查询测试连接
    const { error: testError } = await testClient
      .from('projects')
      .select('id')
      .limit(1);

    if (testError) {
      console.error('[切换数据库] 连接测试失败:', testError);
      return NextResponse.json({
        success: false,
        error: `连接测试失败: ${testError.message}`,
      });
    }

    // 连接成功，立即更新内存缓存（使新配置立即生效）
    updateCredentialsCache({
      url,
      anonKey,
      serviceRoleKey: serviceRoleKey || undefined,
    });

    // 尝试保存配置到新数据库（持久化，供下次启动时使用）
    const now = new Date().toISOString();

    // 更新或插入配置
    const configs = [
      { category: 'supabase', key: 'url', value: url },
      { category: 'supabase', key: 'anon_key', value: anonKey },
    ];

    if (serviceRoleKey) {
      configs.push({ category: 'supabase', key: 'service_role_key', value: serviceRoleKey });
    }

    // 保存到新数据库（使用测试客户端）
    for (const config of configs) {
      // 检查是否存在
      const { data: existing } = await testClient
        .from('system_settings')
        .select('id')
        .eq('category', config.category)
        .eq('key', config.key)
        .single();

      if (existing) {
        // 更新
        await testClient
          .from('system_settings')
          .update({ value: config.value, updated_at: now })
          .eq('category', config.category)
          .eq('key', config.key);
      } else {
        // 插入
        await testClient
          .from('system_settings')
          .insert({
            category: config.category,
            key: config.key,
            value: config.value,
            updated_at: now,
          });
      }
    }

    console.log(`[切换数据库] 切换成功: ${url}`);

    return NextResponse.json({
      success: true,
      message: `已切换到数据库: ${url}`,
      data: { url },
    });
  } catch (error) {
    console.error('[切换数据库] 切换失败:', error);
    return NextResponse.json({
      success: false,
      error: `切换失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }, { status: 500 });
  }
}

/**
 * GET /api/settings/switch-database
 * 获取当前数据库配置信息
 */
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // 获取当前配置
    const { data, error } = await client
      .from('system_settings')
      .select('key, value, updated_at')
      .eq('category', 'supabase');

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }

    // 整理配置
    const config: Record<string, { value: string | null; updated_at: string | null }> = {};
    for (const item of data || []) {
      config[item.key] = {
        value: item.key.includes('key') ? (item.value ? '******' : null) : item.value,
        updated_at: item.updated_at,
      };
    }

    // 获取当前连接信息
    const currentUrl = process.env.COZE_SUPABASE_URL || '未配置';

    return NextResponse.json({
      success: true,
      data: {
        current: {
          url: currentUrl,
          source: data && data.length > 0 ? '数据库配置' : '环境变量',
        },
        saved: config,
      },
    });
  } catch (error) {
    console.error('[获取数据库配置] 失败:', error);
    return NextResponse.json({
      success: false,
      error: '获取配置失败',
    }, { status: 500 });
  }
}
