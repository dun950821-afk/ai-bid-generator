import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { getKnowledgeBase, getKnowledgeList, searchKnowledgeBases } from '@/lib/services/ima-service';

/**
 * IMA 知识库详情信息 API
 * GET: 获取知识库详细信息
 * 
 * 使用 get_knowledge_base 获取基础信息（name/description/cover_url）
 * 使用 search_knowledge_base 获取补充信息（content_count等）— 如果可用
 * 使用 get_knowledge_list 获取文件计数
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = await getIMAProviderConfig();
    if (!config.apiKey || !config.clientId) {
      return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
    }

    // 并行获取知识库详情和内容列表
    const [infoResult, listResult] = await Promise.all([
      getKnowledgeBase(config, [id]),
      getKnowledgeList(config, { knowledge_base_id: id, limit: 1 }),
    ]);

    if (!infoResult.success || !infoResult.data) {
      return NextResponse.json(
        { error: infoResult.error || '获取知识库信息失败' },
        { status: 500 }
      );
    }

    // get_knowledge_base 返回 infos: { [kb_id]: KnowledgeBaseInfo }
    const info = infoResult.data.infos?.[id];
    if (!info) {
      return NextResponse.json(
        { error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 从 list 结果中获取文件计数（如果有）
    let documentCount = 0;
    if (listResult.success && listResult.data) {
      // is_end=true 且无游标说明数据已全部加载
      documentCount = listResult.data.knowledge_list?.length || 0;
    }

    return NextResponse.json({
      data: {
        id,
        name: info.name,
        description: info.description || '',
        coverUrl: info.cover_url || '',
        documentCount,
        recommendedQuestions: info.recommended_questions || [],
      },
    });
  } catch (error) {
    console.error('IMA info error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取知识库信息失败' },
      { status: 500 }
    );
  }
}
