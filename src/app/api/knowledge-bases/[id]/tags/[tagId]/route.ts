/**
 * 单个标签管理API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// DELETE /api/knowledge-bases/[id]/tags/[tagId] - 删除标签
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  try {
    const { id, tagId } = await params;
    const client = getSupabaseClient();

    // 删除标签关联
    await client
      .from('document_tags')
      .delete()
      .eq('tag_id', tagId);

    // 删除标签
    const { error } = await client
      .from('knowledge_tags')
      .delete()
      .eq('id', tagId)
      .eq('knowledge_base_id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '标签已删除',
    });
  } catch (error) {
    console.error('删除标签失败:', error);
    return NextResponse.json(
      { success: false, error: '删除标签失败' },
      { status: 500 }
    );
  }
}

// PUT /api/knowledge-bases/[id]/tags/[tagId] - 更新标签
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  try {
    const { id, tagId } = await params;
    const body = await req.json();
    const { name, color, description } = body;

    const client = getSupabaseClient();

    const { data, error } = await client
      .from('knowledge_tags')
      .update({
        name: name?.trim(),
        color: color,
        description: description,
      })
      .eq('id', tagId)
      .eq('knowledge_base_id', id)
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
    console.error('更新标签失败:', error);
    return NextResponse.json(
      { success: false, error: '更新标签失败' },
      { status: 500 }
    );
  }
}
