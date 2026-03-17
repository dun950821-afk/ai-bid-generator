/**
 * 废标风险管理API
 * GET: 获取项目的废标风险列表
 * POST: 创建废标风险项
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取项目的废标风险列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const riskType = searchParams.get('riskType');
    const severity = searchParams.get('severity');
    const responseStatus = searchParams.get('responseStatus');

    const client = getSupabaseClient();

    let query = client
      .from('disqualification_risks')
      .select('*')
      .eq('project_id', projectId)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: true });

    if (riskType) {
      query = query.eq('risk_type', riskType);
    }
    if (severity) {
      query = query.eq('severity', severity);
    }
    if (responseStatus) {
      query = query.eq('response_status', responseStatus);
    }

    const { data: risks, error } = await query;

    if (error) {
      console.error('获取废标风险失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 计算汇总信息
    const summary = {
      totalRisks: risks?.length || 0,
      criticalRisks: risks?.filter((r) => r.severity === 'critical').length || 0,
      highRisks: risks?.filter((r) => r.severity === 'high').length || 0,
      mediumRisks: risks?.filter((r) => r.severity === 'medium').length || 0,
      lowRisks: risks?.filter((r) => r.severity === 'low').length || 0,
      unrespondedRisks: risks?.filter((r) => r.response_status === 'unresponded').length || 0,
      respondedRisks: risks?.filter((r) => r.response_status === 'responded').length || 0,
      verifiedRisks: risks?.filter((r) => r.response_status === 'verified').length || 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        risks: risks || [],
        summary,
      },
    });
  } catch (error) {
    console.error('获取废标风险失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取废标风险失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建废标风险项
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
    if (Array.isArray(body.risks)) {
      const risksToInsert = body.risks.map((risk: any) => ({
        project_id: projectId,
        risk_type: risk.riskType,
        risk_description: risk.riskDescription,
        source_text: risk.sourceText,
        source_location: risk.sourceLocation,
        severity: risk.severity || 'high',
        extracted_from: risk.extractedFrom,
        confidence_score: risk.confidenceScore,
        response_status: 'unresponded',
      }));

      const { data, error } = await client
        .from('disqualification_risks')
        .insert(risksToInsert)
        .select();

      if (error) {
        console.error('批量创建废标风险失败:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          created: data.length,
          risks: data,
        },
      });
    }

    // 单个创建
    const { data, error } = await client
      .from('disqualification_risks')
      .insert({
        project_id: projectId,
        risk_type: body.riskType,
        risk_description: body.riskDescription,
        source_text: body.sourceText,
        source_location: body.sourceLocation,
        severity: body.severity || 'high',
        extracted_from: body.extractedFrom,
        confidence_score: body.confidenceScore,
        response_status: 'unresponded',
      })
      .select()
      .single();

    if (error) {
      console.error('创建废标风险失败:', error);
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
    console.error('创建废标风险失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建废标风险失败',
      },
      { status: 500 }
    );
  }
}
