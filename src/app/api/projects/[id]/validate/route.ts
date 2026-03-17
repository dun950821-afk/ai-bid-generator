/**
 * 内容校验API
 * POST: 执行内容校验
 * GET: 获取校验结果
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createContentValidationService } from '@/lib/services/validation-service';

/**
 * 执行内容校验
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
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', projectId);

    // 获取废标风险
    const { data: risks } = await client
      .from('disqualification_risks')
      .select('*')
      .eq('project_id', projectId);

    // 获取已生成的内容
    const sectionContents = project.metadata?.sectionContents || {};

    // 执行校验
    const validationService = createContentValidationService();
    const report = await validationService.validate(
      projectId,
      sectionContents,
      scoringItems || [],
      risks || []
    );

    // 保存校验结果到项目metadata
    await client
      .from('projects')
      .update({
        metadata: {
          ...project.metadata,
          validationReport: {
            ...report,
            validatedAt: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('内容校验失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '内容校验失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取校验结果
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
      .select('metadata')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    const validationReport = project.metadata?.validationReport;

    if (!validationReport) {
      return NextResponse.json(
        { success: false, error: '暂无校验结果，请先执行内容校验' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: validationReport,
    });
  } catch (error) {
    console.error('获取校验结果失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取校验结果失败',
      },
      { status: 500 }
    );
  }
}
