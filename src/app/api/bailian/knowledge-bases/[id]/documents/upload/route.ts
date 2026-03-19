/**
 * 百炼知识库文档上传 API
 * 
 * POST /api/bailian/knowledge-bases/[id]/documents/upload
 * 上传文档到百炼知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianServiceFromSettings } from '@/lib/bailian/service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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

    // 创建百炼服务
    const { service, settings } = await createBailianServiceFromSettings();

    // 将文件转换为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. 上传文档到百炼
    const uploadResult = await service.document.uploadBuffer(
      buffer,
      file.name,
      {
        parser: parser as any || settings.defaultParser,
        tags: tags.length > 0 ? tags : undefined,
      }
    );

    if (!uploadResult.success || !uploadResult.data) {
      console.error('[百炼上传] 上传失败:', uploadResult.message);
      return NextResponse.json({
        success: false,
        error: uploadResult.message || '上传失败',
      }, { status: 500 });
    }

    const fileId = uploadResult.data.fileId;
    console.log(`[百炼上传] 文件上传成功，fileId: ${fileId}，等待解析...`);

    // 2. 等待解析完成
    const parseResult = await service.document.waitForParsing(
      fileId,
      settings.parserTimeout
    );

    // 3. 将文档添加到知识库
    const addResult = await service.document.addToKnowledgeBase(
      knowledgeBaseId,
      [fileId]
    );

    if (!addResult.success) {
      console.warn('[百炼上传] 添加到知识库失败:', addResult.message);
    }

    // 4. 同步到本地数据库
    const supabase = getSupabaseClient();
    const { data: localDoc, error } = await supabase
      .from('knowledge_documents')
      .insert({
        knowledge_base_id: knowledgeBaseId,
        name: file.name,
        original_name: file.name,
        file_type: file.name.split('.').pop() || 'unknown',
        file_size: file.size,
        storage_path: fileId,
        storage_type: 'bailian',
        vector_status: parseResult.success && parseResult.data?.status === 'completed' 
          ? 'completed' 
          : parseResult.data?.status === 'failed' 
            ? 'failed' 
            : 'processing',
        vector_error: parseResult.data?.message,
        metadata: {
          bailian_file_id: fileId,
          parser: parser || settings.defaultParser,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('[百炼上传] 同步到本地数据库失败:', error);
    }

    console.log(`[百炼上传] 上传流程完成，文档ID: ${localDoc?.id || fileId}`);

    return NextResponse.json({
      success: true,
      data: {
        documentId: localDoc?.id || fileId,
        name: file.name,
        status: localDoc?.vector_status || 'processing',
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
