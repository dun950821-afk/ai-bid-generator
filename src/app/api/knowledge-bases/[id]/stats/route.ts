import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/knowledge-bases/[id]/stats - 获取知识库统计信息
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 获取文档数量
    const documentCount = await prisma.knowledgeDocument.count({
      where: { knowledge_base_id: id },
    });

    // 获取知识块数量
    const chunkCount = await prisma.knowledgeChunk.count({
      where: { knowledge_base_id: id },
    });

    // 获取总文件大小
    const documents = await prisma.knowledgeDocument.findMany({
      where: { knowledge_base_id: id },
      select: { file_size: true },
    });

    const totalSize = documents.reduce((sum: number, doc: any) => sum + doc.file_size, 0);

    // 获取状态分布
    const statusDistribution = await prisma.knowledgeDocument.groupBy({
      by: ['status'],
      where: { knowledge_base_id: id },
      _count: {
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        documentCount,
        chunkCount,
        totalSize,
        statusDistribution: statusDistribution.map((s: any) => ({
          status: s.status,
          count: s._count.status,
        })),
      },
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    return NextResponse.json(
      { success: false, error: '获取统计信息失败' },
      { status: 500 }
    );
  }
}
