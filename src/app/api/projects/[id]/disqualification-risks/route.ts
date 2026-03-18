/**
 * 废标风险管理API
 * 管理废标风险的识别、响应和验证
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/projects/[id]/disqualification-risks - 获取废标风险列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');

    const client = getSupabaseClient();

    let query = client
      .from('disqualification_risks')
      .select('*')
      .eq('project_id', id)
      .order('severity', { ascending: false });

    if (status) {
      query = query.eq('response_status', status);
    }
    if (severity) {
      query = query.eq('severity', severity);
    }

    const { data: risks, error } = await query;

    if (error) throw error;

    // 统计信息
    const summary = {
      total: risks?.length || 0,
      unresponded: risks?.filter(r => r.response_status === 'unresponded').length || 0,
      responded: risks?.filter(r => r.response_status === 'responded').length || 0,
      verified: risks?.filter(r => r.response_status === 'verified').length || 0,
      high: risks?.filter(r => r.severity === 'high').length || 0,
      medium: risks?.filter(r => r.severity === 'medium').length || 0,
      low: risks?.filter(r => r.severity === 'low').length || 0,
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
      { success: false, error: '获取废标风险失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/disqualification-risks - 添加废标风险
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { riskType, riskDescription, sourceText, severity = 'high' } = body;

    if (!riskType || !riskDescription) {
      return NextResponse.json(
        { success: false, error: '风险类型和描述不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { data: risk, error } = await client
      .from('disqualification_risks')
      .insert({
        project_id: id,
        risk_type: riskType,
        risk_description: riskDescription,
        source_text: sourceText,
        severity,
        response_status: 'unresponded',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: risk,
    });
  } catch (error) {
    console.error('添加废标风险失败:', error);
    return NextResponse.json(
      { success: false, error: '添加废标风险失败' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]/disqualification-risks - 更新风险响应
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { riskId, responseStatus, responseContent } = body;

    if (!riskId) {
      return NextResponse.json(
        { success: false, error: '风险ID不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const updateData: any = {};
    if (responseStatus) {
      updateData.response_status = responseStatus;
    }
    if (responseContent !== undefined) {
      updateData.response_content = responseContent;
      updateData.responded_at = new Date().toISOString();
    }

    const { error } = await client
      .from('disqualification_risks')
      .update(updateData)
      .eq('id', riskId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '风险响应已更新',
    });
  } catch (error) {
    console.error('更新风险响应失败:', error);
    return NextResponse.json(
      { success: false, error: '更新风险响应失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/disqualification-risks - 删除废标风险
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const riskId = searchParams.get('riskId');

    if (!riskId) {
      return NextResponse.json(
        { success: false, error: '风险ID不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from('disqualification_risks')
      .delete()
      .eq('id', riskId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '风险已删除',
    });
  } catch (error) {
    console.error('删除风险失败:', error);
    return NextResponse.json(
      { success: false, error: '删除风险失败' },
      { status: 500 }
    );
  }
}
