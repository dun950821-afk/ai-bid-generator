import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OUTLINE_GENERATION_PROMPT } from '@/lib/prompts/outline-generation';
import { loadModel } from '@/lib/llm';

// POST /api/projects/[id]/outline - 生成标书大纲
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 获取项目的评分项
    const scoringItems = await prisma.scoringItem.findMany({
      where: { project_id: id },
      orderBy: [{ item_type: 'asc' }, { order_index: 'asc' }],
    });

    if (scoringItems.length === 0) {
      return NextResponse.json(
        { success: false, error: '请先提取评分项' },
        { status: 400 }
      );
    }

    // 获取废标风险
    const risks = await prisma.disqualificationRisk.findMany({
      where: { project_id: id },
    });

    // 格式化评分项数据
    const scoringItemsText = scoringItems
      .map(
        (item: any) =>
          `- [${item.item_type}] ${item.item_name} (${item.max_score}分)\n  细则: ${item.scoring_rules
            .map((r: any) => r.rule || r)
            .join('; ')}`
      )
      .join('\n');

    const risksText = risks
      .map((risk: any) => `- [${risk.severity}] ${risk.risk_type}: ${risk.risk_description}`)
      .join('\n');

    // 构建Prompt
    const prompt = OUTLINE_GENERATION_PROMPT
      .replace('{scoringItems}', scoringItemsText)
      .replace('{risks}', risksText);

    // 调用LLM生成大纲
    const model = loadModel();
    const response = await model.invoke(prompt);

    // 解析响应
    let outline;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        outline = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析LLM响应');
      }
    } catch (e) {
      console.error('解析响应失败:', e);
      return NextResponse.json(
        { success: false, error: '解析大纲失败' },
        { status: 500 }
      );
    }

    // 为每个章节分配评分项ID
    const scoringItemsMap = new Map<string, any>(
      scoringItems.map((item: any) => [item.item_name, item.id])
    );

    function assignScoringItems(sections: any[]): any[] {
      return sections.map((section) => {
        const matchingItemIds: string[] = [];

        // 匹配评分项
        scoringItems.forEach((item: any) => {
          if (
            section.title.includes(item.item_name) ||
            item.item_name.includes(section.title) ||
            (section.relatedKeywords &&
              section.relatedKeywords.some((kw: string) =>
                item.item_name.includes(kw)
              ))
          ) {
            matchingItemIds.push(item.id);
          }
        });

        const result: any = {
          id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: section.title,
          isRequired: section.isRequired || false,
          scoringItemIds: matchingItemIds,
        };

        if (section.children && section.children.length > 0) {
          result.children = assignScoringItems(section.children);
        }

        return result;
      });
    }

    outline.sections = assignScoringItems(outline.sections || []);

    // 更新项目
    const project = await prisma.project.findUnique({ where: { id } });
    await prisma.project.update({
      where: { id },
      data: {
        metadata: {
          ...((project?.metadata as any) || {}),
          outline,
          createdAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        outline,
        coverage: {
          totalScoringItems: scoringItems.length,
          mappedScoringItems: new Set(
            outline.sections.flatMap((s: any) => s.scoringItemIds || [])
          ).size,
        },
      },
    });
  } catch (error) {
    console.error('生成大纲失败:', error);
    return NextResponse.json(
      { success: false, error: '生成大纲失败' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[id]/outline - 获取大纲
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

    const outline = (project?.metadata as any)?.outline || null;

    return NextResponse.json({
      success: true,
      data: outline,
    });
  } catch (error) {
    console.error('获取大纲失败:', error);
    return NextResponse.json(
      { success: false, error: '获取大纲失败' },
      { status: 500 }
    );
  }
}
