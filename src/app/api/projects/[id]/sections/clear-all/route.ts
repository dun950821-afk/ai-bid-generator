/**
 * 清除项目所有章节内容 API
 * 用于一键重新生成时清除数据库中的旧内容
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const client = getSupabaseClient();

    // 清除 bid_sections 表中该项目的所有章节内容
    const { error } = await client
      .from('bid_sections')
      .delete()
      .eq('project_id', projectId);

    if (error) {
      console.error('清除章节内容失败:', error);
      return NextResponse.json(
        { success: false, error: '清除章节内容失败' },
        { status: 500 }
      );
    }

    // 同时清除项目 outline metadata 中的章节内容
    const { data: project } = await client
      .from('projects')
      .select('metadata')
      .eq('id', projectId)
      .single();

    if (project?.metadata?.outline) {
      const outline = project.metadata.outline;
      
      // 递归清除所有章节的 content 字段
      const clearSectionContent = (sections: any[]) => {
        for (const section of sections) {
          delete section.content;
          if (section.children && section.children.length > 0) {
            clearSectionContent(section.children);
          }
        }
      };
      
      if (outline.sections) {
        clearSectionContent(outline.sections);
      }

      await client
        .from('projects')
        .update({
          metadata: {
            ...project.metadata,
            outline,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    }

    return NextResponse.json({ 
      success: true, 
      message: '已清除所有章节内容' 
    });
  } catch (error) {
    console.error('清除章节内容失败:', error);
    return NextResponse.json(
      { success: false, error: '清除章节内容失败' },
      { status: 500 }
    );
  }
}
