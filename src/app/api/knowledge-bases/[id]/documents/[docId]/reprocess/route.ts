import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/knowledge-bases/[id]/documents/[docId]/reprocess - 重新处理文档
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const doc = await prisma.knowledgeDocument.findFirst({
      where: {
        id: docId,
        knowledge_base_id: id,
      },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 删除旧的知识块
    await prisma.knowledgeChunk.deleteMany({
      where: { document_id: docId },
    });

    // 更新状态为待处理
    await prisma.knowledgeDocument.update({
      where: { id: docId },
      data: {
        status: 'pending',
        processing_error: null,
      },
    });

    // TODO: 触发异步处理任务

    return NextResponse.json({
      success: true,
      message: '已提交重新处理',
    });
  } catch (error) {
    console.error('重新处理失败:', error);
    return NextResponse.json(
      { success: false, error: '重新处理失败' },
      { status: 500 }
    );
  }
}
