/**
 * 评分项管理API
 * GET: 获取项目的评分项列表
 * POST: 创建评分项（手动添加或批量导入）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createScoringExtractionService } from '@/lib/services/scoring-extraction';

// 临时存储（后续接入数据库）
const scoringItemsStore = new Map<string, any[]>();

/**
 * 获取项目的评分项列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const itemType = searchParams.get('itemType');
    const responseStatus = searchParams.get('responseStatus');

    // 从存储中获取评分项
    let items = scoringItemsStore.get(projectId) || [];

    // 过滤
    if (itemType) {
      items = items.filter((item) => item.itemType === itemType);
    }
    if (responseStatus) {
      items = items.filter((item) => item.responseStatus === responseStatus);
    }

    // 计算汇总信息
    const summary = {
      totalScore: items.reduce((sum, item) => sum + item.maxScore, 0),
      technicalScore: items
        .filter((item) => item.itemType === 'technical')
        .reduce((sum, item) => sum + item.maxScore, 0),
      businessScore: items
        .filter((item) => item.itemType === 'business')
        .reduce((sum, item) => sum + item.maxScore, 0),
      priceScore: items
        .filter((item) => item.itemType === 'price')
        .reduce((sum, item) => sum + item.maxScore, 0),
      itemCount: items.length,
      technicalItemCount: items.filter((item) => item.itemType === 'technical').length,
      businessItemCount: items.filter((item) => item.itemType === 'business').length,
      priceItemCount: items.filter((item) => item.itemType === 'price').length,
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
      {
        success: false,
        error: error instanceof Error ? error.message : '获取评分项失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建评分项
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();

    // 初始化项目存储
    if (!scoringItemsStore.has(projectId)) {
      scoringItemsStore.set(projectId, []);
    }

    const items = scoringItemsStore.get(projectId)!;

    // 批量创建
    if (Array.isArray(body.items)) {
      const newItems = body.items.map((item: any) => ({
        id: crypto.randomUUID(),
        projectId,
        ...item,
        responseStatus: item.responseStatus || 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      items.push(...newItems);

      return NextResponse.json({
        success: true,
        data: {
          created: newItems.length,
          items: newItems,
        },
      });
    }

    // 单个创建
    const newItem = {
      id: crypto.randomUUID(),
      projectId,
      ...body,
      responseStatus: body.responseStatus || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    items.push(newItem);

    return NextResponse.json({
      success: true,
      data: newItem,
    });
  } catch (error) {
    console.error('创建评分项失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建评分项失败',
      },
      { status: 500 }
    );
  }
}
