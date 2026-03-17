import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/projects/[id]/risks - 获取项目的废标风险
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('disqualification_risks')
      .select('*')
      .eq('project_id', id)
      .order('severity', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const risks = data || [];

    return NextResponse.json({
      success: true,
      data: {
        risks,
        summary: {
          total: risks.length,
          critical: risks.filter((r: any) => r.severity === 'critical').length,
          high: risks.filter((r: any) => r.severity === 'high').length,
          medium: risks.filter((r: any) => r.severity === 'medium').length,
          low: risks.filter((r: any) => r.severity === 'low').length,
          unresponded: risks.filter((r: any) => r.response_status === 'unresponded').length,
        },
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

// POST /api/projects/[id]/risks - 创建废标风险
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      risk_type,
      risk_description,
      severity,
      source_text,
      mitigation_suggestion,
    } = body;

    const client = getSupabaseClient();

    const { data, error } = await client
      .from('disqualification_risks')
      .insert({
        project_id: id,
        risk_type,
        risk_description,
        severity: severity || 'medium',
        source_text,
        mitigation_suggestion,
        response_status: 'unresponded',
      })
      .select()
      .single();

    if (error) {
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
      { success: false, error: '创建废标风险失败' },
      { status: 500 }
    );
  }
}
