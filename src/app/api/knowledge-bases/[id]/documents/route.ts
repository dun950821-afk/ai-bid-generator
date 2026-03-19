import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createStorageService, FileTypes } from '@/lib/services/storage-service';
import { createDocumentParser } from '@/lib/services/document-parser';
import { createDocumentChunker } from '@/lib/services/document-chunker';
import { createEmbeddingService } from '@/lib/services/embedding-service';
import { retryWithBackoff } from '@/lib/utils/retry';

// 配置 API 路由：支持大文件上传（最大 500MB）
export const maxDuration = 300; // 最长运行时间 5 分钟
export const runtime = 'nodejs';

// 文档状态定义
type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

// GET /api/knowledge-bases/[id]/documents - 获取知识库文档列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 查询文档列表，关联查询标签
    const { data, error, count } = await client
      .from('knowledge_documents')
      .select(`
        *,
        document_tags (
          tag_id,
          knowledge_tags (
            id,
            name,
            color,
            description
          )
        )
      `, { count: 'exact' })
      .eq('knowledge_base_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 转换数据格式，将标签提取到 tags 字段
    const documents = (data || []).map((doc: any) => ({
      ...doc,
      tags: doc.document_tags?.map((dt: any) => dt.knowledge_tags).filter(Boolean) || [],
    }));

    // 移除中间表字段
    documents.forEach((doc: any) => delete doc.document_tags);

    return NextResponse.json({
      success: true,
      data: {
        documents,
        total: count || 0,
      },
    });
  } catch (error) {
    console.error('获取文档列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文档列表失败' },
      { status: 500 }
    );
  }
}

// POST /api/knowledge-bases/[id]/documents - 上传文档
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const autoProcess = formData.get('autoProcess') !== 'false';

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要上传的文件' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    const storageService = createStorageService();
    const uploadedDocs = [];

    for (const file of files) {
      // 检查文件类型
      if (!FileTypes.isSupportedDocument(file.name)) {
        console.warn(`不支持的文件类型: ${file.name}`);
        continue;
      }

      // 上传文件到对象存储
      const uploadResult = await storageService.uploadFile(file, file.name);

      if (!uploadResult.success || !uploadResult.key) {
        console.error('文件上传失败:', uploadResult.error);
        continue;
      }

      // 创建文档记录 - 状态为 pending（已上传，待处理）
      // 关键优化：文件上传成功后立即保存，不等待处理完成
      const { data: docData, error: docError } = await client
        .from('knowledge_documents')
        .insert({
          knowledge_base_id: id,
          name: file.name,
          original_name: file.name,
          file_type: file.type || FileTypes.getMimeType(file.name),
          file_size: file.size,
          storage_path: uploadResult.key,  // 保存存储路径，用于后续处理
          storage_type: 's3',
          vector_status: 'pending',  // 已上传，待处理
          chunk_count: 0,
        })
        .select()
        .single();

      if (docError || !docData) {
        console.error('创建文档记录失败:', docError);
        continue;
      }

      uploadedDocs.push(docData);

      // 如果启用自动处理，启动后台处理任务
      if (autoProcess) {
        processDocumentAsync(
          id,
          docData.id,
          file.name,
          file.type || FileTypes.getMimeType(file.name),
          uploadResult.key,
          req.headers
        ).catch((error) => console.error('文档处理失败:', error));
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: uploadedDocs,
        uploaded: uploadedDocs.length,
        message: `已成功上传 ${uploadedDocs.length} 个文档${autoProcess ? '，正在后台处理中...' : ''}`,
      },
    });
  } catch (error) {
    console.error('上传文档失败:', error);
    return NextResponse.json(
      { success: false, error: '上传文档失败' },
      { status: 500 }
    );
  }
}

/**
 * 异步处理文档：解析、分块、向量化
 * 优化：从对象存储读取文件，支持重新处理
 * 
 * @param knowledgeBaseId 知识库ID
 * @param documentId 文档ID
 * @param fileName 文件名
 * @param fileType 文件类型
 * @param storageKey 存储路径
 * @param headers 请求头
 */
export async function processDocumentAsync(
  knowledgeBaseId: string,
  documentId: string,
  fileName: string,
  fileType: string,
  storageKey: string,
  headers: Headers | Readonly<Headers>
): Promise<void> {
  const client = getSupabaseClient();
  const storageService = createStorageService();
  let status: DocumentStatus = 'processing';
  let errorMessage: string | null = null;

  try {
    console.log(`[文档处理] 开始处理文档: ${fileName} (ID: ${documentId})`);

    // 更新状态为处理中
    await client
      .from('knowledge_documents')
      .update({
        vector_status: 'processing',
        vector_error: null,
      })
      .eq('id', documentId);

    // 1. 从对象存储读取文件内容（带重试）
    console.log(`[文档处理] 步骤1: 读取文件内容`);
    const buffer = await retryWithBackoff(
      async () => {
        const result = await storageService.readFile(storageKey);
        if (!result) {
          throw new Error('无法读取文件内容');
        }
        return result;
      },
      3, // 最多重试3次
      1000 // 基础延迟1秒
    );

    // 检查文件大小
    const fileSizeMB = buffer.length / (1024 * 1024);
    console.log(`[文档处理] 文件大小: ${fileSizeMB.toFixed(2)} MB`);
    if (fileSizeMB > 100) {
      console.warn(`[文档处理] ⚠️ 大文件警告: 文件大小超过 100MB，解析可能需要较长时间或失败`);
    }

    // 2. 解析文档内容（带重试）
    console.log(`[文档处理] 步骤2: 解析文档内容`);
    const parser = createDocumentParser(headers);
    
    const parseResult = await retryWithBackoff(
      async () => {
        // 判断文件类型
        const isTextFile = fileType.includes('text') || 
                           fileType.includes('json') || 
                           fileType.includes('markdown') ||
                           fileName.endsWith('.txt') ||
                           fileName.endsWith('.md') ||
                           fileName.endsWith('.json');
        
        let result;
        if (isTextFile) {
          // 文本文件：直接解析内容
          const content = buffer.toString('utf-8');
          const uint8Array = new Uint8Array(buffer);
          const file = new File([uint8Array], fileName, { type: fileType });
          result = await parser.parseFromFile(file, content);
        } else {
          // 二进制文件（PDF、Word等）：需要通过 URL 解析
          console.log(`[文档处理] 二进制文件，获取访问URL进行解析`);
          
          // 获取文件的访问 URL
          const accessUrl = await storageService.getFileUrl(storageKey);
          console.log(`[文档处理] 文件访问URL: ${accessUrl}`);
          
          // 使用 URL 解析文档
          result = await parser.parseFromUrl(accessUrl);
          
          // 详细日志
          console.log(`[文档处理] 解析结果: success=${result.success}, error=${result.error || 'none'}`);
          if (result.document) {
            console.log(`[文档处理] 文档内容长度: ${result.document.content?.length || 0}, 标题: ${result.document.title || 'none'}`);
          }
        }
        
        if (!result.success || !result.document) {
          throw new Error(result.error || '文档解析失败');
        }
        
        // 检查解析结果是否有效
        if (!result.document.content || result.document.content.trim().length === 0) {
          throw new Error('文档解析成功，但内容为空');
        }
        
        return result;
      },
      2,
      500
    );

    if (!parseResult.document) {
      throw new Error('文档解析失败：document 为空');
    }
    const document = parseResult.document;

    // 3. 获取知识库配置
    console.log(`[文档处理] 步骤3: 获取知识库配置`);
    const { data: kbData, error: kbError } = await client
      .from('knowledge_bases')
      .select('chunk_size, chunk_overlap')
      .eq('id', knowledgeBaseId)
      .single();

    if (kbError) {
      console.warn(`[文档处理] 获取知识库配置失败，使用默认配置:`, kbError);
    }

    const chunkSize = kbData?.chunk_size || 500;
    const chunkOverlap = kbData?.chunk_overlap || 50;

    // 4. 删除旧的分块（如果有）
    console.log(`[文档处理] 步骤4: 清理旧分块`);
    await client
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    // 5. 分块处理
    console.log(`[文档处理] 步骤5: 分块处理 (chunkSize=${chunkSize}, chunkOverlap=${chunkOverlap})`);
    console.log(`[文档处理] 文档内容长度: ${document.content?.length || 0}, 章节数: ${document.sections?.length || 0}`);
    
    const chunker = createDocumentChunker({
      chunkSize,
      chunkOverlap,
      respectStructure: true,
    });

    const chunks = chunker.chunkDocument(
      documentId,
      document.content,
      document.sections
    );

    console.log(`[文档处理] 分块完成，共 ${chunks.length} 个分块`);

    if (chunks.length === 0) {
      throw new Error('文档分块失败：没有生成任何分块');
    }

    // 6. 向量化处理（带重试）
    console.log(`[文档处理] 步骤6: 向量化处理`);
    const embeddingService = createEmbeddingService();
    const batchSize = 20;

    const chunkInserts: any[] = [];
    const embeddings: (number[] | null)[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);

      const batchEmbeddings = await retryWithBackoff(
        async () => {
          const result = await embeddingService.embedTexts(texts);
          if (!result.success || !result.embeddings) {
            throw new Error('向量化失败');
          }
          return result.embeddings;
        },
        3,
        2000
      );

      embeddings.push(...batchEmbeddings);
      console.log(`[文档处理] 已向量化 ${Math.min(i + batchSize, chunks.length)}/${chunks.length} 个分块`);
    }

    // 7. 批量保存分块和向量
    console.log(`[文档处理] 步骤7: 批量保存分块和向量`);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      chunkInserts.push({
        id: `${documentId}-chunk-${i}`, // 添加必需的 id 字段
        document_id: documentId,
        knowledge_base_id: knowledgeBaseId,
        chunk_index: chunk.metadata.chunkIndex,
        content: chunk.content,
        embedding: embedding,
        metadata: {
          section_title: chunk.metadata.sectionTitle,
          section_level: chunk.metadata.sectionLevel,
          word_count: chunk.metadata.wordCount,
          char_count: chunk.metadata.charCount,
        },
      });
    }

    // 批量插入，每次最多100条
    const insertBatchSize = 100;
    for (let i = 0; i < chunkInserts.length; i += insertBatchSize) {
      const batch = chunkInserts.slice(i, i + insertBatchSize);
      
      const { error, data } = await client.from('document_chunks').insert(batch).select();
      if (error) {
        console.error(`[文档处理] 批量保存分块失败:`, error);
        throw new Error(`批量保存分块失败: ${error.message}`);
      }
      
      console.log(`[文档处理] 已保存 ${Math.min(i + insertBatchSize, chunkInserts.length)}/${chunkInserts.length} 个分块, 实际插入: ${data?.length || 0}`);
    }

    // 8. 更新文档状态为完成
    console.log(`[文档处理] 步骤8: 更新文档状态为完成`);
    status = 'completed';
    await client
      .from('knowledge_documents')
      .update({
        vector_status: 'completed',
        chunk_count: chunks.length,
        vector_error: null,
        metadata: {
          title: document.title,
          word_count: document.metadata.wordCount,
          char_count: document.metadata.charCount,
          section_count: document.sections.length,
        },
      })
      .eq('id', documentId);

    console.log(`[文档处理] ✅ 文档处理完成: ${fileName}, ${chunks.length} 个分块`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '处理失败';
    console.error(`[文档处理] ❌ 文档处理失败:`, error);
    
    status = 'failed';
    errorMessage = errorMsg;

    try {
      await client
        .from('knowledge_documents')
        .update({
          vector_status: 'failed',
          vector_error: errorMsg,
        })
        .eq('id', documentId);
      
      console.log(`[文档处理] 已更新文档状态为失败: ${documentId}`);
    } catch (updateError) {
      console.error(`[文档处理] 更新文档状态失败:`, updateError);
    }
  }
}
