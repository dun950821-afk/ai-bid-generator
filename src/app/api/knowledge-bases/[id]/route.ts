import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/knowledge-bases/[id] - 获取知识库详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('knowledge_bases')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: '知识库不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('获取知识库失败:', error);
    return NextResponse.json(
      { success: false, error: '获取知识库失败' },
      { status: 500 }
    );
  }
}

// PATCH /api/knowledge-bases/[id] - 更新知识库
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description } = body;

    const client = getSupabaseClient();

    const updateData: any = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const { data, error } = await client
      .from('knowledge_bases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
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
      { success: false, error: '更新知识库失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/knowledge-bases/[id] - 删除知识库
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 删除关联的文档和知识块（通过数据库级联删除）
    const { error } = await client
      .from('knowledge_bases')
      .delete()
      .eq('id', id);

    if (error) {
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
      { success: false, error: '删除知识库失败' },
      { status: 500 }
    );
  }
}
