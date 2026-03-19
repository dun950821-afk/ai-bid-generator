/**
 * 分片上传 API
 * 支持大文件（最大 2GB）分片上传
 * 
 * 流程：
 * 1. POST /api/upload/chunk - 初始化上传，返回 uploadId
 * 2. POST /api/upload/chunk?uploadId=xxx&partNumber=1 - 上传分片
 * 3. POST /api/upload/chunk?complete=true - 完成上传，合并分片
 */

import { NextRequest, NextResponse } from 'next/server';
import { createStorageService } from '@/lib/services/storage-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { randomUUID } from 'crypto';

// 配置 API 路由：支持大文件上传（最大 2GB）
export const maxDuration = 300; // 最长运行时间 5 分钟
export const runtime = 'nodejs';

// 分片大小：5MB（适合 1MB/s 网速，每个分片约 5 秒）
const CHUNK_SIZE = 5 * 1024 * 1024;

// 上传会话缓存（生产环境应使用 Redis）
const uploadSessions = new Map<string, {
  fileName: string;
  fileSize: number;
  fileType: string;
  knowledgeBaseId?: string;
  uploadedBy?: string;
  storageKey: string;
  parts: Map<number, { etag: string; key: string }>;
  createdAt: Date;
}>();

/**
 * 初始化分片上传
 */
async function initMultipartUpload(
  fileName: string,
  fileSize: number,
  fileType: string,
  knowledgeBaseId?: string,
  uploadedBy?: string
) {
  const uploadId = randomUUID();
  const storageKey = `documents/${knowledgeBaseId || 'general'}/${Date.now()}_${fileName}`;
  
  uploadSessions.set(uploadId, {
    fileName,
    fileSize,
    fileType,
    knowledgeBaseId,
    uploadedBy,
    storageKey,
    parts: new Map(),
    createdAt: new Date(),
  });

  // 计算分片数量
  const totalParts = Math.ceil(fileSize / CHUNK_SIZE);

  return {
    uploadId,
    chunkSize: CHUNK_SIZE,
    totalParts,
    storageKey,
  };
}

/**
 * 上传单个分片
 */
async function uploadChunk(
  uploadId: string,
  partNumber: number,
  chunk: ArrayBuffer
) {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    throw new Error('上传会话不存在或已过期');
  }

  const storageService = createStorageService();
  const chunkKey = `${session.storageKey}.part.${partNumber}`;
  
  // 上传分片到对象存储
  const uploadResult = await storageService.uploadFile(
    Buffer.from(chunk),
    chunkKey,
    session.fileType
  );

  if (!uploadResult.success || !uploadResult.key) {
    throw new Error('分片上传失败');
  }

  // 记录分片信息
  session.parts.set(partNumber, {
    etag: randomUUID(), // 模拟 ETag
    key: uploadResult.key,
  });

  return {
    partNumber,
    etag: randomUUID(),
  };
}

/**
 * 完成分片上传，合并所有分片
 */
async function completeMultipartUpload(uploadId: string) {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    throw new Error('上传会话不存在或已过期');
  }

  const storageService = createStorageService();
  const client = getSupabaseClient();

  // 按分片顺序读取并合并
  const sortedParts = Array.from(session.parts.entries())
    .sort(([a], [b]) => a - b);

  if (sortedParts.length === 0) {
    throw new Error('没有上传任何分片');
  }

  // 合并分片（通过逐个读取并写入最终文件）
  const chunks: Buffer[] = [];
  
  for (const [, part] of sortedParts) {
    const buffer = await storageService.readFile(part.key);
    if (buffer) {
      chunks.push(buffer);
    }
  }

  const finalBuffer = Buffer.concat(chunks);
  
  // 上传合并后的文件
  const uploadResult = await storageService.uploadFile(
    finalBuffer,
    session.storageKey,
    session.fileType
  );

  if (!uploadResult.success || !uploadResult.key) {
    throw new Error('文件合并上传失败');
  }

  const fileKey = uploadResult.key;

  // 清理分片文件（可选，对象存储通常有生命周期策略）
  for (const [, part] of sortedParts) {
    try {
      await storageService.deleteFile(part.key);
    } catch (e) {
      console.warn('清理分片失败:', e);
    }
  }

  // 如果提供了知识库ID，创建文档记录
  let docData = null;
  if (session.knowledgeBaseId) {
    // 检查知识库是否存在
    const { data: kb } = await client
      .from('knowledge_bases')
      .select('id')
      .eq('id', session.knowledgeBaseId)
      .single();

    if (kb) {
      // 创建文档记录
      const { data } = await client
        .from('knowledge_documents')
        .insert({
          knowledge_base_id: session.knowledgeBaseId,
          name: session.fileName,
          original_name: session.fileName,
          file_type: session.fileType,
          file_size: session.fileSize,
          storage_path: fileKey,
          storage_type: 's3',
          vector_status: 'pending',
          uploaded_by: session.uploadedBy,
        })
        .select()
        .single();

      docData = data;
    }
  }

  // 生成访问URL
  const accessUrl = await storageService.getFileUrl(fileKey);

  // 清理上传会话
  uploadSessions.delete(uploadId);

  return {
    fileKey,
    fileName: session.fileName,
    fileSize: session.fileSize,
    fileType: session.fileType,
    accessUrl,
    document: docData,
  };
}

/**
 * POST /api/upload/chunk
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('uploadId');
    const partNumber = url.searchParams.get('partNumber');
    const isComplete = url.searchParams.get('complete') === 'true';

    // 1. 完成上传
    if (isComplete && uploadId) {
      const result = await completeMultipartUpload(uploadId);
      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // 2. 上传分片
    if (uploadId && partNumber) {
      const chunk = await request.arrayBuffer();
      const result = await uploadChunk(
        uploadId,
        parseInt(partNumber, 10),
        chunk
      );
      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // 3. 初始化上传
    const formData = await request.formData();
    const fileName = formData.get('fileName') as string;
    const fileSize = parseInt(formData.get('fileSize') as string, 10);
    const fileType = formData.get('fileType') as string;
    const knowledgeBaseId = formData.get('knowledgeBaseId') as string | undefined;
    const uploadedBy = formData.get('uploadedBy') as string | undefined;

    if (!fileName || !fileSize || !fileType) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 验证文件大小（最大 2GB）
    const maxSize = 2 * 1024 * 1024 * 1024;
    if (fileSize > maxSize) {
      return NextResponse.json(
        { success: false, error: '文件大小超过限制（最大 2GB）' },
        { status: 400 }
      );
    }

    // 验证文件类型
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xlsx', 'xls', 'csv', 'md', 'json'];
    
    if (!allowedExtensions.includes(fileExtension || '')) {
      return NextResponse.json(
        { success: false, error: '不支持的文件类型' },
        { status: 400 }
      );
    }

    const result = await initMultipartUpload(
      fileName,
      fileSize,
      fileType,
      knowledgeBaseId,
      uploadedBy
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('分片上传失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '上传失败',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload/chunk?uploadId=xxx - 取消上传，清理资源
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('uploadId');

    if (!uploadId) {
      return NextResponse.json(
        { success: false, error: '缺少 uploadId 参数' },
        { status: 400 }
      );
    }

    const session = uploadSessions.get(uploadId);
    if (!session) {
      return NextResponse.json({
        success: true,
        message: '上传会话不存在或已清理',
      });
    }

    // 清理已上传的分片
    const storageService = createStorageService();
    for (const [, part] of session.parts) {
      try {
        await storageService.deleteFile(part.key);
      } catch (e) {
        console.warn('清理分片失败:', e);
      }
    }

    // 删除会话
    uploadSessions.delete(uploadId);

    return NextResponse.json({
      success: true,
      message: '上传已取消，资源已清理',
    });
  } catch (error) {
    console.error('取消上传失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取消上传失败',
      },
      { status: 500 }
    );
  }
}
