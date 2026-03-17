import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface ValidationResult {
  overallScore: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  suggestions: string[];
  sections: any[];
}

// POST /api/projects/[id]/validate - 校验标书内容
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    const outline = (project.metadata as any)?.outline;
    const sectionContents = (project.metadata as any)?.sectionContents || {};

    if (!outline) {
      return NextResponse.json(
        { success: false, error: '请先生成标书大纲' },
        { status: 400 }
      );
    }

    // 获取评分项和风险
    const scoringItems = await prisma.scoringItem.findMany({
      where: { project_id: id },
    });

    const risks = await prisma.disqualificationRisk.findMany({
      where: { project_id: id },
    });

    // 执行校验
    const report: ValidationResult = await validateBidDocument({
      projectId: id,
      outline,
      sectionContents,
      scoringItems,
      risks,
    });

    // 更新项目元数据
    await prisma.project.update({
      where: { id },
      data: {
        metadata: {
          ...(project.metadata as any),
          validationReport: report,
          validatedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('校验失败:', error);
    return NextResponse.json(
      { success: false, error: '校验失败' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[id]/validate - 获取校验报告
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      select: { metadata: true },
    });

    const report = (project?.metadata as any)?.validationReport || null;

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('获取校验报告失败:', error);
    return NextResponse.json(
      { success: false, error: '获取校验报告失败' },
      { status: 500 }
    );
  }
}

// 校验函数
async function validateBidDocument(params: {
  projectId: string;
  outline: any;
  sectionContents: Record<string, any>;
  scoringItems: any[];
  risks: any[];
}): Promise<ValidationResult> {
  const { outline, sectionContents, scoringItems, risks } = params;
  
  let totalScore = 100;
  let criticalIssues = 0;
  let highIssues = 0;
  let mediumIssues = 0;
  let lowIssues = 0;
  const suggestions: string[] = [];

  // 检查必需章节是否都有内容
  function checkSections(sections: any[]) {
    for (const section of sections) {
      if (section.isRequired && !sectionContents[section.id]) {
        criticalIssues++;
        suggestions.push(`必需章节"${section.title}"缺少内容`);
      }
      
      if (section.children && section.children.length > 0) {
        checkSections(section.children);
      }
    }
  }
  checkSections(outline.sections || []);

  // 检查评分项覆盖
  const coveredScoringItems = new Set<string>();
  for (const section of outline.sections || []) {
    if (section.scoringItemIds) {
      section.scoringItemIds.forEach((id: string) => coveredScoringItems.add(id));
    }
  }
  
  const uncoveredItems = scoringItems.filter((item: any) => !coveredScoringItems.has(item.id));
  if (uncoveredItems.length > 0) {
    highIssues += uncoveredItems.length;
    suggestions.push(`有${uncoveredItems.length}个评分项未在标书中响应`);
  }

  // 检查废标风险响应
  const unrespondedRisks = risks.filter((r: any) => r.response_status === 'unresponded');
  if (unrespondedRisks.length > 0) {
    criticalIssues += unrespondedRisks.filter((r: any) => r.severity === 'critical').length;
    highIssues += unrespondedRisks.filter((r: any) => r.severity === 'high').length;
    mediumIssues += unrespondedRisks.filter((r: any) => r.severity === 'medium').length;
    lowIssues += unrespondedRisks.filter((r: any) => r.severity === 'low').length;
    suggestions.push(`有${unrespondedRisks.length}个废标风险项未响应`);
  }

  // 计算得分
  totalScore -= criticalIssues * 20;
  totalScore -= highIssues * 10;
  totalScore -= mediumIssues * 5;
  totalScore -= lowIssues * 2;
  totalScore = Math.max(0, totalScore);

  return {
    overallScore: totalScore,
    criticalIssues,
    highIssues,
    mediumIssues,
    lowIssues,
    suggestions,
    sections: outline.sections || [],
  };
}
