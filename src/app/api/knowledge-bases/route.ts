/**
 * 统一知识库管理API
 * 根据 active_provider 自动路由到百炼或IMA
 * GET: 获取知识库列表
 * POST: 创建知识库（仅百炼支持）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider, getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { createBailianKnowledgeService } from '@/lib/bailian/service';
import { searchKnowledgeBases, type IMAConfig } from '@/lib/services/ima-service';

/**
 * 获取知识库列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const keyword = searchParams.get('keyword') || '';
    const provider = await getActiveProvider();

    if (provider === 'ima') {
      const providerConfig = await getIMAProviderConfig();
      if (!providerConfig.apiKey || !providerConfig.clientId) {
        return NextResponse.json(
          { success: false, error: 'IMA知识库未配置（需要 API Key 和 Client ID）' },
          { status: 400 }
        );
      }

      const config: IMAConfig = {
        apiKey: providerConfig.apiKey,
        clientId: providerConfig.clientId,
      };

      const page = Math.floor(offset / limit) + 1;
      const result = await searchKnowledgeBases(config, { keyword, page, page_size: limit });
      
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || '获取IMA知识库列表失败' },
          { status: 500 }
        );
      }

      // 统一返回格式
      const kbList = result.data?.list || [];
      return NextResponse.json({
        success: true,
        data: {
          items: kbList.map((kb) => ({
            id: kb.knowledge_base_id,
            name: kb.name,
            description: kb.description || '',
            documentCount: kb.doc_count || 0,
            createdAt: kb.create_time ? new Date(kb.create_time * 1000).toISOString() : '',
            updatedAt: kb.update_time ? new Date(kb.update_time * 1000).toISOString() : '',
            _provider: 'ima',
          })),
          total: result.data?.total || kbList.length,
        },
      });
    }

    // 默认百炼
    const service = await createBailianKnowledgeService();
    const result = await service.listKnowledgeBases({ limit, offset });
    // 给每个知识库添加 _provider 标识
    if (result.data?.items) {
      result.data.items = result.data.items.map((kb: any) => ({
        ...kb,
        _provider: 'bailian',
      }));
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Knowledge API] List knowledge bases failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取知识库列表失败' },
      { status: 500 }
    );
  }
}

/**
 * 创建知识库（仅百炼支持）
 */
export async function POST(request: NextRequest) {
  try {
    const provider = await getActiveProvider();
    if (provider === 'ima') {
      return NextResponse.json(
        { success: false, error: 'IMA知识库暂不支持通过API创建，请在IMA平台创建' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      name, description,
      sourceType, documentIds, categoryIds,
      embeddingModel, rerankModel,
      chunkSize, overlapSize, chunkMode, separator,
      enableRewrite, enableHeaders,
      pipelineCommercialType, pipelineCommercialCu,
      knowledgeScene,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '知识库名称不能为空' },
        { status: 400 }
      );
    }

    const service = await createBailianKnowledgeService();
    const result = await service.createKnowledgeBase({
      name, description,
      sourceType, documentIds, categoryIds,
      embeddingModel, rerankModel,
      chunkSize, overlapSize, chunkMode, separator,
      enableRewrite, enableHeaders,
      pipelineCommercialType, pipelineCommercialCu,
      knowledgeScene,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Knowledge API] Create knowledge base failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '创建知识库失败' },
      { status: 500 }
    );
  }
}
