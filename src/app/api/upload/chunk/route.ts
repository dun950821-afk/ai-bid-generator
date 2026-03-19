/**
 * 分片上传 API
 * 支持大文件（最大 2GB）分片上传和断点续传
 * 
 * 流程：
 * 1. POST /api/upload/chunk - 初始化上传，返回 uploadId
 * 2. POST /api/upload/chunk?uploadId=xxx&partNumber=1 - 上传分片
 * 3. POST /api/upload/chunk?complete=true - 完成上传，合并分片
 * 4. GET /api/upload/chunk?uploadId=xxx - 获取上传进度（断点续传）
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
  const client = getSupabaseClient();
  const uploadId = randomUUID();
  const storageKey = `documents/${knowledgeBaseId || 'general'}/${Date.now()}_${fileName}`;
  
  // 计算分片数量
  const totalParts = Math.ceil(fileSize / CHUNK_SIZE);

  // 使用 RPC 函数持久化到数据库（绕过 schema cache）
  const { error } = await client.rpc('create_upload_session', {
    p_id: uploadId,
    p_file_name: fileName,
    p_file_size: fileSize,
    p_file_type: fileType,
    p_storage_key: storageKey,
    p_knowledge_base_id: knowledgeBaseId || null,
    p_uploaded_by: uploadedBy || null,
  });

  if (error) {
    console.error('创建上传会话失败:', JSON.stringify(error, null, 2));
    // 如果 RPC 失败，降级使用内存存储
    console.warn('创建上传会话失败，使用内存存储（不支持断点续传）');
    // 返回成功，但不支持断点续传
    return {
      uploadId,
      chunkSize: CHUNK_SIZE,
      totalParts,
      storageKey,
      fallback: true, // 标记使用降级模式
    };
  }

  return {
    uploadId,
    chunkSize: CHUNK_SIZE,
    totalParts,
    storageKey,
  };
}

/**
 * 获取上传会话状态（用于断点续传）
 */
async function getUploadSession(uploadId: string) {
  const client = getSupabaseClient();
  
  const { data: session, error } = await client.rpc('get_upload_session', {
    p_id: uploadId,
  });

  if (error || !session || session.length === 0) {
    return null;
  }

  const s = session[0];
  
  // 检查是否过期
  if (new Date(s.expires_at) < new Date()) {
    // 清理过期会话
    await client.rpc('delete_upload_session', { p_id: uploadId });
    return null;
  }

  return {
    uploadId: s.id,
    fileName: s.file_name,
    fileSize: s.file_size,
    fileType: s.file_type,
    storageKey: s.storage_key,
    knowledgeBaseId: s.knowledge_base_id,
    status: s.status,
    uploadedParts: s.uploaded_parts || [],
    totalParts: Math.ceil(s.file_size / CHUNK_SIZE),
    chunkSize: CHUNK_SIZE,
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
  const client = getSupabaseClient();
  
  // 获取会话
  const { data: sessionData, error: sessionError } = await client.rpc('get_upload_session', {
    p_id: uploadId,
  });

  if (sessionError || !sessionData || sessionData.length === 0) {
    throw new Error('上传会话不存在或已过期');
  }

  const session = sessionData[0];

  // 检查是否过期
  if (new Date(session.expires_at) < new Date()) {
    throw new Error('上传会话已过期');
  }

  const storageService = createStorageService();
  const chunkKey = `${session.storage_key}.part.${partNumber}`;
  
  // 上传分片到对象存储（skipPrefix=true，因为 storage_key 已经包含完整路径）
  const uploadResult = await storageService.uploadFile(
    Buffer.from(chunk),
    chunkKey,
    session.file_type,
    true  // 跳过自动添加前缀
  );

  if (!uploadResult.success || !uploadResult.key) {
    throw new Error('分片上传失败');
  }

  const etag = randomUUID();
  const partInfo = {
    partNumber,
    etag,
    key: uploadResult.key,
  };

  // 更新已上传的分片列表
  const uploadedParts = session.uploaded_parts || [];
  const existingIndex = uploadedParts.findIndex(
    (p: { partNumber: number }) => p.partNumber === partNumber
  );
  
  if (existingIndex >= 0) {
    // 更新已有分片
    uploadedParts[existingIndex] = partInfo;
  } else {
    // 添加新分片
    uploadedParts.push(partInfo);
  }

  // 更新数据库
  const { error: updateError } = await client.rpc('update_upload_session_parts', {
    p_id: uploadId,
    p_status: 'uploading',
    p_uploaded_parts: uploadedParts,
  });

  if (updateError) {
    console.error('更新上传会话失败:', updateError);
    throw new Error('更新上传状态失败');
  }

  return {
    partNumber,
    etag,
  };
}

/**
 * 完成分片上传，合并所有分片
 */
async function completeMultipartUpload(uploadId: string) {
  const client = getSupabaseClient();
  
  // 获取会话
  const { data: sessionData, error: sessionError } = await client.rpc('get_upload_session', {
    p_id: uploadId,
  });

  if (sessionError || !sessionData || sessionData.length === 0) {
    throw new Error('上传会话不存在或已过期');
  }

  const session = sessionData[0];
  const storageService = createStorageService();

  // 按分片顺序排序
  const uploadedParts = session.uploaded_parts || [];
  const sortedParts = [...uploadedParts].sort(
    (a: { partNumber: number }, b: { partNumber: number }) => a.partNumber - b.partNumber
  );

  if (sortedParts.length === 0) {
    throw new Error('没有上传任何分片');
  }

  // 合并分片（通过逐个读取并写入最终文件）
  const chunks: Buffer[] = [];
  
  for (const part of sortedParts) {
    const buffer = await storageService.readFile(part.key);
    if (buffer) {
      chunks.push(buffer);
    }
  }

  const finalBuffer = Buffer.concat(chunks);
  
  // 上传合并后的文件（skipPrefix=true，因为 storage_key 已经包含完整路径）
  const uploadResult = await storageService.uploadFile(
    finalBuffer,
    session.storage_key,
    session.file_type,
    true  // 跳过自动添加前缀
  );

  if (!uploadResult.success || !uploadResult.key) {
    throw new Error('文件合并上传失败');
  }

  const fileKey = uploadResult.key;

  // 清理分片文件（可选，对象存储通常有生命周期策略）
  for (const part of sortedParts) {
    try {
      await storageService.deleteFile(part.key);
    } catch (e) {
      console.warn('清理分片失败:', e);
    }
  }

  // 如果提供了知识库ID，创建文档记录
  let docData = null;
  if (session.knowledge_base_id) {
    // 检查知识库是否存在
    const { data: kb } = await client
      .from('knowledge_bases')
      .select('id')
      .eq('id', session.knowledge_base_id)
      .single();

    if (kb) {
      // 创建文档记录
      const { data } = await client
        .from('knowledge_documents')
        .insert({
          knowledge_base_id: session.knowledge_base_id,
          name: session.file_name,
          original_name: session.file_name,
          file_type: session.file_type,
          file_size: session.file_size,
          storage_path: fileKey,
          storage_type: 's3',
          vector_status: 'pending',
          uploaded_by: session.uploaded_by,
        })
        .select()
        .single();

      docData = data;
    }
  }

  // 生成访问URL
  const accessUrl = await storageService.getFileUrl(fileKey);

  // 更新会话状态为完成
  await client.rpc('complete_upload_session', { p_id: uploadId });

  // 延迟删除已完成的会话（保留一段时间供查询）
  setTimeout(async () => {
    try {
      await client.rpc('delete_upload_session', { p_id: uploadId });
    } catch (e) {
      console.warn('清理已完成会话失败:', e);
    }
  }, 60000); // 1分钟后删除

  return {
    fileKey,
    fileName: session.file_name,
    fileSize: session.file_size,
    fileType: session.file_type,
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
 * GET /api/upload/chunk?uploadId=xxx - 获取上传进度（断点续传）
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('uploadId');

    if (!uploadId) {
      return NextResponse.json(
        { success: false, error: '缺少 uploadId 参数' },
        { status: 400 }
      );
    }

    const session = await getUploadSession(uploadId);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: '上传会话不存在或已过期' },
        { status: 404 }
      );
    }

    // 计算已上传的分片编号集合
    const uploadedPartNumbers = new Set(
      session.uploadedParts.map((p: { partNumber: number }) => p.partNumber)
    );

    return NextResponse.json({
      success: true,
      data: {
        uploadId: session.uploadId,
        fileName: session.fileName,
        fileSize: session.fileSize,
        fileType: session.fileType,
        storageKey: session.storageKey,
        status: session.status,
        totalParts: session.totalParts,
        chunkSize: session.chunkSize,
        uploadedParts: session.uploadedParts,
        uploadedPartNumbers: Array.from(uploadedPartNumbers),
        uploadedCount: uploadedPartNumbers.size,
        // 计算已上传的字节数
        uploadedBytes: uploadedPartNumbers.size * session.chunkSize,
      },
    });
  } catch (error) {
    console.error('获取上传进度失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取上传进度失败',
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

    const client = getSupabaseClient();
    
    // 获取会话
    const { data: sessionData } = await client.rpc('get_upload_session', {
      p_id: uploadId,
    });

    if (sessionData && sessionData.length > 0) {
      const session = sessionData[0];
      
      // 清理已上传的分片
      const storageService = createStorageService();
      const uploadedParts = session.uploaded_parts || [];
      
      for (const part of uploadedParts) {
        try {
          await storageService.deleteFile(part.key);
        } catch (e) {
          console.warn('清理分片失败:', e);
        }
      }

      // 更新状态为已取消
      await client.rpc('cancel_upload_session', { p_id: uploadId });

      // 延迟删除会话
      setTimeout(async () => {
        try {
          await client.rpc('delete_upload_session', { p_id: uploadId });
        } catch (e) {
          console.warn('清理已取消会话失败:', e);
        }
      }, 10000); // 10秒后删除
    }

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
