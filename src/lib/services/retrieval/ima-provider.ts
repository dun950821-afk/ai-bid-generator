import { getIMAProviderConfig } from './provider';
import * as imaService from '@/lib/services/ima-service';
import type { RetrievedDocument, RetrievalResponse, RetrievalOptions } from './index';

/**
 * IMA 知识库检索适配器
 * 根据 active_provider 配置动态调用 IMA 知识库搜索 API
 */

export async function retrieveFromIMA(
  query: string,
  options: RetrievalOptions
): Promise<RetrievalResponse> {
  const config = await getIMAProviderConfig();
  if (!config) {
    console.warn('[IMA Provider] IMA知识库未配置，跳过检索');
    return { success: false, documents: [] };
  }

  const knowledgeBaseIds = options.knowledgeBaseIds || [];
  const topK = options.topK || 5;
  const allDocuments: RetrievedDocument[] = [];

  for (const kbId of knowledgeBaseIds) {
    try {
      const result = await imaService.searchKnowledge(config, {
        knowledge_base_id: kbId,
        query,
        limit: topK,
      });

      if (result.success && result.data?.info_list) {
        const docs: RetrievedDocument[] = result.data.info_list.map(item => ({
          id: item.media_id || `ima-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          content: item.highlight_content || item.title || '',
          documentName: item.title || '未知文档',
          score: 0.8, // IMA 不返回相关性分数，给默认值
          metadata: {
            knowledgeBaseId: kbId,
            mediaId: item.media_id,
            mediaType: item.media_type,
            provider: 'ima',
          },
        }));
        allDocuments.push(...docs);
      }
    } catch (error) {
      console.error(`[IMA Provider] 知识库 ${kbId} 检索失败:`, error);
    }
  }

  return {
    success: allDocuments.length > 0,
    documents: allDocuments.slice(0, topK),
  };
}
