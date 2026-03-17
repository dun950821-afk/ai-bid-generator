import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { StorageService } from '@/lib/services/storage-service';

const storageService = new StorageService();

// GET /api/knowledge-bases/[id]/documents - 获取知识库文档列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const documents = await prisma.knowledgeDocument.findMany({
      where: { knowledge_base_id: id },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        documents,
        total: documents.length,
      },
    });
  } catch (error) {
    console.error('获取文档列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档列表失败' },
      { status: 500 }
    );
  }
}

// POST /api/knowledge-bases/[id]/documents - 上传文档
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要上传的文件' },
        { status: 400 }
      );
    }

    const uploadedDocs = [];

    for (const file of files) {
      // 生成文件名
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `knowledge-bases/${id}/${fileName}`;

      // 上传到存储
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await storageService.uploadFile(buffer, filePath, file.type);

      // 创建文档记录
      const doc = await prisma.knowledgeDocument.create({
        data: {
          knowledge_base_id: id,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
          status: 'pending',
        },
      });

      uploadedDocs.push(doc);

      // TODO: 触发异步处理任务（分块、向量化）
      // 这里应该发送到消息队列
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: uploadedDocs,
        uploaded: uploadedDocs.length,
      },
    });
  } catch (error) {
    console.error('上传文档失败:', error);
    return NextResponse.json(
      { success: false, error: '上传文档失败' },
      { status: 500 }
    );
  }
}
