import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createStorageService, FileTypes } from '@/lib/services/storage-service';
import { createDocumentParser } from '@/lib/services/document-parser';
import { createDocumentChunker, ChunkStrategies } from '@/lib/services/document-chunker';
import { createEmbeddingService } from '@/lib/services/embedding-service';
import { retryWithBackoff } from '@/lib/utils/retry';

// 配置 API 路由：支持大文件上传（最大 500MB）
export const maxDuration = 300; // 最长运行时间 5 分钟
export const runtime = 'nodejs';

// GET /api/knowledge-bases/[id]/documents - 获取知识库文档列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data, error, count } = await client
      .from('knowledge_documents')
      .select('*', { count: 'exact' })
      .eq('knowledge_base_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: data || [],
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

      // 创建文档记录
      const { data: docData, error: docError } = await client
        .from('knowledge_documents')
        .insert({
          knowledge_base_id: id,
          file_name: file.name,
          file_path: uploadResult.key,
          file_type: file.type || FileTypes.getMimeType(file.name),
          file_size: file.size,
          status: autoProcess ? 'processing' : 'pending',
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
        // 在后台处理文档（不阻塞响应）
        processDocumentAsync(id, docData.id, file, uploadResult.key, req.headers).catch(
          (error) => console.error('文档处理失败:', error)
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: uploadedDocs,
        uploaded: uploadedDocs.length,
        message: autoProcess 
          ? `已上传 ${uploadedDocs.length} 个文档，正在后台处理中...`
          : `已上传 ${uploadedDocs.length} 个文档`,
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
 * 优化：增强错误处理和重试机制
 */
async function processDocumentAsync(
  knowledgeBaseId: string,
  documentId: string,
  file: File,
  storageKey: string,
  headers: Headers
): Promise<void> {
  const client = getSupabaseClient();
  let status: 'processing' | 'completed' | 'failed' = 'processing';
  let errorMessage: string | null = null;

  try {
    console.log(`[文档处理] 开始处理文档: ${file.name} (ID: ${documentId})`);

    // 1. 读取文件内容（带重试）
    console.log(`[文档处理] 步骤1: 读取文件内容`);
    const storageService = createStorageService();
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

    // 2. 解析文档内容（带重试）
    console.log(`[文档处理] 步骤2: 解析文档内容`);
    const content = buffer.toString('utf-8');
    const parser = createDocumentParser(headers);
    const parseResult = await retryWithBackoff(
      async () => {
        const result = await parser.parseFromFile(file, content);
        if (!result.success || !result.document) {
          throw new Error(result.error || '文档解析失败');
        }
        return result;
      },
      2, // 解析失败通常不可重试，只重试2次
      500
    );

    // 类型断言：retryWithBackoff 已经确保 document 存在
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

    // 4. 分块处理
    console.log(`[文档处理] 步骤4: 分块处理 (chunkSize=${chunkSize}, chunkOverlap=${chunkOverlap})`);
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

    // 5. 向量化处理（带重试）
    console.log(`[文档处理] 步骤5: 向量化处理`);
    const embeddingService = createEmbeddingService();
    const embeddings: number[][] = [];
    const batchSize = 20;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);

      // 对每个批次进行重试
      const batchEmbeddings = await retryWithBackoff(
        async () => {
          const result = await embeddingService.embedTexts(texts);
          if (!result.success || !result.embeddings) {
            throw new Error('向量化失败');
          }
          return result.embeddings;
        },
        3, // 最多重试3次
        2000 // 基础延迟2秒（API可能限流）
      );

      embeddings.push(...batchEmbeddings);
      console.log(`[文档处理] 已向量化 ${Math.min(i + batchSize, chunks.length)}/${chunks.length} 个分块`);
    }

    // 6. 保存分块和向量（带重试）
    console.log(`[文档处理] 步骤6: 保存分块和向量`);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      await retryWithBackoff(
        async () => {
          const { error } = await client.from('document_chunks').insert({
            document_id: documentId,
            knowledge_base_id: knowledgeBaseId,
            chunk_index: chunk.metadata.chunkIndex,
            content: chunk.content,
            embedding: embedding || null,
            metadata: {
              section_title: chunk.metadata.sectionTitle,
              section_level: chunk.metadata.sectionLevel,
              word_count: chunk.metadata.wordCount,
              char_count: chunk.metadata.charCount,
            },
          });

          if (error) {
            throw new Error(`保存分块失败: ${error.message}`);
          }
        },
        2,
        500
      );
    }

    // 7. 更新文档状态为完成
    console.log(`[文档处理] 步骤7: 更新文档状态为完成`);
    status = 'completed';
    await client
      .from('knowledge_documents')
      .update({
        status: 'completed',
        chunk_count: chunks.length,
        processed_at: new Date().toISOString(),
        metadata: {
          title: document.title,
          word_count: document.metadata.wordCount,
          char_count: document.metadata.charCount,
          section_count: document.sections.length,
        },
      })
      .eq('id', documentId);

    console.log(`[文档处理] ✅ 文档处理完成: ${file.name}, ${chunks.length} 个分块`);
  } catch (error) {
    // 捕获所有错误
    const errorMsg = error instanceof Error ? error.message : '处理失败';
    console.error(`[文档处理] ❌ 文档处理失败:`, error);
    
    status = 'failed';
    errorMessage = errorMsg;

    // 更新错误状态到数据库
    try {
      await client
        .from('knowledge_documents')
        .update({
          status: 'failed',
          processing_error: errorMsg,
          processed_at: new Date().toISOString(),
        })
        .eq('id', documentId);
      
      console.log(`[文档处理] 已更新文档状态为失败: ${documentId}`);
    } catch (updateError) {
      // 如果更新状态也失败了，记录日志但不抛出异常
      console.error(`[文档处理] 更新文档状态失败:`, updateError);
    }
  } finally {
    // 最后检查：如果状态仍然是 processing，说明出现了未捕获的异常
    // 需要确保状态不会残留为 processing
    if (status === 'processing') {
      console.error(`[文档处理] ⚠️ 状态异常，强制更新为失败`);
      
      try {
        await client
          .from('knowledge_documents')
          .update({
            status: 'failed',
            processing_error: errorMessage || '处理过程异常终止',
            processed_at: new Date().toISOString(),
          })
          .eq('id', documentId);
      } catch (updateError) {
        console.error(`[文档处理] 强制更新状态失败:`, updateError);
      }
    }
  }
}
