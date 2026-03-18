/**
 * 招标文档提取版本管理API
 * 支持版本创建、切换、删除等操作
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { TenderDocumentExtractionResult } from '@/types/tender-extraction';

// GET /api/projects/[id]/extraction-versions - 获取所有版本列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取所有版本
    const { data: versions, error } = await client
      .from('extraction_versions')
      .select(`
        id,
        version_number,
        is_current,
        is_approved,
        extraction_metadata,
        field_count,
        total_fields,
        completeness_score,
        notes,
        reviewed_at,
        created_at,
        created_by
      `)
      .eq('project_id', id)
      .order('version_number', { ascending: false });

    if (error) {
      throw error;
    }

    // 统计信息
    const summary = {
      total: versions?.length || 0,
      current: versions?.find(v => v.is_current)?.id || null,
      approved: versions?.filter(v => v.is_approved).length || 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        versions: versions || [],
        summary,
      },
    });
  } catch (error) {
    console.error('获取版本列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取版本列表失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/extraction-versions - 创建新版本（保存提取结果）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { 
      extractionResult, 
      documentId, 
      makeCurrent = true,
      notes 
    } = body;

    if (!extractionResult) {
      return NextResponse.json(
        { success: false, error: '提取结果不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 获取下一个版本号
    const { data: maxVersion } = await client
      .from('extraction_versions')
      .select('version_number')
      .eq('project_id', id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const nextVersionNumber = (maxVersion?.version_number || 0) + 1;

    // 计算完整度
    const { fieldCount, totalFields, completenessScore } = calculateCompleteness(extractionResult);

    // 插入新版本
    const { data: newVersion, error: insertError } = await client
      .from('extraction_versions')
      .insert({
        project_id: id,
        document_id: documentId,
        version_number: nextVersionNumber,
        is_current: makeCurrent,
        extraction_result: extractionResult,
        extraction_metadata: extractionResult.extraction_metadata,
        field_count: fieldCount,
        total_fields: totalFields,
        completeness_score: completenessScore,
        notes,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      data: newVersion,
    });
  } catch (error) {
    console.error('创建版本失败:', error);
    return NextResponse.json(
      { success: false, error: '创建版本失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/extraction-versions - 切换当前版本
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { versionId, action } = body;

    const client = getSupabaseClient();

    if (action === 'set_current') {
      // 切换当前版本
      const { error: updateError } = await client
        .from('extraction_versions')
        .update({ is_current: false })
        .eq('project_id', id);

      if (updateError) throw updateError;

      const { error: setCurrentError } = await client
        .from('extraction_versions')
        .update({ is_current: true })
        .eq('id', versionId);

      if (setCurrentError) throw setCurrentError;

      return NextResponse.json({
        success: true,
        message: '已切换到指定版本',
      });
    }

    if (action === 'approve') {
      // 审核通过版本
      const { error: approveError } = await client
        .from('extraction_versions')
        .update({ 
          is_approved: true, 
          reviewed_at: new Date().toISOString() 
        })
        .eq('id', versionId);

      if (approveError) throw approveError;

      return NextResponse.json({
        success: true,
        message: '版本已审核通过',
      });
    }

    return NextResponse.json(
      { success: false, error: '未知操作' },
      { status: 400 }
    );
  } catch (error) {
    console.error('版本操作失败:', error);
    return NextResponse.json(
      { success: false, error: '版本操作失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/extraction-versions - 删除版本
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId');

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: '版本ID不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查是否为当前版本
    const { data: version } = await client
      .from('extraction_versions')
      .select('is_current')
      .eq('id', versionId)
      .single();

    if (version?.is_current) {
      return NextResponse.json(
        { success: false, error: '不能删除当前版本' },
        { status: 400 }
      );
    }

    // 删除版本
    const { error: deleteError } = await client
      .from('extraction_versions')
      .delete()
      .eq('id', versionId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      message: '版本已删除',
    });
  } catch (error) {
    console.error('删除版本失败:', error);
    return NextResponse.json(
      { success: false, error: '删除版本失败' },
      { status: 500 }
    );
  }
}

/**
 * 计算提取结果完整度
 */
function calculateCompleteness(result: TenderDocumentExtractionResult): {
  fieldCount: number;
  totalFields: number;
  completenessScore: number;
} {
  const fieldsToCheck = [
    // 项目基本信息 (17个字段)
    { path: 'project_basic_info.project_name', weight: 15 },
    { path: 'project_basic_info.project_number', weight: 10 },
    { path: 'project_basic_info.purchase_unit', weight: 10 },
    { path: 'project_basic_info.purchase_unit_contact', weight: 5 },
    { path: 'project_basic_info.purchase_unit_phone', weight: 5 },
    { path: 'project_basic_info.project_budget', weight: 10 },
    { path: 'project_basic_info.project_cycle', weight: 5 },
    { path: 'project_basic_info.delivery_period', weight: 5 },
    
    // 时间节点 (11个字段)
    { path: 'time_schedule.bid_submission_deadline', weight: 15 },
    { path: 'time_schedule.bid_opening_date', weight: 10 },
    { path: 'time_schedule.bid_opening_location', weight: 5 },
    
    // 评分标准
    { path: 'scoring_standard.tech_scoring.scoring_items', weight: 10, isList: true },
    { path: 'scoring_standard.price_scoring.total_score', weight: 5 },
    
    // 废标条款
    { path: 'key_compliance_requirements.disqualification_rules', weight: 10, isList: true },
    
    // 商务要求
    { path: 'business_requirements.bidder_qualification.basic_qualification', weight: 10, isList: true },
  ];

  let filledCount = 0;
  let totalWeight = 0;
  let filledWeight = 0;

  for (const field of fieldsToCheck) {
    totalWeight += field.weight;
    const value = getNestedValue(result, field.path);
    
    if (field.isList) {
      if (Array.isArray(value) && value.length > 0) {
        filledCount++;
        filledWeight += field.weight;
      }
    } else {
      if (value !== null && value !== undefined && value !== '') {
        filledCount++;
        filledWeight += field.weight;
      }
    }
  }

  const completenessScore = totalWeight > 0 ? (filledWeight / totalWeight) * 100 : 0;

  return {
    fieldCount: filledCount,
    totalFields: fieldsToCheck.length,
    completenessScore: Math.round(completenessScore * 100) / 100,
  };
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current?.[key];
  }, obj);
}
