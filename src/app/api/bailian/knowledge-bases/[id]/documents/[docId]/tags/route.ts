/**
 * 百炼知识库文档标签关联API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/bailian/knowledge-bases/[id]/documents/[docId]/tags - 获取文档的标签
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    // 获取文档的所有标签
    const { data, error } = await client
      .from('document_tags')
      .select(`
        id,
        tag_id,
        knowledge_tags (
          id,
          name,
          color,
          description
        )
      `)
      .eq('document_id', docId);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data?.map(item => item.knowledge_tags).filter(Boolean) || [],
    });
  } catch (error) {
    console.error('获取文档标签失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档标签失败' },
      { status: 500 }
    );
  }
}

// POST /api/bailian/knowledge-bases/[id]/documents/[docId]/tags - 为文档添加标签
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const body = await req.json();
    const { tagIds } = body;

    if (!tagIds || !Array.isArray(tagIds)) {
      return NextResponse.json(
        { success: false, error: '请提供标签ID列表' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 删除现有标签关联
    await client
      .from('document_tags')
      .delete()
      .eq('document_id', docId);

    // 添加新的标签关联
    if (tagIds.length > 0) {
      const insertData = tagIds.map(tagId => ({
        document_id: docId,
        tag_id: tagId,
        knowledge_base_id: id,
      }));

      const { error } = await client
        .from('document_tags')
        .insert(insertData);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `已更新 ${tagIds.length} 个标签`,
    });
  } catch (error) {
    console.error('更新文档标签失败:', error);
    return NextResponse.json(
      { success: false, error: '更新文档标签失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/bailian/knowledge-bases/[id]/documents/[docId]/tags - 移除文档的标签
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get('tagId');

    const client = getSupabaseClient();

    if (tagId) {
      // 移除单个标签
      const { error } = await client
        .from('document_tags')
        .delete()
        .eq('document_id', docId)
        .eq('tag_id', tagId);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
    } else {
      // 移除所有标签
      const { error } = await client
        .from('document_tags')
        .delete()
        .eq('document_id', docId);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: '标签已移除',
    });
  } catch (error) {
    console.error('移除文档标签失败:', error);
    return NextResponse.json(
      { success: false, error: '移除文档标签失败' },
      { status: 500 }
    );
  }
}
