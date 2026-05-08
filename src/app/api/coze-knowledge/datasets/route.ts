import { NextRequest, NextResponse } from 'next/server';
import {
  listDatasets,
  createDataset,
  updateDataset,
  deleteDataset,
} from '@/lib/services/coze-api-client';

/**
 * GET /api/coze-knowledge/datasets - 获取知识库列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '20', 10);

    const result = await listDatasets(page, pageSize);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Coze Datasets] 获取知识库列表失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取知识库列表失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coze-knowledge/datasets - 创建知识库
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, format_type } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '知识库名称不能为空' },
        { status: 400 }
      );
    }

    const result = await createDataset(name, format_type || 0);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Coze Datasets] 创建知识库失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建知识库失败' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/coze-knowledge/datasets - 修改知识库
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataset_id, name, format_type } = body;

    if (!dataset_id) {
      return NextResponse.json(
        { success: false, error: 'dataset_id 不能为空' },
        { status: 400 }
      );
    }

    await updateDataset(dataset_id, name, format_type);

    return NextResponse.json({
      success: true,
      message: '知识库已更新',
    });
  } catch (error) {
    console.error('[Coze Datasets] 修改知识库失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '修改知识库失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coze-knowledge/datasets - 删除知识库
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get('dataset_id');

    if (!datasetId) {
      return NextResponse.json(
        { success: false, error: 'dataset_id 不能为空' },
        { status: 400 }
      );
    }

    await deleteDataset(datasetId);

    return NextResponse.json({
      success: true,
      message: '知识库已删除',
    });
  } catch (error) {
    console.error('[Coze Datasets] 删除知识库失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除知识库失败' },
      { status: 500 }
    );
  }
}
