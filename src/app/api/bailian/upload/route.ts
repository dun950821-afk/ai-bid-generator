/**
 * 百炼文档上传API
 * POST: 上传文档到知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 上传文档
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const knowledgeBaseId = formData.get('knowledgeBaseId') as string;
    const parser = formData.get('parser') as string;
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : [];

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未提供文件' },
        { status: 400 }
      );
    }

    if (!knowledgeBaseId) {
      return NextResponse.json(
        { success: false, error: '未提供知识库ID' },
        { status: 400 }
      );
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const service = await createBailianKnowledgeService();
    
    // 上传文档
    const uploadResult = await service.uploadDocument({
      knowledgeBaseId,
      fileBuffer,
      fileName: file.name,
      parser,
      tags,
    });

    // 如果上传成功，将文档添加到知识库
    if (uploadResult.success && uploadResult.data) {
      const docId = uploadResult.data.id;
      if (docId) {
        try {
          await service.addDocumentToKnowledgeBase({
            knowledgeBaseId,
            documentId: docId,
          });
        } catch (addError) {
          console.error('[Bailian] Failed to add document to knowledge base:', addError);
          // 不影响上传结果的返回
        }
      }
    }

    return NextResponse.json(uploadResult);
  } catch (error: any) {
    console.error('[Bailian API] Upload document failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '上传文档失败' },
      { status: 500 }
    );
  }
}
