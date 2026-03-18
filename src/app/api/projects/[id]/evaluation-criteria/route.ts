import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/projects/[id]/evaluation-criteria
 * 获取项目的评分标准（大类+细项）
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取评分大类
    const { data: criteriaList, error: criteriaError } = await client
      .from('evaluation_criteria')
      .select('*')
      .eq('project_id', id)
      .order('seq', { ascending: true });

    if (criteriaError) {
      console.error('[evaluation-criteria] 获取评分大类失败:', criteriaError);
      return NextResponse.json(
        { success: false, error: '获取评分标准失败' },
        { status: 500 }
      );
    }

    // 获取所有评分细项
    const criteriaIds = (criteriaList || []).map((c: any) => c.id);
    
    let items: any[] = [];
    if (criteriaIds.length > 0) {
      const { data: itemsData, error: itemsError } = await client
        .from('evaluation_items')
        .select('*')
        .in('criteria_id', criteriaIds)
        .order('created_at', { ascending: true });

      if (itemsError) {
        console.error('[evaluation-criteria] 获取评分细项失败:', itemsError);
      }
      items = itemsData || [];
    }

    // 组装数据：将细项关联到对应的大类
    const result = (criteriaList || []).map((criteria: any) => {
      const criteriaItems = items.filter((item: any) => item.criteria_id === criteria.id);
      return {
        id: criteria.id,
        seq: criteria.seq,
        category: criteria.category,
        totalScore: criteria.total_score,
        categoryType: criteria.category_type,
        createdAt: criteria.created_at,
        items: criteriaItems.map((item: any) => ({
          id: item.id,
          subItem: item.sub_item,
          itemScore: item.item_score,
          rule: item.rule,
          basis: item.basis,
          techDocRef: item.tech_doc_ref,
          responseContent: item.response_content,
          responseStatus: item.response_status,
          createdAt: item.created_at,
        })),
      };
    });

    // 计算汇总信息
    const summary = {
      totalCriteria: result.length,
      totalItems: items.length,
      totalScore: result.reduce((sum: number, c: any) => sum + (c.totalScore || 0), 0),
      technicalScore: result.filter((c: any) => c.categoryType === 'technical').reduce((sum: number, c: any) => sum + (c.totalScore || 0), 0),
      businessScore: result.filter((c: any) => c.categoryType === 'business').reduce((sum: number, c: any) => sum + (c.totalScore || 0), 0),
      priceScore: result.filter((c: any) => c.categoryType === 'price').reduce((sum: number, c: any) => sum + (c.totalScore || 0), 0),
      pendingItems: items.filter((i: any) => i.response_status === 'pending').length,
      completedItems: items.filter((i: any) => i.response_status === 'completed').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        criteriaList: result,
        summary,
      },
    });
  } catch (error) {
    console.error('[evaluation-criteria] 获取失败:', error);
    return NextResponse.json(
      { success: false, error: '获取评分标准失败' },
      { status: 500 }
    );
  }
}
