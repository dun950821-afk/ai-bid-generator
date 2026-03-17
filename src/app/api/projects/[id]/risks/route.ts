import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/projects/[id]/risks - 获取项目的废标风险
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const risks = await prisma.disqualificationRisk.findMany({
      where: { project_id: id },
      orderBy: [
        { severity: 'asc' }, // critical > high > medium > low
        { created_at: 'asc' },
      ],
    });

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

    const risk = await prisma.disqualificationRisk.create({
      data: {
        project_id: id,
        risk_type,
        risk_description,
        severity: severity || 'medium',
        source_text,
        mitigation_suggestion,
        response_status: 'unresponded',
      },
    });

    return NextResponse.json({
      success: true,
      data: risk,
    });
  } catch (error) {
    console.error('创建废标风险失败:', error);
    return NextResponse.json(
      { success: false, error: '创建废标风险失败' },
      { status: 500 }
    );
  }
}
