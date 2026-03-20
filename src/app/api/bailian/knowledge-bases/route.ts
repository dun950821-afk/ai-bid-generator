/**
 * 百炼知识库管理API
 * GET: 获取知识库列表
 * POST: 创建知识库
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 获取知识库列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const service = await createBailianKnowledgeService();
    const result = await service.listKnowledgeBases({ limit, offset });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] List knowledge bases failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取知识库列表失败' },
      { status: 500 }
    );
  }
}

/**
 * 创建知识库
 * @description 支持完整的百炼参数配置
 * 
 * 请求参数:
 * 
 * ========== 基础参数 ==========
 * - name: 知识库名称（必填，1-20字符）
 * - description: 知识库描述
 * 
 * ========== 数据源配置 ==========
 * - sourceType: 数据源类型 (DATA_CENTER_CATEGORY | DATA_CENTER_FILE | DATA_CENTER_STRUCTURED_TABLE)
 * - documentIds: 文件ID列表
 * - categoryIds: 类目ID列表
 * 
 * ========== 模型配置 ==========
 * - embeddingModel: Embedding模型名称
 * - rerankModel: Rerank模型名称
 * 
 * ========== 切分配置 ==========
 * - chunkSize: 分段长度 (1-6000字符，默认500)
 * - overlapSize: 分段重叠长度 (0-1024字符，默认100)
 * - chunkMode: 切分策略 (length | page | h1 | h2 | regex)
 * - separator: 自定义分隔符 (仅 chunkMode='regex' 时生效)
 * 
 * ========== 高级配置 ==========
 * - enableRewrite: 是否启用多轮对话改写
 * - enableHeaders: Excel文件是否启用表头
 * 
 * ========== 规格配置 ==========
 * - pipelineCommercialType: 知识库规格 (standard | enterprise)
 * - pipelineCommercialCu: RCU数量 (1-200)
 * 
 * ========== 场景配置 ==========
 * - knowledgeScene: 知识库场景 (如 visual_document_qa)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      // 基础参数
      name,
      description,
      
      // 数据源配置
      sourceType,
      documentIds,
      categoryIds,
      
      // 模型配置
      embeddingModel,
      rerankModel,
      
      // 切分配置
      chunkSize,
      overlapSize,
      chunkMode,
      separator,
      
      // 高级配置
      enableRewrite,
      enableHeaders,
      
      // 规格配置
      pipelineCommercialType,
      pipelineCommercialCu,
      
      // 场景配置
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
      name,
      description,
      
      // 数据源配置
      sourceType,
      documentIds,
      categoryIds,
      
      // 模型配置
      embeddingModel,
      rerankModel,
      
      // 切分配置
      chunkSize,
      overlapSize,
      chunkMode,
      separator,
      
      // 高级配置
      enableRewrite,
      enableHeaders,
      
      // 规格配置
      pipelineCommercialType,
      pipelineCommercialCu,
      
      // 场景配置
      knowledgeScene,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Bailian API] Create knowledge base failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '创建知识库失败' },
      { status: 500 }
    );
  }
}
