/**
 * 扣子知识库检索适配器
 * 检索使用 coze-coding-dev-sdk（integration.coze.cn）进行语义搜索召回
 * 知识库管理使用 Coze 官方 Open API (api.coze.cn)
 * 
 * 注：integration.coze.cn 返回的 content 字段是加密的，
 * 因此通过官方 API 查询文档名称来代替显示
 */

import { KnowledgeClient } from 'coze-coding-dev-sdk';
import type { RetrievedDocument, RetrievalResponse, RetrievalOptions } from './index';

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
    const topK = options.topK || 5;
    const client = new KnowledgeClient();
    const searchResult = await client.search(query, undefined, topK);

    const chunks = searchResult.chunks || [];

    if (chunks.length === 0) {
      console.log('[Coze Provider] 未找到相关结果');
      return { success: false, documents: [] };
    }

    // 转换为统一格式
    // 注：chunk.content 来自 integration.coze.cn，是加密的不可直接展示
    // 用 doc_id 作为文档标识，让调用方自行查询文档名称
    const documents: RetrievedDocument[] = chunks.map((chunk) => ({
      id: chunk.doc_id || `coze-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: `[匹配自文档 ${chunk.doc_id}]`, // content 不可读，用占位文本
      documentName: `文档 ${chunk.doc_id?.slice(-6) || '未知'}`,
      score: chunk.score,
      metadata: {
        provider: 'coze',
        docId: chunk.doc_id,
        chunkId: chunk.chunk_id,
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
