/**
 * IMA 知识库浏览 API
 * 浏览知识库的文件和文件夹，支持层级浏览
 * 对应 IMA API: POST /openapi/wiki/v1/get_knowledge_list
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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') || '';

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
      parent_id: parent_id || undefined,
      limit,
      cursor: cursor || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '获取知识库内容失败' },
        { status: 500 }
      );
    }

    // 映射为统一文档格式
    const items = result.data?.info_list || [];
    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.knowledge_id,
          name: item.title,
          type: item.type,
          status: item.status,
          file_size: item.file_size,
          file_type: item.file_type,
          parent_id: item.parent_id,
          children_count: item.children_count,
          created_at: item.create_time ? new Date(item.create_time * 1000).toISOString() : '',
          updated_at: item.update_time ? new Date(item.update_time * 1000).toISOString() : '',
        })),
        is_end: result.data?.is_end ?? true,
        next_cursor: result.data?.next_cursor || '',
      },
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
    const { parent_id = '', limit = 50, cursor = '' } = body;

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
      parent_id: parent_id || undefined,
      limit,
      cursor: cursor || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '获取知识库内容失败' },
        { status: 500 }
      );
    }

    const items = result.data?.info_list || [];
    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.knowledge_id,
          name: item.title,
          type: item.type,
          status: item.status,
          file_size: item.file_size,
          file_type: item.file_type,
          parent_id: item.parent_id,
          children_count: item.children_count,
          created_at: item.create_time ? new Date(item.create_time * 1000).toISOString() : '',
          updated_at: item.update_time ? new Date(item.update_time * 1000).toISOString() : '',
        })),
        is_end: result.data?.is_end ?? true,
        next_cursor: result.data?.next_cursor || '',
      },
    });
  } catch (error: any) {
    console.error('[IMA Browse] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '浏览知识库失败' },
      { status: 500 }
    );
  }
}
