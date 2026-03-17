/**
 * 知识库标签管理API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/knowledge-bases/[id]/tags - 获取知识库标签列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取知识库的所有标签
    const { data, error } = await client
      .from('knowledge_tags')
      .select('*')
      .eq('knowledge_base_id', id)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 获取每个标签的文档数量
    const tagsWithCount = await Promise.all(
      (data || []).map(async (tag) => {
        const { count } = await client
          .from('document_tags')
          .select('*', { count: 'exact', head: true })
          .eq('tag_id', tag.id);
        
        return {
          ...tag,
          document_count: count || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: tagsWithCount,
    });
  } catch (error) {
    console.error('获取标签列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取标签列表失败' },
      { status: 500 }
    );
  }
}

// POST /api/knowledge-bases/[id]/tags - 创建新标签
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, color, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: '标签名称不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查标签是否已存在
    const { data: existing } = await client
      .from('knowledge_tags')
      .select('id')
      .eq('knowledge_base_id', id)
      .eq('name', name.trim())
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: '标签已存在' },
        { status: 400 }
      );
    }

    // 创建标签
    const { data, error } = await client
      .from('knowledge_tags')
      .insert({
        knowledge_base_id: id,
        name: name.trim(),
        color: color || '#3b82f6',
        description: description || null,
      })
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
      data: { ...data, document_count: 0 },
    });
  } catch (error) {
    console.error('创建标签失败:', error);
    return NextResponse.json(
      { success: false, error: '创建标签失败' },
      { status: 500 }
    );
  }
}
