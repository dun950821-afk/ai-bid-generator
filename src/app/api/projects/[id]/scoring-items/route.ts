/**
 * 评分项管理API
 * GET: 获取项目的评分项列表
 * POST: 创建评分项（手动添加或批量导入）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取项目的评分项列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const itemType = searchParams.get('itemType');
    const responseStatus = searchParams.get('responseStatus');

    const client = getSupabaseClient();

    let query = client
      .from('scoring_items')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (itemType) {
      query = query.eq('item_type', itemType);
    }
    if (responseStatus) {
      query = query.eq('response_status', responseStatus);
    }

    const { data: items, error } = await query;

    if (error) {
      console.error('获取评分项失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 计算汇总信息
    const summary = {
      totalScore: items?.reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      technicalScore: items?.filter((item) => item.item_type === 'technical')
        .reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      businessScore: items?.filter((item) => item.item_type === 'business')
        .reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      priceScore: items?.filter((item) => item.item_type === 'price')
        .reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      itemCount: items?.length || 0,
      technicalItemCount: items?.filter((item) => item.item_type === 'technical').length || 0,
      businessItemCount: items?.filter((item) => item.item_type === 'business').length || 0,
      priceItemCount: items?.filter((item) => item.item_type === 'price').length || 0,
    };

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
      {
        success: false,
        error: error instanceof Error ? error.message : '获取评分项失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建评分项
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();

    const client = getSupabaseClient();

    // 检查项目是否存在
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 批量创建
    if (Array.isArray(body.items)) {
      const itemsToInsert = body.items.map((item: any) => ({
        project_id: projectId,
        item_name: item.itemName,
        item_code: item.itemCode,
        item_type: item.itemType,
        parent_item_id: item.parentItemId,
        max_score: item.maxScore,
        weight: item.weight,
        scoring_rules: item.scoringRules || [],
        extracted_from: item.extractedFrom,
        confidence_score: item.confidenceScore,
        response_status: 'pending',
      }));

      const { data, error } = await client
        .from('scoring_items')
        .insert(itemsToInsert)
        .select();

      if (error) {
        console.error('批量创建评分项失败:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          created: data.length,
          items: data,
        },
      });
    }

    // 单个创建
    const { data, error } = await client
      .from('scoring_items')
      .insert({
        project_id: projectId,
        item_name: body.itemName,
        item_code: body.itemCode,
        item_type: body.itemType,
        parent_item_id: body.parentItemId,
        max_score: body.maxScore,
        weight: body.weight,
        scoring_rules: body.scoringRules || [],
        extracted_from: body.extractedFrom,
        confidence_score: body.confidenceScore,
        response_status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('创建评分项失败:', error);
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
    console.error('创建评分项失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建评分项失败',
      },
      { status: 500 }
    );
  }
}
