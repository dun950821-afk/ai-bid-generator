import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { StorageService } from '@/lib/services/storage-service';

const storageService = new StorageService();

// GET /api/knowledge-bases/[id]/documents/[docId]/download - 获取文档下载链接
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
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 生成临时下载链接（有效期1小时）
    const downloadUrl = await storageService.generatePresignedUrl(doc.file_path, 3600);

    return NextResponse.json({
      success: true,
      data: {
        url: downloadUrl,
        fileName: doc.file_name,
        fileType: doc.file_type,
        fileSize: doc.file_size,
      },
    });
  } catch (error) {
    console.error('获取下载链接失败:', error);
    return NextResponse.json(
      { success: false, error: '获取下载链接失败' },
      { status: 500 }
    );
  }
}
