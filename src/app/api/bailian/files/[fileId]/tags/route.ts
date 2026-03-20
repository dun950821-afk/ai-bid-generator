/**
 * 百炼文件标签管理 API
 * GET: 获取文件标签
 * PUT: 更新文件标签
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取文件标签
 * @description 获取文件的标签信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const service = await createBailianKnowledgeService();
    const result = await service.getFileDownloadInfo(fileId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || '获取文件信息失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        fileId: result.data?.id,
        tags: result.data?.tags || [],
      },
    });
  } catch (error: any) {
    console.error('[Bailian API] Get file tags failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文件标签失败' },
      { status: 500 }
    );
  }
}

/**
 * 更新文件标签
 * @description 更新数据中心文件的标签信息
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const body = await request.json();
    const { tags } = body;

    // 验证参数
    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { success: false, error: '标签必须是数组格式' },
        { status: 400 }
      );
    }

    // 验证标签数量
    if (tags.length > 32) {
      return NextResponse.json(
        { success: false, error: '标签数量不能超过32个' },
        { status: 400 }
      );
    }

    // 验证每个标签的长度
    for (const tag of tags) {
      if (typeof tag !== 'string') {
        return NextResponse.json(
          { success: false, error: '标签必须是字符串' },
          { status: 400 }
        );
      }
      if (tag.length > 32) {
        return NextResponse.json(
          { success: false, error: `标签"${tag}"长度超过32个字符` },
          { status: 400 }
        );
      }
      if (tag.includes(' ')) {
        return NextResponse.json(
          { success: false, error: `标签"${tag}"不能包含空格` },
          { status: 400 }
        );
      }
    }

    const service = await createBailianKnowledgeService();
    const result = await service.updateFileTags(fileId, tags);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || '更新文件标签失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        fileId: result.data?.fileId || fileId,
        tags,
      },
    });
  } catch (error: any) {
    console.error('[Bailian API] Update file tags failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '更新文件标签失败' },
      { status: 500 }
    );
  }
}
