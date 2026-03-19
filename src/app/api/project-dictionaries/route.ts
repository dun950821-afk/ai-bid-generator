/**
 * 项目字典API
 * GET: 获取字典列表
 * POST: 创建字典项
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取字典列表
 * @description 支持按类型筛选
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'customer_industry' | 'service_type'

    const client = getSupabaseClient();

    let query = client
      .from('project_dictionaries')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取字典列表失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('获取字典列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取字典列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建字典项
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, label, value, sortOrder } = body;

    if (!type || !label || !value) {
      return NextResponse.json(
        { success: false, error: '类型、标签和值不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 获取当前最大排序号
    const { data: maxOrder } = await client
      .from('project_dictionaries')
      .select('sort_order')
      .eq('type', type)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = sortOrder ?? (maxOrder?.sort_order ?? 0) + 1;

    const { data, error } = await client
      .from('project_dictionaries')
      .insert({
        type,
        label,
        value,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('创建字典项失败:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: '该值已存在' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('创建字典项失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建字典项失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 更新字典项
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, label, sortOrder, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (label !== undefined) updateData.label = label;
    if (sortOrder !== undefined) updateData.sort_order = sortOrder;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data, error } = await client
      .from('project_dictionaries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新字典项失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('更新字典项失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新字典项失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除字典项
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from('project_dictionaries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除字典项失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('删除字典项失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除字典项失败',
      },
      { status: 500 }
    );
  }
}
