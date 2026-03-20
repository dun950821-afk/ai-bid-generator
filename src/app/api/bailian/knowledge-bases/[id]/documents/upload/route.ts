/**
 * 百炼知识库文档上传 API
 * 
 * POST /api/bailian/knowledge-bases/[id]/documents/upload
 * 上传文档到百炼知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBailianKnowledgeService, getBailianSettings } from '@/lib/bailian/service';

export const maxDuration = 300; // 最长运行时间 5 分钟
export const runtime = 'nodejs';

/**
 * POST - 上传文档到百炼知识库
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    
    // 获取表单数据
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const parser = formData.get('parser') as string | null;
    const tagsStr = formData.get('tags') as string | null;
    
    if (!file) {
      return NextResponse.json({
        success: false,
        error: '未提供文件',
      }, { status: 400 });
    }

    // 解析标签
    let tags: string[] = [];
    if (tagsStr) {
      try {
        tags = JSON.parse(tagsStr);
      } catch {
        tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    console.log(`[百炼上传] 开始上传文件: ${file.name}, 大小: ${file.size} bytes, 知识库: ${knowledgeBaseId}`);

    // 获取百炼服务
    const service = await getBailianKnowledgeService();
    const settings = await getBailianSettings();
    
    if (!settings) {
      return NextResponse.json({
        success: false,
        error: '百炼配置未设置',
      }, { status: 400 });
    }

    // 将文件转换为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传文档
    const result = await service.uploadDocument({
      knowledgeBaseId,
      fileBuffer: buffer,
      fileName: file.name,
      parser: parser || settings.defaultParser,
      tags: tags.length > 0 ? tags : undefined,
    });

    if (!result.success || !result.data) {
      console.error('[百炼上传] 上传失败:', result.message);
      return NextResponse.json({
        success: false,
        error: result.message || '上传失败',
      }, { status: 500 });
    }

    const documentId = result.data.id;

    // 将文档添加到知识库
    await service.addDocumentToKnowledgeBase({
      knowledgeBaseId,
      documentId,
    });

    console.log(`[百炼上传] 上传流程完成，文档ID: ${documentId}`);

    return NextResponse.json({
      success: true,
      data: {
        documentId,
        name: result.data.name,
        status: result.data.status,
      },
    });
  } catch (error: any) {
    console.error('[百炼上传] 上传异常:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '上传失败',
    }, { status: 500 });
  }
}
