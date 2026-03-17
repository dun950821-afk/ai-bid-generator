import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/projects/[id]/scoring-items - 获取项目的评分项
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const items = await prisma.scoringItem.findMany({
      where: { project_id: id },
      orderBy: [
        { item_type: 'asc' },
        { order_index: 'asc' },
      ],
    });

    // 统计摘要
    const summary = {
      totalScore: items.reduce((sum: number, item: any) => sum + item.max_score, 0),
      itemCount: items.length,
      technicalScore: items
        .filter((i: any) => i.item_type === 'technical')
        .reduce((sum: number, item: any) => sum + item.max_score, 0),
      technicalItemCount: items.filter((i: any) => i.item_type === 'technical').length,
      businessScore: items
        .filter((i: any) => i.item_type === 'business')
        .reduce((sum: number, item: any) => sum + item.max_score, 0),
      businessItemCount: items.filter((i: any) => i.item_type === 'business').length,
      priceScore: items
        .filter((i: any) => i.item_type === 'price')
        .reduce((sum: number, item: any) => sum + item.max_score, 0),
      priceItemCount: items.filter((i: any) => i.item_type === 'price').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        items,
        summary,
      },
    });
  } catch (error) {
    console.error('获取评分项失败:', error);
    return NextResponse.json(
      { success: false, error: '获取评分项失败' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/scoring-items - 创建评分项
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      item_name,
      item_type,
      max_score,
      scoring_rules,
      reference_text,
      order_index,
    } = body;

    const item = await prisma.scoringItem.create({
      data: {
        project_id: id,
        item_name,
        item_type,
        max_score: max_score || 0,
        scoring_rules: scoring_rules || [],
        reference_text,
        order_index: order_index || 0,
        response_status: 'unresponded',
      },
    });

    return NextResponse.json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error('创建评分项失败:', error);
    return NextResponse.json(
      { success: false, error: '创建评分项失败' },
      { status: 500 }
    );
  }
}
