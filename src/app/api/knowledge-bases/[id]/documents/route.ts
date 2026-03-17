/**
 * 知识库文档管理API
 * GET: 获取文档列表
 * POST: 上传/添加文档
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取文档列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const { searchParams } = new URL(request.url);
    const vectorStatus = searchParams.get('vectorStatus');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const client = getSupabaseClient();

    // 检查知识库是否存在
    const { data: kb, error: kbError } = await client
      .from('knowledge_bases')
      .select('id')
      .eq('id', knowledgeBaseId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    let query = client
      .from('knowledge_documents')
      .select('*', { count: 'exact' })
      .eq('knowledge_base_id', knowledgeBaseId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (vectorStatus) {
      query = query.eq('vector_status', vectorStatus);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('获取文档列表失败:', error);
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
    console.error('获取文档列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取文档列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 添加文档
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const body = await request.json();
    const {
      name,
      originalName,
      fileType,
      fileSize,
      storagePath,
      storageType,
      metadata,
      uploadedBy,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '文档名称不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查知识库是否存在
    const { data: kb, error: kbError } = await client
      .from('knowledge_bases')
      .select('id')
      .eq('id', knowledgeBaseId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 创建文档记录
    const { data, error } = await client
      .from('knowledge_documents')
      .insert({
        knowledge_base_id: knowledgeBaseId,
        name,
        original_name: originalName || name,
        file_type: fileType,
        file_size: fileSize,
        storage_path: storagePath,
        storage_type: storageType || 'local',
        vector_status: 'pending',
        metadata,
        uploaded_by: uploadedBy,
      })
      .select()
      .single();

    if (error) {
      console.error('添加文档失败:', error);
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
    console.error('添加文档失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '添加文档失败',
      },
      { status: 500 }
    );
  }
}
