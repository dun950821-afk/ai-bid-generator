/**
 * IMA 知识库浏览 API
 * 浏览知识库的文件和文件夹，支持层级浏览
 * 对应 IMA API: /openapi/wiki/v1/get_knowledge_list
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { getKnowledgeList, type IMAConfig } from '@/lib/services/ima-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const parent_id = searchParams.get('parent_id') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const page_size = parseInt(searchParams.get('page_size') || '50', 10);

    const providerConfig = await getIMAProviderConfig();
    if (!providerConfig.apiKey || !providerConfig.clientId) {
      return NextResponse.json(
        { success: false, error: 'IMA知识库未配置' },
        { status: 400 }
      );
    }

    const config: IMAConfig = {
      apiKey: providerConfig.apiKey,
      clientId: providerConfig.clientId,
    };

    const result = await getKnowledgeList(config, {
      knowledge_base_id: id,
      parent_id,
      page,
      page_size,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '获取知识库内容失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[IMA Browse] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '浏览知识库失败' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { parent_id = '', page = 1, page_size = 50 } = body;

    const providerConfig = await getIMAProviderConfig();
    if (!providerConfig.apiKey || !providerConfig.clientId) {
      return NextResponse.json(
        { success: false, error: 'IMA知识库未配置' },
        { status: 400 }
      );
    }

    const config: IMAConfig = {
      apiKey: providerConfig.apiKey,
      clientId: providerConfig.clientId,
    };

    const result = await getKnowledgeList(config, {
      knowledge_base_id: id,
      parent_id,
      page,
      page_size,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '获取知识库内容失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[IMA Browse] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '浏览知识库失败' },
      { status: 500 }
    );
  }
}
