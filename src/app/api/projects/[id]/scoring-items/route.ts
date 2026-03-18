/**
 * 评分项管理API
 * 包含覆盖报告功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/projects/[id]/scoring-items - 获取评分项列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const includeCoverage = searchParams.get('coverage') === 'true';

    const client = getSupabaseClient();

    // 获取评分项
    const { data: items, error } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // 计算统计信息
    const summary = {
      totalScore: items?.reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      technicalScore: items?.filter(i => i.item_type === 'technical').reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      businessScore: items?.filter(i => i.item_type === 'business').reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      priceScore: items?.filter(i => i.item_type === 'price').reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      totalItems: items?.length || 0,
      respondedItems: items?.filter(i => i.response_status === 'responded').length || 0,
      pendingItems: items?.filter(i => i.response_status === 'pending').length || 0,
    };

    // 如果需要覆盖报告
    if (includeCoverage) {
      const coverageReport = await generateCoverageReport(client, id, items || []);
      return NextResponse.json({
        success: true,
        data: {
          items: items || [],
          summary,
          coverage: coverageReport,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        items: items || [],
        summary,
      },
    });
  } catch (error) {
    console.error('获取评分项失败:', error);
    return NextResponse.json(
      { success: false, error: '获取评分项失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/scoring-items - 更新评分项状态
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { itemId, responseStatus, responseQuality } = body;

    const client = getSupabaseClient();

    const updateData: any = {};
    if (responseStatus) updateData.response_status = responseStatus;
    if (responseQuality) updateData.response_quality = responseQuality;

    const { error } = await client
      .from('scoring_items')
      .update(updateData)
      .eq('id', itemId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '评分项状态已更新',
    });
  } catch (error) {
    console.error('更新评分项失败:', error);
    return NextResponse.json(
      { success: false, error: '更新评分项失败' },
      { status: 500 }
    );
  }
}

/**
 * 生成覆盖报告
 */
async function generateCoverageReport(
  client: any,
  projectId: string,
  scoringItems: any[]
): Promise<{
  coverageRate: number;
  coverageByType: Record<string, { total: number; covered: number; rate: number }>;
  uncoveredItems: any[];
  partialItems: any[];
  fullyCoveredItems: any[];
  recommendations: string[];
}> {
  // 获取项目章节内容
  const { data: sections } = await client
    .from('bid_sections')
    .select('id, title, content, metadata')
    .eq('project_id', projectId);

  // 获取大纲
  const { data: project } = await client
    .from('projects')
    .select('metadata')
    .eq('id', projectId)
    .single();

  const outline = project?.metadata?.outline;

  const uncoveredItems: any[] = [];
  const partialItems: any[] = [];
  const fullyCoveredItems: any[] = [];

  // 检查每个评分项的覆盖情况
  for (const item of scoringItems) {
    const coverage = checkItemCoverage(item, sections, outline);

    if (coverage.status === 'uncovered') {
      uncoveredItems.push({
        ...item,
        coverageStatus: 'uncovered',
        coverageScore: 0,
      });
    } else if (coverage.status === 'partial') {
      partialItems.push({
        ...item,
        coverageStatus: 'partial',
        coverageScore: coverage.score,
        missingAspects: coverage.missingAspects,
      });
    } else {
      fullyCoveredItems.push({
        ...item,
        coverageStatus: 'full',
        coverageScore: coverage.score,
      });
    }
  }

  // 计算覆盖率
  const totalScore = scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
  const coveredScore = fullyCoveredItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
  const partialScore = partialItems.reduce((sum, item) => sum + ((item.max_score || 0) * (item.coverageScore / 100)), 0);

  const coverageRate = totalScore > 0 ? ((coveredScore + partialScore) / totalScore) * 100 : 0;

  // 按类型统计
  const types = ['technical', 'business', 'price'];
  const coverageByType: Record<string, { total: number; covered: number; rate: number }> = {};

  for (const type of types) {
    const typeItems = scoringItems.filter(i => i.item_type === type);
    const typeCovered = [...fullyCoveredItems, ...partialItems].filter(i => i.item_type === type);
    const typeTotal = typeItems.reduce((sum, i) => sum + (i.max_score || 0), 0);
    const typeCoveredScore = typeCovered.reduce((sum, i) => sum + (i.max_score || 0), 0);

    coverageByType[type] = {
      total: typeItems.length,
      covered: typeCovered.length,
      rate: typeTotal > 0 ? (typeCoveredScore / typeTotal) * 100 : 0,
    };
  }

  // 生成建议
  const recommendations: string[] = [];

  if (uncoveredItems.length > 0) {
    recommendations.push(`【紧急】有${uncoveredItems.length}个评分项完全未覆盖，预计损失${uncoveredItems.reduce((sum, i) => sum + (i.max_score || 0), 0).toFixed(0)}分`);
  }

  if (partialItems.length > 0) {
    recommendations.push(`【建议】有${partialItems.length}个评分项响应不完整，建议补充完善`);
  }

  const highValueUncovered = uncoveredItems.filter(i => (i.max_score || 0) >= 10);
  if (highValueUncovered.length > 0) {
    recommendations.push(`【重点关注】${highValueUncovered.map(i => `"${i.item_name}"(${i.max_score}分)`).join('、')} 为高分值项，必须优先响应`);
  }

  return {
    coverageRate: Math.round(coverageRate * 100) / 100,
    coverageByType,
    uncoveredItems,
    partialItems,
    fullyCoveredItems,
    recommendations,
  };
}

/**
 * 检查评分项覆盖情况
 */
function checkItemCoverage(
  item: any,
  sections: any[],
  outline: any
): { status: 'uncovered' | 'partial' | 'full'; score: number; missingAspects?: string[] } {
  // 基于响应状态判断
  if (item.response_status === 'responded' && item.response_quality === 'full') {
    return { status: 'full', score: 100 };
  }

  if (item.response_status === 'responded' && item.response_quality === 'partial') {
    return { status: 'partial', score: 50, missingAspects: ['评分细则响应不完整'] };
  }

  // 检查章节内容是否包含评分项关键词
  if (sections && sections.length > 0) {
    const itemKeywords = item.item_name.split(/[\s,，、]+/);
    let matchCount = 0;

    for (const section of sections) {
      const content = (section.content || '') + (section.title || '');
      for (const keyword of itemKeywords) {
        if (keyword.length >= 2 && content.includes(keyword)) {
          matchCount++;
        }
      }
    }

    const matchRatio = itemKeywords.length > 0 ? matchCount / itemKeywords.length : 0;

    if (matchRatio >= 0.5) {
      return { status: 'partial', score: Math.round(matchRatio * 100) };
    }
  }

  // 检查大纲是否包含评分项
  if (outline?.sections) {
    const outlineStr = JSON.stringify(outline);
    if (outlineStr.includes(item.item_name)) {
      return { status: 'partial', score: 30, missingAspects: ['大纲已规划，内容待编写'] };
    }
  }

  return { status: 'uncovered', score: 0 };
}
