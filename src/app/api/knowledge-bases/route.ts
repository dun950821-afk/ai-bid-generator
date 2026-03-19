/**
 * 本地知识库管理API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - GET/POST: /api/bailian/knowledge-bases
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取知识库列表 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases',
  }, { status: 410 }); // 410 Gone - 资源已永久移除
}

/**
 * 创建知识库 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases',
  }, { status: 410 });
}

/**
 * 删除知识库 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]
 */
export async function DELETE(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]',
  }, { status: 410 });
}

/* ============ 原始代码已注释 ============
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: '知识库ID不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { data: kb, error: fetchError } = await client
      .from('knowledge_bases')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !kb) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    const { data: linkedProjects } = await client
      .from('projects')
      .select('id, name')
      .eq('knowledge_base_id', id)
      .limit(5);

    if (linkedProjects && linkedProjects.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `无法删除：知识库正被以下项目使用：${linkedProjects.map(p => p.name).join('、')}。请先解除关联。` 
        },
        { status: 400 }
      );
    }

    const { data: documents } = await client
      .from('knowledge_documents')
      .select('id')
      .eq('knowledge_base_id', id);
    
    if (documents && documents.length > 0) {
      const docIds = documents.map(d => d.id);
      await client.from('document_chunks').delete().in('document_id', docIds);
    }
    
    await client.from('knowledge_documents').delete().eq('knowledge_base_id', id);

    const { error: deleteError } = await client
      .from('knowledge_bases')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('删除知识库失败:', deleteError);
      return NextResponse.json(
        { success: false, error: '删除知识库失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `知识库"${kb.name}"已删除`,
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
============================================ */
