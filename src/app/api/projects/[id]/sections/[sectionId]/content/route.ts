/**
 * 章节内容管理API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/projects/[id]/sections/[sectionId]/content - 获取章节内容
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project, error } = await client
      .from('projects')
      .select('id, metadata')
      .eq('id', id)
      .single();

    if (error || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 从元数据中获取章节内容
    const sectionContents = project.metadata?.sectionContents || {};
    const content = sectionContents[sectionId] || '';

    return NextResponse.json({
      success: true,
      data: {
        content,
        updatedAt: sectionContents[`${sectionId}_updatedAt`] || null,
      },
    });
  } catch (error) {
    console.error('获取章节内容失败:', error);
    return NextResponse.json(
      { success: false, error: '获取章节内容失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/sections/[sectionId]/content - 保存章节内容
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const { content } = await req.json();

    if (content === undefined) {
      return NextResponse.json(
        { success: false, error: '请提供内容' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 获取当前项目元数据
    const { data: project } = await client
      .from('projects')
      .select('metadata')
      .eq('id', id)
      .single();

    // 更新章节内容
    const sectionContents = project?.metadata?.sectionContents || {};
    sectionContents[sectionId] = content;
    sectionContents[`${sectionId}_updatedAt`] = new Date().toISOString();

    const { error } = await client
      .from('projects')
      .update({
        metadata: {
          ...project?.metadata,
          sectionContents,
          lastContentUpdate: new Date().toISOString(),
        },
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '内容已保存',
    });
  } catch (error) {
    console.error('保存章节内容失败:', error);
    return NextResponse.json(
      { success: false, error: '保存章节内容失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/sections/[sectionId]/content - 删除章节内容
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const client = getSupabaseClient();

    // 获取当前项目元数据
    const { data: project } = await client
      .from('projects')
      .select('metadata')
      .eq('id', id)
      .single();

    if (!project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 删除章节内容
    const sectionContents = project.metadata?.sectionContents || {};
    delete sectionContents[sectionId];
    delete sectionContents[`${sectionId}_updatedAt`];

    const { error } = await client
      .from('projects')
      .update({
        metadata: {
          ...project.metadata,
          sectionContents,
        },
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '内容已删除',
    });
  } catch (error) {
    console.error('删除章节内容失败:', error);
    return NextResponse.json(
      { success: false, error: '删除章节内容失败' },
      { status: 500 }
    );
  }
}
