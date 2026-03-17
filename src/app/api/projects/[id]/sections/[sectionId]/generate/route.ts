/**
 * 章节内容生成API
 * POST: 生成章节内容
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createContentGenerationService } from '@/lib/services/content-generation';
import { HeaderUtils } from 'coze-coding-dev-sdk';

/**
 * 生成章节内容
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id: projectId, sectionId } = await params;
    const body = await request.json();
    const { customPrompt } = body;

    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取项目大纲
    const outline = project.metadata?.outline;
    if (!outline) {
      return NextResponse.json(
        { success: false, error: '项目暂无大纲，请先生成大纲' },
        { status: 400 }
      );
    }

    // 查找目标章节
    const findSection = (sections: any[], id: string): any | null => {
      for (const section of sections) {
        if (section.id === id) return section;
        if (section.children) {
          const found = findSection(section.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const targetSection = findSection(outline.sections, sectionId);
    if (!targetSection) {
      return NextResponse.json(
        { success: false, error: '章节不存在' },
        { status: 404 }
      );
    }

    // 获取相关评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', projectId);

    // 转换为Map
    const scoringItemsMap = new Map();
    (scoringItems || []).forEach((item) => {
      scoringItemsMap.set(item.id, {
        id: item.id,
        itemName: item.item_name,
        maxScore: item.max_score,
        scoringRules: item.scoring_rules || [],
      });
    });

    // 获取章节相关的评分项
    const relatedScoringItems = (targetSection.scoringItemIds || [])
      .map((id: string) => scoringItemsMap.get(id))
      .filter(Boolean);

    // 创建内容生成服务
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const contentService = createContentGenerationService(customHeaders);

    // 生成内容
    const result = await contentService.generateSectionContent(
      sectionId,
      targetSection.title,
      targetSection.sectionType || 'technical',
      relatedScoringItems,
      project.knowledge_base_id,
      customPrompt
    );

    // 保存生成的内容到项目metadata
    const sectionContents = project.metadata?.sectionContents || {};
    sectionContents[sectionId] = {
      ...result,
      generatedAt: new Date().toISOString(),
    };

    await client
      .from('projects')
      .update({
        metadata: {
          ...project.metadata,
          sectionContents,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('生成章节内容失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成章节内容失败',
      },
      { status: 500 }
    );
  }
}
