import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createStorageService, FileTypes } from '@/lib/services/storage-service';
import { createDocumentParser } from '@/lib/services/document-parser';
import { createDocumentChunker, ChunkStrategies } from '@/lib/services/document-chunker';
import { createEmbeddingService } from '@/lib/services/embedding-service';

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
 */
async function processDocumentAsync(
  knowledgeBaseId: string,
  documentId: string,
  file: File,
  storageKey: string,
  headers: Headers
): Promise<void> {
  const client = getSupabaseClient();

  try {
    // 1. 读取文件内容
    const storageService = createStorageService();
    const buffer = await storageService.readFile(storageKey);

    if (!buffer) {
      throw new Error('无法读取文件内容');
    }

    // 2. 解析文档内容
    const content = buffer.toString('utf-8');
    const parser = createDocumentParser(headers);
    const parseResult = await parser.parseFromFile(file, content);

    if (!parseResult.success || !parseResult.document) {
      throw new Error(parseResult.error || '文档解析失败');
    }

    const document = parseResult.document;

    // 3. 获取知识库配置
    const { data: kbData } = await client
      .from('knowledge_bases')
      .select('chunk_size, chunk_overlap')
      .eq('id', knowledgeBaseId)
      .single();

    const chunkSize = kbData?.chunk_size || 500;
    const chunkOverlap = kbData?.chunk_overlap || 50;

    // 4. 分块处理
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

    // 5. 向量化处理
    const embeddingService = createEmbeddingService();
    const embeddings: number[][] = [];
    const batchSize = 20;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);
      const result = await embeddingService.embedTexts(texts);

      if (result.success && result.embeddings) {
        embeddings.push(...result.embeddings);
      }
    }

    // 6. 保存分块和向量
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      await client.from('document_chunks').insert({
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
    }

    // 7. 更新文档状态
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

    console.log(`文档处理完成: ${file.name}, ${chunks.length} 个分块`);
  } catch (error) {
    console.error('文档处理失败:', error);

    // 更新错误状态
    await client
      .from('knowledge_documents')
      .update({
        status: 'failed',
        processing_error: error instanceof Error ? error.message : '处理失败',
      })
      .eq('id', documentId);
  }
}
