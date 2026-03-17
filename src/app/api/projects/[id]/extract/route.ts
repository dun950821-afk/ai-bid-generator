/**
 * 招标文档提取API
 * POST: 从招标文档中提取评分项和废标风险
 */

import { NextRequest, NextResponse } from 'next/server';
import { createScoringExtractionService } from '@/lib/services/scoring-extraction';
import { HeaderUtils } from 'coze-coding-dev-sdk';

// 临时存储（后续接入数据库）
const extractionResultsStore = new Map<string, any>();

/**
 * 从招标文档提取评分项和废标风险
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { documentText, documentName, extractionType = 'full' } = body;

    if (!documentText) {
      return NextResponse.json(
        { success: false, error: '缺少documentText参数' },
        { status: 400 }
      );
    }

    if (!documentName) {
      return NextResponse.json(
        { success: false, error: '缺少documentName参数' },
        { status: 400 }
      );
    }

    // 创建提取服务
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const extractionService = createScoringExtractionService(customHeaders);

    let result: any;

    // 根据提取类型执行不同的提取逻辑
    switch (extractionType) {
      case 'scoring':
        result = await extractionService.extractScoringItems(
          documentText,
          documentName
        );
        break;

      case 'risks':
        result = await extractionService.extractDisqualificationRisks(
          documentText,
          documentName
        );
        break;

      case 'full':
      default:
        result = await extractionService.extractFullInfo(documentText, documentName);
        break;
    }

    // 存储提取结果
    extractionResultsStore.set(projectId, {
      ...result,
      extractedAt: new Date(),
      documentName,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('招标文档提取失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '招标文档提取失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取提取结果
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const result = extractionResultsStore.get(projectId);

    if (!result) {
      return NextResponse.json(
        { success: false, error: '未找到提取结果' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('获取提取结果失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取提取结果失败',
      },
      { status: 500 }
    );
  }
}
