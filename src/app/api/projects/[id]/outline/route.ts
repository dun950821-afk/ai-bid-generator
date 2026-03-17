/**
 * 标书大纲生成API
 * GET: 获取项目大纲
 * POST: 生成标书大纲
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createOutlineGenerationService } from '@/lib/services/outline-generation';
import { HeaderUtils } from 'coze-coding-dev-sdk';

/**
 * 获取项目大纲
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
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

    // 获取评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', projectId);

    // 获取废标风险
    const { data: risks } = await client
      .from('disqualification_risks')
      .select('*')
      .eq('project_id', projectId);

    // 计算覆盖信息
    const summary = {
      totalScoringItems: scoringItems?.length || 0,
      totalScore: scoringItems?.reduce((sum, item) => sum + (item.max_score || 0), 0) || 0,
      totalRisks: risks?.length || 0,
      criticalRisks: risks?.filter((r) => r.severity === 'critical').length || 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        project,
        scoringItems: scoringItems || [],
        risks: risks || [],
        summary,
      },
    });
  } catch (error) {
    console.error('获取项目大纲失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取项目大纲失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 生成标书大纲
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
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

    // 获取评分项
    const { data: scoringItems, error: scoringError } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', projectId);

    if (scoringError) {
      console.error('获取评分项失败:', scoringError);
      return NextResponse.json(
        { success: false, error: '获取评分项失败' },
        { status: 500 }
      );
    }

    // 获取废标风险
    const { data: risks, error: risksError } = await client
      .from('disqualification_risks')
      .select('*')
      .eq('project_id', projectId);

    if (risksError) {
      console.error('获取废标风险失败:', risksError);
      return NextResponse.json(
        { success: false, error: '获取废标风险失败' },
        { status: 500 }
      );
    }

    // 检查是否有评分项
    if (!scoringItems || scoringItems.length === 0) {
      return NextResponse.json(
        { success: false, error: '项目暂无评分项，请先上传招标文档并提取评分项' },
        { status: 400 }
      );
    }

    // 创建大纲生成服务
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const outlineService = createOutlineGenerationService(customHeaders);

    // 转换评分项格式
    const formattedScoringItems = scoringItems.map((item) => ({
      id: item.id,
      itemName: item.item_name,
      itemType: item.item_type,
      maxScore: item.max_score,
      scoringRules: item.scoring_rules || [],
    }));

    // 转换废标风险格式
    const formattedRisks = (risks || []).map((risk) => ({
      id: risk.id,
      riskType: risk.risk_type,
      riskDescription: risk.risk_description,
      severity: risk.severity,
    }));

    // 生成大纲
    const result = await outlineService.generateOutline(
      project.name,
      formattedScoringItems,
      formattedRisks,
      {
        description: project.description,
        projectNumber: project.project_number,
      }
    );

    // 保存大纲到项目metadata
    await client
      .from('projects')
      .update({
        metadata: {
          ...project.metadata,
          outline: result.outline,
          mappingMatrix: result.mappingMatrix,
          coverageReport: result.coverageReport,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('生成标书大纲失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成标书大纲失败',
      },
      { status: 500 }
    );
  }
}
