/**
 * 百炼知识库文档API
 * GET: 获取文档列表（从百炼API获取）
 * POST: 上传文档
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindexdocuments
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取知识库文档列表
 * @description 从百炼API获取文档列表，支持状态过滤、名称搜索、模糊匹配、标签过滤
 * 
 * Query参数:
 * - limit: 每页数量，默认50
 * - offset: 偏移量，默认0
 * - status: 文档状态过滤 (INSERT_ERROR | RUNNING | DELETED | FINISH)
 * - name: 文件名称过滤（不含后缀）
 * - nameLike: 是否开启模糊匹配 (true/false)
 * - tags: 标签过滤，多个标签用逗号分隔（文档包含任一标签即可）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    // 分页参数
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // 过滤参数
    const status = searchParams.get('status') as 'INSERT_ERROR' | 'RUNNING' | 'DELETED' | 'FINISH' | null;
    const name = searchParams.get('name') || undefined;
    const nameLike = searchParams.get('nameLike') === 'true';
    
    // 标签过滤参数
    const tagsParam = searchParams.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : undefined;

    const service = await createBailianKnowledgeService();
    const result = await service.listKnowledgeBaseDocuments({
      knowledgeBaseId: id,
      limit,
      offset,
      documentStatus: status || undefined,
      documentName: name,
      enableNameLike: nameLike,
    });

    // 客户端标签过滤
    if (tags && tags.length > 0 && result.success && result.data) {
      const filteredDocuments = result.data.documents.filter((doc: any) => {
        const docTags = doc.tags?.map((t: any) => t.name) || doc.metadata?.tags || [];
        return tags.some(tag => docTags.includes(tag));
      });
      
      return NextResponse.json({
        ...result,
        data: {
          ...result.data,
          documents: filteredDocuments,
          total: filteredDocuments.length,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Get documents failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取文档列表失败' },
      { status: 500 }
    );
  }
}

/**
 * 上传文档到知识库
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const parser = formData.get('parser') as string;
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : [];

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未提供文件' },
        { status: 400 }
      );
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const service = await createBailianKnowledgeService();
    const result = await service.uploadDocument({
      knowledgeBaseId: id,
      fileBuffer,
      fileName: file.name,
      parser,
      tags,
    });

    // 如果上传成功，将文档添加到知识库
    if (result.success && result.data) {
      const docId = result.data.id;
      if (docId) {
        await service.addDocumentToKnowledgeBase({
          knowledgeBaseId: id,
          documentId: docId,
        });
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Upload document failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '上传文档失败' },
      { status: 500 }
    );
  }
}
