import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取所有系统设置
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('system_settings')
      .select('*')
      .order('category')
      .order('key');

    if (error) {
      console.error('获取系统设置失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 按分类整理设置
    const settings: Record<string, Record<string, {
      value: string | null;
      description: string | null;
      is_secret: boolean;
    }>> = {};

    for (const item of data || []) {
      if (!settings[item.category]) {
        settings[item.category] = {};
      }
      settings[item.category][item.key] = {
        value: item.is_secret && item.value ? '******' : item.value,
        description: item.description,
        is_secret: item.is_secret,
      };
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('获取系统设置失败:', error);
    return NextResponse.json(
      { success: false, error: '获取系统设置失败' },
      { status: 500 }
    );
  }
}

// 批量更新系统设置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { success: false, error: '无效的设置数据' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    const now = new Date().toISOString();
    const updateResults: string[] = [];

    // 批量更新设置
    for (const category of Object.keys(settings)) {
      for (const key of Object.keys(settings[category])) {
        let value = settings[category][key];
        
        // 如果value是对象，提取value字段
        if (typeof value === 'object' && value !== null && 'value' in value) {
          value = value.value;
        }
        
        // 转换为字符串
        const valueStr = String(value || '');
        
        // 如果是空值，跳过更新（保留原值）
        if (!valueStr) continue;
        
        // 如果是密文字段标记(******)，说明用户没有修改密钥，跳过更新
        if (valueStr === '******') continue;

        const { error } = await client
          .from('system_settings')
          .update({ 
            value: valueStr,
            updated_at: now 
          })
          .eq('category', category)
          .eq('key', key);

        if (error) {
          console.error(`更新设置失败 [${category}.${key}]:`, error);
          updateResults.push(`${category}.${key}: 失败`);
        } else {
          updateResults.push(`${category}.${key}: 成功`);
        }
      }
    }

    console.log('设置更新结果:', updateResults);

    return NextResponse.json({ 
      success: true, 
      message: '设置已更新' 
    });
  } catch (error) {
    console.error('更新系统设置失败:', error);
    return NextResponse.json(
      { success: false, error: '更新系统设置失败' },
      { status: 500 }
    );
  }
}
