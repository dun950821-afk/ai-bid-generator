/**
 * 文档上传API
 * POST: 上传文档到对象存储
 */

import { NextRequest, NextResponse } from 'next/server';
import { createStorageService } from '@/lib/services/storage-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 上传文档
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const knowledgeBaseId = formData.get('knowledgeBaseId') as string;
    const uploadedBy = formData.get('uploadedBy') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未提供文件' },
        { status: 400 }
      );
    }

    // 验证文件类型
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
    ];

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf'];

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(fileExtension || '')
    ) {
      return NextResponse.json(
        { success: false, error: '不支持的文件类型，仅支持PDF、Word、TXT、RTF格式' },
        { status: 400 }
      );
    }

    // 验证文件大小（最大50MB）
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: '文件大小超过限制（最大50MB）' },
        { status: 400 }
      );
    }

    // 读取文件内容
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 上传到对象存储
    const storageService = createStorageService();
    const storagePath = `documents/${knowledgeBaseId || 'general'}/${Date.now()}_${file.name}`;
    const uploadResult = await storageService.uploadFile(
      fileBuffer,
      storagePath,
      file.type
    );

    if (!uploadResult.success || !uploadResult.key) {
      return NextResponse.json(
        { success: false, error: uploadResult.error || '上传失败' },
        { status: 500 }
      );
    }

    const fileKey = uploadResult.key;

    // 如果提供了知识库ID，创建文档记录
    if (knowledgeBaseId) {
      const client = getSupabaseClient();

      // 检查知识库是否存在
      const { data: kb, error: kbError } = await client
        .from('knowledge_bases')
        .select('id')
        .eq('id', knowledgeBaseId)
        .single();

      if (!kbError && kb) {
        // 创建文档记录
        await client.from('knowledge_documents').insert({
          knowledge_base_id: knowledgeBaseId,
          name: file.name,
          original_name: file.name,
          file_type: fileExtension || file.type,
          file_size: file.size,
          storage_path: fileKey,
          storage_type: 's3',
          vector_status: 'pending',
          uploaded_by: uploadedBy,
        });
      }
    }

    // 生成访问URL
    const accessUrl = await storageService.getFileUrl(fileKey);

    return NextResponse.json({
      success: true,
      data: {
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        accessUrl,
      },
    });
  } catch (error) {
    console.error('文件上传失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '文件上传失败',
      },
      { status: 500 }
    );
  }
}
