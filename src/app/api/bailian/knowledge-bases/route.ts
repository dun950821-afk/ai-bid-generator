/**
 * 百炼知识库管理API
 * GET: 获取知识库列表
 * POST: 创建知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取知识库列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const service = await createBailianKnowledgeService();
    const result = await service.listKnowledgeBases({ limit, offset });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] List knowledge bases failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取知识库列表失败' },
      { status: 500 }
    );
  }
}

/**
 * 创建知识库
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, embeddingModel, rerankModel, chunkSize, overlapSize } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '知识库名称不能为空' },
        { status: 400 }
      );
    }

    const service = await createBailianKnowledgeService();
    const result = await service.createKnowledgeBase({
      name,
      description,
      embeddingModel,
      rerankModel,
      chunkSize,
      overlapSize,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Create knowledge base failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '创建知识库失败' },
      { status: 500 }
    );
  }
}
