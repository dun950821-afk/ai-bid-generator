/**
 * 百炼文档预览API
 * GET: 获取文档预览URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取文档预览信息
 * @description 从百炼API获取文档预览URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const service = await createBailianKnowledgeService();
    const result = await service.getDocumentPreview(documentId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || '获取文档预览失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[Bailian API] Get document preview failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文档预览失败' },
      { status: 500 }
    );
  }
}
