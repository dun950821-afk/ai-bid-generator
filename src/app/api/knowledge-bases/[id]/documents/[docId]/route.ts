import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { StorageService } from '@/lib/services/storage-service';

const storageService = new StorageService();

// GET /api/knowledge-bases/[id]/documents/[docId] - 获取文档详情
export async function GET(
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
      include: {
        knowledge_chunks: {
          select: {
            id: true,
            chunk_index: true,
            content: true,
            created_at: true,
          },
          orderBy: { chunk_index: 'asc' },
        },
      },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    console.error('获取文档详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档详情失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/knowledge-bases/[id]/documents/[docId] - 删除文档
export async function DELETE(
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

    // 删除存储文件
    try {
      await storageService.deleteFile(doc.file_path);
    } catch (e) {
      console.error('删除文件失败:', e);
    }

    // 删除知识块
    await prisma.knowledgeChunk.deleteMany({
      where: { document_id: docId },
    });

    // 删除文档记录
    await prisma.knowledgeDocument.delete({
      where: { id: docId },
    });

    return NextResponse.json({
      success: true,
      message: '文档已删除',
    });
  } catch (error) {
    console.error('删除文档失败:', error);
    return NextResponse.json(
      { success: false, error: '删除文档失败' },
      { status: 500 }
    );
  }
}
