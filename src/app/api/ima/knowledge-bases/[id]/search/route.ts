import { NextRequest } from 'next/server';

// IMA 知识库搜索 API
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params;
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return Response.json(
        { success: false, error: '缺少 API Key' },
        { status: 401 }
      );
    }

    if (!knowledgeBaseId) {
      return Response.json(
        { success: false, error: '缺少知识库 ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { query, topK = 5, useConversationMode, conversationHistory } = body;

    if (!query) {
      return Response.json(
        { success: false, error: '缺少查询内容' },
        { status: 400 }
      );
    }

    // 调用 IMA 知识库搜索 API
    const imaApiUrl = 'https://agent.agents.qq.com/v1/knowledge/search';

    const response = await fetch(imaApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        query,
        top_k: topK,
        use_conversation_mode: useConversationMode,
        conversation_history: conversationHistory,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[IMA] 搜索失败:', response.status, errorText);
      return Response.json(
        { success: false, error: `IMA API 请求失败: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // 转换 IMA 响应格式为统一格式
    const results = (data.results || []).map((item: {
      chunk_id?: string;
      content?: string;
      score?: number;
      document_id?: string;
      document_name?: string;
      metadata?: Record<string, unknown>;
    }) => ({
      id: item.chunk_id || `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: item.content || '',
      score: item.score || 0,
      documentId: item.document_id || '',
      documentName: item.document_name || '未知文档',
      metadata: item.metadata || {},
    }));

    return Response.json({
      success: true,
      data: {
        results,
        total: results.length,
        query,
      },
    });
  } catch (error) {
    console.error('[IMA] 搜索异常:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : '搜索失败' },
      { status: 500 }
    );
  }
}
