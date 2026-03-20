/**
 * 百炼知识库文档操作API
 * GET: 获取文档详情
 * DELETE: 删除文档（从百炼平台删除）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取文档详情
 * @description 获取单个文档的详细信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const service = await createBailianKnowledgeService();
    
    // 获取文档详情
    const result = await service.getFileDetail(id, docId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || '获取文档详情失败' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Get document detail failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文档详情失败' },
      { status: 500 }
    );
  }
}

/**
 * 删除文档
 * @description 从百炼平台删除文档
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const service = await createBailianKnowledgeService();
    
    // 从百炼平台删除文档
    const result = await service.deleteDocument(id, docId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || '删除文档失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '文档已删除',
    });
  } catch (error: any) {
    console.error('[Bailian API] Delete document failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '删除文档失败' },
      { status: 500 }
    );
  }
}
