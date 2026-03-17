import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createStorageService } from '@/lib/services/storage-service';
import { createDocumentParser } from '@/lib/services/document-parser';
import { createDocumentChunker } from '@/lib/services/document-chunker';
import { createEmbeddingService } from '@/lib/services/embedding-service';

// POST /api/knowledge-bases/[id]/documents/[docId]/reprocess - 重新处理文档
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const client = getSupabaseClient();

    // 获取文档信息
    const { data: doc, error: docError } = await client
      .from('knowledge_documents')
      .select('*')
      .eq('id', docId)
      .eq('knowledge_base_id', id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { success: false, error: '文档不存在' },
        { status: 404 }
      );
    }

    // 更新状态为处理中
    await client
      .from('knowledge_documents')
      .update({
        status: 'processing',
        processing_error: null,
      })
      .eq('id', docId);

    // 删除旧的分块
    await client
      .from('document_chunks')
      .delete()
      .eq('document_id', docId);

    // 在后台处理文档
    processDocumentAsync(id, doc, req.headers).catch(
      (error) => console.error('文档重新处理失败:', error)
    );

    return NextResponse.json({
      success: true,
      message: '已提交重新处理任务',
    });
  } catch (error) {
    console.error('重新处理失败:', error);
    return NextResponse.json(
      { success: false, error: '重新处理失败' },
      { status: 500 }
    );
  }
}

/**
 * 异步处理文档
 */
async function processDocumentAsync(
  knowledgeBaseId: string,
  doc: any,
  headers: Headers
): Promise<void> {
  const client = getSupabaseClient();
  const documentId = doc.id;

  try {
    // 1. 读取文件内容
    const storageService = createStorageService();
    const buffer = await storageService.readFile(doc.file_path);

    if (!buffer) {
      throw new Error('无法读取文件内容');
    }

    // 2. 解析文档
    const content = buffer.toString('utf-8');
    const parser = createDocumentParser(headers);
    
    // 构建File对象用于解析
    const fileBlob = new Blob([new Uint8Array(buffer)], { type: doc.file_type });
    const file = new File([fileBlob], doc.file_name, { type: doc.file_type });
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

    // 4. 分块
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

    // 5. 向量化
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

    // 6. 保存分块
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

    console.log(`文档重新处理完成: ${doc.file_name}, ${chunks.length} 个分块`);
  } catch (error) {
    console.error('文档处理失败:', error);

    await client
      .from('knowledge_documents')
      .update({
        status: 'failed',
        processing_error: error instanceof Error ? error.message : '处理失败',
      })
      .eq('id', documentId);
  }
}
