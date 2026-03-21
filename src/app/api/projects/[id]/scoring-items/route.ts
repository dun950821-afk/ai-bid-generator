/**
 * 评分项管理API
 * 包含覆盖报告功能
 * 支持新表结构：evaluation_criteria + evaluation_items
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 评分项接口（兼容前端）
interface ScoringItem {
  id: string;
  project_id: string;
  item_name: string;
  item_type: string;
  max_score: number;
  scoring_rules: Array<{ rule: string; score: number }>;
  response_status: string;
  chapter_id?: string;
  sort_order: number;
}

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

    // 从新表查询评分标准
    const items = await fetchScoringItemsFromNewTables(client, id);

    // 计算统计信息
    const summary = {
      totalScore: items.reduce((sum, item) => sum + (item.max_score || 0), 0),
      technicalScore: items.filter(i => i.item_type === 'technical').reduce((sum, item) => sum + (item.max_score || 0), 0),
      businessScore: items.filter(i => i.item_type === 'business').reduce((sum, item) => sum + (item.max_score || 0), 0),
      priceScore: items.filter(i => i.item_type === 'price').reduce((sum, item) => sum + (item.max_score || 0), 0),
      totalItems: items.length,
      respondedItems: items.filter(i => i.response_status === 'responded').length,
      pendingItems: items.filter(i => i.response_status === 'pending' || i.response_status === 'unresponded').length,
    };

    // 如果需要覆盖报告
    if (includeCoverage) {
      const coverageReport = await generateCoverageReport(client, id, items);
      return NextResponse.json({
        success: true,
        data: {
          items,
          summary,
          coverage: coverageReport,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        items,
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

/**
 * 从新表结构获取评分项（兼容旧格式）
 */
async function fetchScoringItemsFromNewTables(
  client: any,
  projectId: string
): Promise<ScoringItem[]> {
  // 查询评分大类
  const { data: criteriaList, error: criteriaError } = await client
    .from('evaluation_criteria')
    .select('*')
    .eq('project_id', projectId)
    .order('seq', { ascending: true });

  if (criteriaError) {
    console.error('查询评分大类失败:', criteriaError);
    return [];
  }

  if (!criteriaList || criteriaList.length === 0) {
    // 尝试从旧表查询（向后兼容）
    const { data: oldItems, error: oldError } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    
    if (oldError || !oldItems) return [];
    
    return oldItems.map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      item_name: item.item_name,
      item_type: item.item_type || 'technical',
      max_score: item.max_score || 0,
      scoring_rules: item.scoring_rules || [],
      response_status: item.response_status || 'pending',
      chapter_id: item.chapter_id,
      sort_order: item.sort_order || 0,
    }));
  }

  // 查询所有评分细项
  const criteriaIds = criteriaList.map((c: any) => c.id);
  const { data: itemsList, error: itemsError } = await client
    .from('evaluation_items')
    .select('*')
    .in('criteria_id', criteriaIds);

  if (itemsError) {
    console.error('查询评分细项失败:', itemsError);
  }

  // 构建评分项列表（兼容旧格式）
  const scoringItems: ScoringItem[] = [];
  let sortOrder = 0;

  for (const criteria of criteriaList) {
    const criteriaItems = (itemsList || []).filter(
      (item: any) => item.criteria_id === criteria.id
    );

    // 确定类型映射
    const typeMap: Record<string, string> = {
      '技术评分': 'technical',
      '商务评分': 'business',
      '价格评分': 'price',
      'technical': 'technical',
      'business': 'business',
      'price': 'price',
    };
    const itemType = typeMap[criteria.category_type] || 
                     typeMap[criteria.category] || 
                     'technical';

    if (criteriaItems.length === 0) {
      // 如果没有细项，用大类作为评分项
      scoringItems.push({
        id: criteria.id,
        project_id: projectId,
        item_name: criteria.category || '未命名评分项',
        item_type: itemType,
        max_score: criteria.total_score || 0,
        scoring_rules: [],
        response_status: criteria.response_status || 'pending',
        sort_order: sortOrder++,
      });
    } else {
      // 将细项转换为评分项
      for (const item of criteriaItems) {
        // 解析评分规则
        let scoringRules: Array<{ rule: string; score: number }> = [];
        if (item.rule) {
          // 简单解析：按换行分割
          const rules = item.rule.split('\n').filter((r: string) => r.trim());
          scoringRules = rules.map((r: string) => ({
            rule: r.trim(),
            score: item.item_score || 0,
          }));
        }

        scoringItems.push({
          id: item.id,
          project_id: projectId,
          item_name: item.sub_item || criteria.category || '未命名',
          item_type: itemType,
          max_score: item.item_score || 0,
          scoring_rules: scoringRules,
          response_status: item.response_status || criteria.response_status || 'pending',
          chapter_id: item.chapter_id,
          sort_order: sortOrder++,
        });
      }
    }
  }

  return scoringItems;
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

    // 尝试更新新表
    const { error: newItemError } = await client
      .from('evaluation_items')
      .update({ response_status: responseStatus })
      .eq('id', itemId);

    if (!newItemError) {
      return NextResponse.json({
        success: true,
        message: '评分项状态已更新',
      });
    }

    // 回退到旧表
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
  scoringItems: ScoringItem[]
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

  // 计算覆盖率，最大不超过 100%
  const totalScore = scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
  const coveredScore = fullyCoveredItems.reduce((sum, item) => sum + (item.max_score || 0), 0);
  const partialScore = partialItems.reduce((sum, item) => sum + ((item.max_score || 0) * (item.coverageScore / 100)), 0);

  const rawCoverageRate = totalScore > 0 ? ((coveredScore + partialScore) / totalScore) * 100 : 0;
  const coverageRate = Math.min(100, Math.round(rawCoverageRate * 100) / 100);

  // 按类型统计
  const types = ['technical', 'business', 'price'];
  const coverageByType: Record<string, { total: number; covered: number; rate: number }> = {};

  for (const type of types) {
    const typeItems = scoringItems.filter(i => i.item_type === type);
    const typeFullyCovered = fullyCoveredItems.filter(i => i.item_type === type);
    const typePartialCovered = partialItems.filter(i => i.item_type === type);
    const typeTotal = typeItems.reduce((sum, i) => sum + (i.max_score || 0), 0);
    
    // 完全覆盖的取完整分值，部分覆盖的按覆盖率计算
    const typeFullyCoveredScore = typeFullyCovered.reduce((sum, i) => sum + (i.max_score || 0), 0);
    const typePartialCoveredScore = typePartialCovered.reduce((sum, i) => sum + ((i.max_score || 0) * ((i.coverageScore || 0) / 100)), 0);
    const typeCoveredScore = typeFullyCoveredScore + typePartialCoveredScore;

    // 计算 rate，最大不超过 100%
    const rawRate = typeTotal > 0 ? (typeCoveredScore / typeTotal) * 100 : 0;
    const rate = Math.min(100, rawRate);

    coverageByType[type] = {
      total: typeItems.length,
      covered: typeFullyCovered.length + typePartialCovered.length,
      rate: Math.round(rate * 100) / 100,
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
  item: ScoringItem,
  sections: any[],
  outline: any
): { status: 'uncovered' | 'partial' | 'full'; score: number; missingAspects?: string[] } {
  // 基于响应状态判断
  if (item.response_status === 'responded') {
    return { status: 'full', score: 100 };
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
