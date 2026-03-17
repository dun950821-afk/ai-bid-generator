/**
 * 项目管理API
 * GET: 获取项目列表
 * POST: 创建项目
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取项目列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const client = getSupabaseClient();

    let query = client
      .from('projects')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('获取项目列表失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        items: data,
        total: count,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('获取项目列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取项目列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建项目
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      projectNumber,
      knowledgeBaseId,
      metadata,
      createdBy,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '项目名称不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from('projects')
      .insert({
        name,
        description,
        project_number: projectNumber,
        knowledge_base_id: knowledgeBaseId,
        metadata,
        created_by: createdBy,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('创建项目失败:', error);
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
    console.error('创建项目失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建项目失败',
      },
      { status: 500 }
    );
  }
}
