import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider, getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { searchKnowledge, type IMAConfig } from '@/lib/services/ima-service';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 统一知识库搜索 API
 * POST /api/knowledge-bases/[id]/search
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { query, topK = 5 } = body;

  if (!query) {
    return NextResponse.json({ error: 'query参数必填' }, { status: 400 });
  }

  try {
    const provider = await getActiveProvider();

    if (provider === 'ima') {
      const config = await getIMAProviderConfig();
      if (!config?.apiKey || !config?.clientId) {
        return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
      }

      const imaConfig: IMAConfig = {
        apiKey: config.apiKey,
        clientId: config.clientId,
      };

      const result = await searchKnowledge(imaConfig, {
        knowledge_base_id: id,
        query,
        limit: topK,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'IMA搜索失败' }, { status: 500 });
      }

      // 统一格式返回
      const results = (result.data?.info_list || []).map(item => ({
        content: item.highlight_content || item.title,
        source: item.title,
        score: 0.8,
        metadata: {
          mediaId: item.media_id,
          mediaType: item.media_type,
          provider: 'ima',
        },
      }));

      return NextResponse.json({
        success: true,
        data: { results, total: results.length },
      });
    }

    // 百炼搜索 - 使用百炼知识库检索
    const service = await createBailianKnowledgeService();
    const result = await service.retrieve({
      knowledgeBaseIds: [id],
      query,
      topK,
    });
    const results = Array.isArray(result) ? result : (result as unknown as Record<string, unknown>).data as Array<{ content: string; source?: string; score?: number; metadata?: Record<string, unknown> }> || [];
    return NextResponse.json({
      success: true,
      data: {
        results: results.map((r: { content: string; source?: string; score?: number; metadata?: Record<string, unknown> }) => ({
          content: r.content,
          source: r.source,
          score: r.score,
          metadata: { ...r.metadata, provider: 'bailian' },
        })),
        total: results.length,
      },
    });
  } catch (error: any) {
    console.error('[Knowledge Search API] Search failed:', error);
    return NextResponse.json(
      { error: error.message || '搜索失败' },
      { status: 500 }
    );
  }
}
