/**
 * 知识库详情API
 * GET: 获取知识库详情
 * PUT: 更新知识库
 * DELETE: 删除知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取知识库详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取知识库基本信息
    const { data: knowledgeBase, error: kbError } = await client
      .from('knowledge_bases')
      .select('*')
      .eq('id', id)
      .single();

    if (kbError) {
      if (kbError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: '知识库不存在' },
          { status: 404 }
        );
      }
      console.error('获取知识库详情失败:', kbError);
      return NextResponse.json(
        { success: false, error: kbError.message },
        { status: 500 }
      );
    }

    // 获取文档统计
    const { count: documentCount } = await client
      .from('knowledge_documents')
      .select('*', { count: 'exact', head: true })
      .eq('knowledge_base_id', id);

    // 获取分块统计
    const { count: chunkCount } = await client
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('knowledge_base_id', id);

    // 更新统计信息
    if (documentCount !== knowledgeBase.document_count || chunkCount !== knowledgeBase.chunk_count) {
      await client
        .from('knowledge_bases')
        .update({
          document_count: documentCount,
          chunk_count: chunkCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...knowledgeBase,
        document_count: documentCount,
        chunk_count: chunkCount,
      },
    });
  } catch (error) {
    console.error('获取知识库详情失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取知识库详情失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 更新知识库
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const client = getSupabaseClient();

    // 检查知识库是否存在
    const { data: existing, error: checkError } = await client
      .from('knowledge_bases')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 更新知识库
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.embeddingModel !== undefined) updateData.embedding_model = body.embeddingModel;
    if (body.chunkSize !== undefined) updateData.chunk_size = body.chunkSize;
    if (body.chunkOverlap !== undefined) updateData.chunk_overlap = body.chunkOverlap;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const { data, error } = await client
      .from('knowledge_bases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新知识库失败:', error);
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
    console.error('更新知识库失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新知识库失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除知识库
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 检查知识库是否存在
    const { data: existing, error: checkError } = await client
      .from('knowledge_bases')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 删除知识库（级联删除文档和分块）
    const { error } = await client
      .from('knowledge_bases')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除知识库失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '知识库已删除',
    });
  } catch (error) {
    console.error('删除知识库失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除知识库失败',
      },
      { status: 500 }
    );
  }
}
