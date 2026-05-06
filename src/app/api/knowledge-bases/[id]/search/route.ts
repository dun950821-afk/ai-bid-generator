/**
 * 统一知识库搜索API
 * 根据 active_provider 自动路由到百炼或IMA
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/services/retrieval/provider';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { query, topK = 5 } = body;
    const provider = await getActiveProvider();

    if (provider === 'ima') {
      // 转发到 IMA 搜索 API
      const baseUrl = process.env.DEPLOY_RUN_PORT
        ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
        : 'http://localhost:5000';
      const imaRes = await fetch(`${baseUrl}/api/ima/knowledge-bases/${id}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK }),
      });
      const imaData = await imaRes.json();
      return NextResponse.json(imaData);
    }

    // 默认百炼搜索
    const baseUrl = process.env.DEPLOY_RUN_PORT
      ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
      : 'http://localhost:5000';
    const bailianRes = await fetch(`${baseUrl}/api/bailian/knowledge-bases/${id}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK }),
    });
    const bailianData = await bailianRes.json();
    return NextResponse.json(bailianData);
  } catch (error: any) {
    console.error('[Knowledge API] Search failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '搜索失败' },
      { status: 500 }
    );
  }
}
