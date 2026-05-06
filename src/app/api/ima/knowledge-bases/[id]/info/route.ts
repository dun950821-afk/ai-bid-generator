import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import * as imaService from '@/lib/services/ima-service';

/**
 * IMA 知识库信息 API
 * GET/POST /api/ima/knowledge-bases/[id]/info
 * 获取知识库详细信息
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

  const result = await imaService.getKnowledgeBase(config, [id]);
  
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // 从 infos 映射中提取目标知识库详情
  const detail = result.data?.infos?.[id] || result.data?.infos?.[decodeURIComponent(id)] || null;
  
  if (!detail) {
    return NextResponse.json({ error: '知识库不存在', raw_data: result.data }, { status: 404 });
  }

  // IMA API 返回的字段: id, name, cover_url, description
  return NextResponse.json({
    success: true,
    data: {
      id: detail.id || id,
      name: detail.name || '',
      description: detail.description || '',
      coverUrl: detail.cover_url || '',
      _provider: 'ima',
    },
  });
}

export const GET = getKnowledgeBaseInfo;
export const POST = getKnowledgeBaseInfo;
