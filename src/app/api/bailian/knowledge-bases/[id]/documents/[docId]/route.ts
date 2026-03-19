/**
 * 百炼知识库文档操作API
 * DELETE: 删除文档（从百炼平台删除）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

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
