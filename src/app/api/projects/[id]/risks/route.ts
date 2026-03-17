/**
 * 废标风险管理API
 * GET: 获取项目的废标风险列表
 * POST: 创建废标风险项
 */

import { NextRequest, NextResponse } from 'next/server';
import { createScoringExtractionService } from '@/lib/services/scoring-extraction';
import { HeaderUtils } from 'coze-coding-dev-sdk';

// 临时存储（后续接入数据库）
const risksStore = new Map<string, any[]>();

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

    // 从存储中获取风险项
    let risks = risksStore.get(projectId) || [];

    // 过滤
    if (riskType) {
      risks = risks.filter((risk) => risk.riskType === riskType);
    }
    if (severity) {
      risks = risks.filter((risk) => risk.severity === severity);
    }
    if (responseStatus) {
      risks = risks.filter((risk) => risk.responseStatus === responseStatus);
    }

    // 计算汇总信息
    const summary = {
      totalRisks: risks.length,
      criticalRisks: risks.filter((r) => r.severity === 'critical').length,
      highRisks: risks.filter((r) => r.severity === 'high').length,
      mediumRisks: risks.filter((r) => r.severity === 'medium').length,
      lowRisks: risks.filter((r) => r.severity === 'low').length,
      unrespondedRisks: risks.filter((r) => r.responseStatus === 'unresponded').length,
      respondedRisks: risks.filter((r) => r.responseStatus === 'responded').length,
      verifiedRisks: risks.filter((r) => r.responseStatus === 'verified').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        risks,
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

    // 初始化项目存储
    if (!risksStore.has(projectId)) {
      risksStore.set(projectId, []);
    }

    const risks = risksStore.get(projectId)!;

    // 批量创建
    if (Array.isArray(body.risks)) {
      const newRisks = body.risks.map((risk: any) => ({
        id: crypto.randomUUID(),
        projectId,
        ...risk,
        responseStatus: risk.responseStatus || 'unresponded',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      risks.push(...newRisks);

      return NextResponse.json({
        success: true,
        data: {
          created: newRisks.length,
          risks: newRisks,
        },
      });
    }

    // 单个创建
    const newRisk = {
      id: crypto.randomUUID(),
      projectId,
      ...body,
      responseStatus: body.responseStatus || 'unresponded',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    risks.push(newRisk);

    return NextResponse.json({
      success: true,
      data: newRisk,
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
