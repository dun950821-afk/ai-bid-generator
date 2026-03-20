/**
 * 百炼文件下载 API
 * GET: 获取文件下载链接
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取文件下载信息
 * @description 从百炼API获取文件下载链接
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
        { success: false, error: result.message || '获取文件下载信息失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[Bailian API] Get file download info failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文件下载信息失败' },
      { status: 500 }
    );
  }
}
