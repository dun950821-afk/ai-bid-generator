/**
 * 百炼知识库文档API
 * GET: 获取文档列表
 * POST: 上传文档
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取知识库文档列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const client = getSupabaseClient();

    // 获取文档列表
    const { data: documents, error, count } = await client
      .from('knowledge_documents')
      .select(`
        *,
        tags:document_tags(
          id,
          name,
          color
        )
      `, { count: 'exact' })
      .eq('knowledge_base_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: documents || [],
        total: count || 0,
      },
    });
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
      const docId = result.data.id || (result.data as any).bailian_file_id;
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
