/**
 * 文档上传API
 * POST: 上传文档到对象存储，同时异步上传到百炼平台
 * 
 * 优化：
 * 1. 上传到对象存储后立即返回
 * 2. 异步上传到百炼平台获取file_id
 * 3. 返回uploadId用于后续查询上传状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { createStorageService } from '@/lib/services/storage-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getLLMFileService } from '@/lib/services/llm-file-service';
import { getLLMFileCacheService } from '@/lib/services/llm-file-cache-service';
import { randomUUID } from 'crypto';

/**
 * 上传文档
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const knowledgeBaseId = formData.get('knowledgeBaseId') as string;
    const uploadedBy = formData.get('uploadedBy') as string;
    const uploadToLLM = formData.get('uploadToLLM') !== 'false'; // 默认上传到百炼

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

    // 生成唯一的uploadId
    const uploadId = randomUUID();

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

    // 注意：本地知识库表已迁移到百炼API，不再创建本地文档记录
    // 如果需要关联知识库，请在百炼API层面处理

    // 生成访问URL
    const accessUrl = await storageService.getFileUrl(fileKey);

    // 【新增】异步上传到百炼平台（不等待结果）
    if (uploadToLLM && fileExtension === 'pdf') {
      console.log(`[Upload] 开始异步上传到百炼: ${file.name}`);
      
      // 不等待，直接在后台执行
      uploadToLLMAsync(uploadId, accessUrl, file.name, file.size).catch(err => {
        console.error(`[Upload] 百炼上传失败:`, err);
      });

      return NextResponse.json({
        success: true,
        data: {
          fileKey,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          accessUrl,
          uploadId, // 新增：用于查询上传状态
          llmUploadStatus: 'uploading', // 新增：百炼上传状态
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        accessUrl,
        uploadId,
        llmUploadStatus: 'skipped', // 非PDF文件跳过百炼上传
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

/**
 * 异步上传到百炼平台
 */
async function uploadToLLMAsync(
  uploadId: string,
  fileUrl: string,
  filename: string,
  fileSize: number
): Promise<void> {
  const cacheService = getLLMFileCacheService();
  
  try {
    // 标记为上传中
    // 先尝试保存一个pending状态的记录
    const client = getSupabaseClient();
    await client.from('llm_file_cache').upsert({
      upload_id: uploadId,
      llm_file_id: 'pending',
      filename,
      file_url: fileUrl,
      file_size: fileSize,
      status: 'uploading',
    }, { onConflict: 'upload_id' });

    // 上传到百炼
    const llmFileService = getLLMFileService();
    const fileInfo = await llmFileService.uploadFile(fileUrl, filename);

    // 保存到缓存
    await cacheService.saveFileId(uploadId, fileInfo.id, filename, fileUrl, fileSize);
    
    console.log(`[Upload] 百炼上传成功: uploadId=${uploadId}, llmFileId=${fileInfo.id}`);
  } catch (error) {
    console.error(`[Upload] 百炼上传失败:`, error);
    
    // 标记为错误
    await cacheService.markError(uploadId);
  }
}

/**
 * GET: 查询百炼上传状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId');

    if (!uploadId) {
      return NextResponse.json(
        { success: false, error: '缺少uploadId参数' },
        { status: 400 }
      );
    }

    const cacheService = getLLMFileCacheService();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('llm_file_cache')
      .select('*')
      .eq('upload_id', uploadId)
      .single();

    if (error || !data) {
      return NextResponse.json({
        success: true,
        data: {
          status: 'not_found',
          llmFileId: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: data.status,
        llmFileId: data.status === 'ready' ? data.llm_file_id : null,
        filename: data.filename,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error('查询上传状态失败:', error);
    return NextResponse.json(
      { success: false, error: '查询失败' },
      { status: 500 }
    );
  }
}
