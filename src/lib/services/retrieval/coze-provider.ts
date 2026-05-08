/**
 * 扣子知识库检索适配器
 * 使用 coze-coding-dev-sdk 的 KnowledgeClient 进行语义检索
 * 相比 IMA 的 search_knowledge，扣子知识库提供更精准的向量检索能力
 */

import { KnowledgeClient, Config, DataSourceType } from 'coze-coding-dev-sdk';
import type { RetrievedDocument, RetrievalResponse, RetrievalOptions } from './index';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 扣子知识库客户端单例
 * 无需额外配置，SDK 自动从环境变量获取认证信息
 */
let clientInstance: KnowledgeClient | null = null;

function getCozeKnowledgeClient(): KnowledgeClient {
  if (!clientInstance) {
    const config = new Config();
    clientInstance = new KnowledgeClient(config);
  }
  return clientInstance;
}

/**
 * 通过扣子知识库执行检索
 * @param query 查询文本
 * @param options 检索选项
 * @returns 统一检索响应
 */
export async function retrieveFromCoze(
  query: string,
  options: RetrievalOptions
): Promise<RetrievalResponse> {
  try {
    const client = getCozeKnowledgeClient();
    const topK = options.topK || 5;
    const minScore = options.minScore || 0.3;

    // 扣子知识库搜索：不指定 tableNames 则搜索所有数据集
    const searchResponse = await client.search(
      query,
      undefined, // 搜索所有数据集
      topK,
      minScore
    );

    if (searchResponse.code !== 0) {
      console.warn('[Coze Provider] 搜索失败:', searchResponse.msg);
      return { success: false, documents: [], error: searchResponse.msg };
    }

    if (!searchResponse.chunks || searchResponse.chunks.length === 0) {
      console.log('[Coze Provider] 未找到相关结果');
      return { success: false, documents: [] };
    }

    // 转换为统一格式
    const documents: RetrievedDocument[] = searchResponse.chunks.map((chunk) => ({
      id: chunk.doc_id || `coze-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: chunk.content,
      documentName: chunk.doc_id || '未知文档',
      score: chunk.score,
      metadata: {
        provider: 'coze',
        docId: chunk.doc_id,
      },
    }));

    console.log(`[Coze Provider] 检索到 ${documents.length} 条结果, 查询: "${query.substring(0, 30)}..."`);

    return {
      success: true,
      documents,
    };
  } catch (error) {
    console.error('[Coze Provider] 检索异常:', error);
    return {
      success: false,
      documents: [],
      error: error instanceof Error ? error.message : '扣子知识库检索异常',
    };
  }
}

/**
 * 导入文档到扣子知识库，同时记录到本地数据库
 * @param documents 文档列表
 * @param dataset 数据集名称
 * @param chunkConfig 分块配置
 */
export async function importDocumentsToCoze(
  documents: Array<{ title: string; content: string; type: 'text' | 'url' | 'file'; uri?: string }>,
  dataset: string = 'coze_doc_knowledge',
  chunkConfig?: { separator?: string; maxTokens?: number }
): Promise<{ success: boolean; docIds?: string[]; error?: string }> {
  try {
    const client = getCozeKnowledgeClient();

    const knowledgeDocs = documents.map((doc) => {
      if (doc.type === 'file' && doc.uri) {
        return {
          source: DataSourceType.URI,
          uri: doc.uri,
        };
      }
      return {
        source: doc.type === 'url' ? DataSourceType.URL : DataSourceType.TEXT,
        raw_data: doc.type === 'text' ? doc.content : undefined,
        url: doc.type === 'url' ? doc.content : undefined,
      };
    });

    const chunkConfigObj = chunkConfig
      ? {
          separator: chunkConfig.separator || '\n\n',
          max_tokens: chunkConfig.maxTokens || 2000,
        }
      : undefined;

    const response = await client.addDocuments(knowledgeDocs, dataset, chunkConfigObj);

    if (response.code !== 0) {
      console.error('[Coze Provider] 文档导入失败:', response.msg);
      return { success: false, error: response.msg };
    }

    // 记录到本地数据库
    const supabase = getSupabaseClient();
    const dbRecords = documents.map((doc, i) => ({
      title: doc.title,
      content: doc.type === 'text' ? doc.content.substring(0, 500) : null,
      url: doc.type === 'url' ? doc.content : (doc.type === 'file' ? doc.uri : null),
      source_type: doc.type,
      dataset_name: dataset,
      doc_id: response.doc_ids?.[i] || null,
      status: 'indexing' as const,
    }));

    const { error: dbError } = await supabase
      .from('coze_documents')
      .insert(dbRecords);

    if (dbError) {
      console.warn('[Coze Provider] 数据库记录失败:', dbError.message);
    }

    console.log(`[Coze Provider] 成功导入 ${response.doc_ids?.length || 0} 个文档到 ${dataset}`);
    return { success: true, docIds: response.doc_ids };
  } catch (error) {
    console.error('[Coze Provider] 文档导入异常:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '文档导入异常',
    };
  }
}

/**
 * 获取扣子知识库文档列表（从本地数据库）
 */
export async function getCozeDocumentList(
  dataset?: string
): Promise<{
  success: boolean;
  documents?: Array<{
    id: string;
    title: string;
    sourceType: string;
    url: string | null;
    status: string;
    chunkCount: number;
    createdAt: string;
  }>;
  error?: string;
}> {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('coze_documents')
      .select('id, title, source_type, url, status, chunk_count, created_at')
      .order('created_at', { ascending: false });

    if (dataset) {
      query = query.eq('dataset_name', dataset);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const documents = (data || []).map((doc) => ({
      id: doc.id,
      title: doc.title,
      sourceType: doc.source_type,
      url: doc.url,
      status: doc.status,
      chunkCount: doc.chunk_count,
      createdAt: doc.created_at,
    }));

    return { success: true, documents };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取文档列表失败',
    };
  }
}

/**
 * 删除扣子知识库文档记录
 */
export async function deleteCozeDocument(
  docId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('coze_documents')
      .delete()
      .eq('id', docId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除文档失败',
    };
  }
}

/**
 * 获取扣子知识库统计信息
 */
export async function getCozeKnowledgeStats(): Promise<{
  success: boolean;
  totalDocuments?: number;
  readyDocuments?: number;
  indexingDocuments?: number;
  error?: string;
}> {
  try {
    const supabase = getSupabaseClient();
    const { count: total, error: totalError } = await supabase
      .from('coze_documents')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      return { success: false, error: totalError.message };
    }

    const { count: ready, error: readyError } = await supabase
      .from('coze_documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ready');

    if (readyError) {
      return { success: false, error: readyError.message };
    }

    const { count: indexing, error: indexingError } = await supabase
      .from('coze_documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'indexing');

    if (indexingError) {
      return { success: false, error: indexingError.message };
    }

    return {
      success: true,
      totalDocuments: total || 0,
      readyDocuments: ready || 0,
      indexingDocuments: indexing || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取统计信息失败',
    };
  }
}

/**
 * 测试扣子知识库连接
 * 通过执行一次搜索来验证连接是否正常
 */
export async function testCozeConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const client = getCozeKnowledgeClient();
    const response = await client.search('连接测试', undefined, 1, 0.0);

    if (response.code === 0) {
      return {
        success: true,
        message: '扣子知识库连接成功',
      };
    }

    return {
      success: false,
      message: `连接失败: ${response.msg}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `连接异常: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}
