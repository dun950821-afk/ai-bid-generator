import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import * as imaService from '@/lib/services/ima-service';

/**
 * IMA 知识库信息 API
 * GET/POST /api/ima/knowledge-bases/[id]/info
 * 
 * 策略：同时调用 get_knowledge_base 和 search_knowledge_base，
 * 合并两个接口的数据以获得最完整的知识库信息。
 * 
 * - get_knowledge_base: 返回 id, name, cover_url, description
 * - search_knowledge_base: 返回 kb_id, kb_name, content_count, member_count, 
 *                          description, creator, role_type, base_type
 */
async function getKnowledgeBaseInfo(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const config = await getIMAProviderConfig();
  if (!config) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  // 并行调用两个 API 获取完整信息
  const [detailResult, listResult] = await Promise.all([
    imaService.getKnowledgeBase(config, [id]),
    imaService.searchKnowledgeBases(config, { query: '', limit: 100 }),
  ]);

  // 从 get_knowledge_base 获取基本信息
  const detail = detailResult.success
    ? (detailResult.data?.infos?.[id] || detailResult.data?.infos?.[decodeURIComponent(id)] || null)
    : null;

  // 从 search_knowledge_base 列表中找到匹配的知识库（有 content_count 等丰富字段）
  const listMatch = listResult.success
    ? (listResult.data?.info_list || []).find(kb => kb.kb_id === id || kb.kb_id === decodeURIComponent(id))
    : null;

  if (!detail && !listMatch) {
    return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
  }

  // 合并数据：detail 提供基础信息，listMatch 提供统计信息
  const mergedInfo = {
    id: detail?.id || listMatch?.kb_id || id,
    name: detail?.name || listMatch?.kb_name || '',
    description: detail?.description || listMatch?.description || '',
    coverUrl: detail?.cover_url || listMatch?.cover_url || '',
    // 来自 search_knowledge_base 的丰富字段
    contentCount: listMatch?.content_count ? parseInt(listMatch.content_count, 10) : 0,
    memberCount: listMatch?.member_count ? parseInt(listMatch.member_count, 10) : 0,
    creator: listMatch?.creator || '',
    roleType: listMatch?.role_type || '',
    baseType: listMatch?.base_type || '',
    createTime: listMatch?.create_time || '',
    updateTime: listMatch?.update_time || '',
    _provider: 'ima' as const,
  };

  return NextResponse.json({
    success: true,
    data: mergedInfo,
  });
}

export const GET = getKnowledgeBaseInfo;
export const POST = getKnowledgeBaseInfo;
