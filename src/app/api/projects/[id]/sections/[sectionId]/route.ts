/**
 * 章节详情API
 * 获取单个章节的内容和状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/projects/[id]/sections/[sectionId] - 获取章节详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const client = getSupabaseClient();

    // 先尝试从 bid_sections 表获取
    const { data: section, error } = await client
      .from('bid_sections')
      .select('*')
      .eq('project_id', id)
      .eq('id', sectionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('查询章节失败:', error);
      return NextResponse.json(
        { success: false, error: '查询章节失败' },
        { status: 500 }
      );
    }

    // 如果章节存在于 bid_sections 表
    if (section) {
      return NextResponse.json({
        success: true,
        data: {
          id: section.id,
          title: section.title,
          content: section.content,
          status: section.status,
          metadata: section.metadata,
          createdAt: section.created_at,
          updatedAt: section.updated_at,
        },
      });
    }

    // 否则从项目大纲中查找
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

    const outline = project.metadata?.outline;
    const sectionFromOutline = findSection(outline?.sections || [], sectionId);

    if (!sectionFromOutline) {
      return NextResponse.json(
        { success: false, error: '章节不存在' },
        { status: 404 }
      );
    }

    // 计算章节状态
    const sectionStatus = getSectionStatus(sectionFromOutline);

    return NextResponse.json({
      success: true,
      data: {
        id: sectionFromOutline.id,
        title: sectionFromOutline.title,
        content: sectionFromOutline.content || '',
        status: sectionStatus,
        metadata: {
          order: sectionFromOutline.order,
          scoringItemIds: sectionFromOutline.scoring_item_ids || [],
          aiConfig: sectionFromOutline.aiConfig,
          contentGuide: sectionFromOutline.contentGuide,
        },
      },
    });
  } catch (error) {
    console.error('获取章节详情失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/sections/[sectionId] - 更新章节内容
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const body = await req.json();
    const { content, title, metadata } = body;

    const client = getSupabaseClient();

    // 检查章节是否存在
    const { data: existingSection } = await client
      .from('bid_sections')
      .select('id')
      .eq('project_id', id)
      .eq('id', sectionId)
      .single();

    if (existingSection) {
      // 更新现有章节
      const updateData: any = { updated_at: new Date().toISOString() };
      if (content !== undefined) updateData.content = content;
      if (title !== undefined) updateData.title = title;
      if (metadata !== undefined) updateData.metadata = metadata;
      if (content !== undefined) updateData.status = 'edited';

      const { error } = await client
        .from('bid_sections')
        .update(updateData)
        .eq('id', sectionId);

      if (error) {
        console.error('更新章节失败:', error);
        return NextResponse.json(
          { success: false, error: '更新失败' },
          { status: 500 }
        );
      }
    } else {
      // 创建新章节记录
      const { error } = await client
        .from('bid_sections')
        .insert({
          id: sectionId,
          project_id: id,
          title: title || sectionId,
          content: content || '',
          status: 'edited',
          metadata: metadata || {},
        });

      if (error) {
        console.error('创建章节失败:', error);
        return NextResponse.json(
          { success: false, error: '创建失败' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: '章节已更新',
    });
  } catch (error) {
    console.error('更新章节失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '更新失败' },
      { status: 500 }
    );
  }
}

/**
 * 从大纲中查找章节
 */
function findSection(sections: any[], sectionId: string): any | null {
  for (const section of sections) {
    if (section.id === sectionId) {
      return section;
    }
    if (section.children) {
      const found = findSection(section.children, sectionId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 获取章节状态
 * 父章节：自己有内容 或 所有子章节都完成
 * 叶子章节：自己有内容
 */
function getSectionStatus(section: any): string {
  // 自己有内容
  if (section.content && section.content.trim().length > 0) {
    return 'completed';
  }
  
  // 有子章节，检查子章节是否都完成
  if (section.children && section.children.length > 0) {
    const allChildrenComplete = section.children.every((child: any) => 
      getSectionStatus(child) === 'completed'
    );
    if (allChildrenComplete) {
      return 'completed';
    }
    // 部分完成
    const anyChildComplete = section.children.some((child: any) => 
      getSectionStatus(child) === 'completed'
    );
    return anyChildComplete ? 'partial' : 'pending';
  }
  
  return 'pending';
}
