/**
 * 知识库管理API
 * GET: 获取知识库列表
 * POST: 创建知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取知识库列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const isActive = searchParams.get('isActive');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const client = getSupabaseClient();

    let query = client
      .from('knowledge_bases')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq('type', type);
    }
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('获取知识库列表失败:', error);
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
    console.error('获取知识库列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取知识库列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建知识库
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      type = 'enterprise',
      embeddingModel,
      chunkSize,
      chunkOverlap,
      metadata,
      createdBy,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '知识库名称不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from('knowledge_bases')
      .insert({
        name,
        description,
        type,
        embedding_model: embeddingModel || 'text-embedding-ada-002',
        chunk_size: chunkSize || 500,
        chunk_overlap: chunkOverlap || 50,
        metadata,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('创建知识库失败:', error);
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
    console.error('创建知识库失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建知识库失败',
      },
      { status: 500 }
    );
  }
}
