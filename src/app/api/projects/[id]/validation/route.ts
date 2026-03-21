/**
 * 内容校验API
 * 执行多维度校验并生成报告
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { 
  createContentValidationService,
  ValidationReport,
  ValidationType,
} from '@/lib/services/validation-service';

// GET /api/projects/[id]/validation - 获取校验报告
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const latest = searchParams.get('latest') === 'true';

    const client = getSupabaseClient();

    if (latest) {
      // 获取最新的校验结果
      const { data: latestResult, error } = await client
        .from('validation_results')
        .select('*')
        .eq('project_id', id)
        .order('validated_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      // 汇总报告
      const summary = generateSummaryFromResults(latestResult || []);

      return NextResponse.json({
        success: true,
        data: {
          results: latestResult || [],
          summary,
        },
      });
    }

    // 获取所有校验结果
    const { data: allResults, error } = await client
      .from('validation_results')
      .select('*')
      .eq('project_id', id)
      .order('validated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: allResults || [],
    });
  } catch (error) {
    console.error('获取校验报告失败:', error);
    return NextResponse.json(
      { success: false, error: '获取校验报告失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/validation - 执行校验
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { types, sectionId } = body;

    const client = getSupabaseClient();

    // 获取项目信息
    const { data: project } = await client
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (!project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取评分项
    const { data: scoringItems } = await client
      .from('scoring_items')
      .select('*')
      .eq('project_id', id);

    // 获取风险因素
    const { data: riskFactors } = await client
      .from('disqualification_risks')
      .select('*')
      .eq('project_id', id);

    // 获取章节内容
    const { data: sections } = await client
      .from('bid_sections')
      .select('*')
      .eq('project_id', id);

    // 构建内容对象
    const content = {
      project: project.metadata?.tender_extraction || {},
      sections: sections || [],
      outline: project.metadata?.outline,
    };

    // 执行校验
    const validationService = createContentValidationService();
    const report = await validationService.validate(
      id,
      content,
      scoringItems || [],
      riskFactors || []
    );

    // 保存校验结果
    const validationResults = report.results.map(result => ({
      project_id: id,
      document_id: sectionId,
      validation_type: result.validationType,
      passed: result.passed,
      score: result.score,
      issues: result.issues,
      details: result.details,
    }));

    for (const result of validationResults) {
      await client
        .from('validation_results')
        .insert(result);
    }

    return NextResponse.json({
      success: true,
      data: {
        report,
        validationId: `validation-${Date.now()}`,
      },
    });
  } catch (error) {
    console.error('执行校验失败:', error);
    return NextResponse.json(
      { success: false, error: '执行校验失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/validation - 清除校验历史
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from('validation_results')
      .delete()
      .eq('project_id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '校验历史已清除',
    });
  } catch (error) {
    console.error('清除校验历史失败:', error);
    return NextResponse.json(
      { success: false, error: '清除校验历史失败' },
      { status: 500 }
    );
  }
}

/**
 * 从校验结果生成汇总报告
 */
function generateSummaryFromResults(results: any[]): {
  overallPassed: boolean;
  overallScore: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  lastValidated: string;
} {
  if (results.length === 0) {
    return {
      overallPassed: true,
      overallScore: 100,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
      lastValidated: new Date().toISOString(),
    };
  }

  const allIssues = results.flatMap(r => r.issues || []);
  const criticalIssues = allIssues.filter((i: any) => i.severity === 'critical').length;
  const highIssues = allIssues.filter((i: any) => i.severity === 'high').length;
  const mediumIssues = allIssues.filter((i: any) => i.severity === 'medium').length;
  const lowIssues = allIssues.filter((i: any) => i.severity === 'low').length;

  const avgScore = results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length;
  const overallPassed = criticalIssues === 0 && avgScore >= 60;

  return {
    overallPassed,
    overallScore: Math.round(avgScore * 100) / 100,
    criticalIssues,
    highIssues,
    mediumIssues,
    lowIssues,
    lastValidated: results[0]?.validated_at || new Date().toISOString(),
  };
}
