/**
 * 知识库检索工具类
 * @description 提供知识库检索功能，支持多模态检索、标签过滤、多轮对话等
 */

import { BailianClient } from './client';
import {
  RetrievalConfig,
  HybridRetrievalConfig,
  RetrievalResult,
  ApiResponse,
} from './types';
import * as $Bailian20231229 from '@alicloud/bailian20231229';
import * as $Util from '@alicloud/tea-util';

/**
 * 检索管理器
 */
export class RetrievalManager {
  constructor(private client: BailianClient) {}

  /**
   * 检索知识库
   * @param config 检索配置
   * @returns 检索结果列表
   */
  async retrieve(config: RetrievalConfig): Promise<ApiResponse<RetrievalResult[]>> {
    // 百炼SDK只支持单个indexId，取第一个知识库ID
    const indexId = config.knowledgeBaseIds[0];
    
    if (!indexId) {
      return {
        requestId: '',
        success: false,
        message: '知识库ID不能为空',
      };
    }

    // 构建请求参数
    const requestParams: any = {
      query: config.query,
      indexId: indexId,
      
      // ========== 检索控制参数 ==========
      // 向量检索数量 (优先使用 denseSimilarityTopK，兼容旧参数 topK)
      denseSimilarityTopK: config.denseSimilarityTopK || config.topK || 100,
      
      // 如果设置了 sparseSimilarityTopK，则启用混合检索
      ...(config.sparseSimilarityTopK && {
        sparseSimilarityTopK: config.sparseSimilarityTopK,
      }),
      
      // ========== 重排序控制参数 ==========
      // 是否启用重排序 (默认 true)
      enableReranking: config.enableReranking ?? true,
      
      // 相似度阈值
      rerankMinScore: config.rerankMinScore || 0.01,
      
      // 重排序后返回数量 (1-20)
      ...(config.rerankTopN && { rerankTopN: config.rerankTopN }),
      
      // 重排序模型名称
      ...(config.rerankModelName && { rerankModelName: config.rerankModelName }),
      
      // ========== 多轮对话参数 ==========
      // 是否启用查询改写
      ...(config.enableRewrite && { enableRewrite: true }),
      
      // 对话历史 (启用查询改写时传入)
      ...(config.enableRewrite && config.queryHistory && {
        queryHistory: config.queryHistory.map(item => ({
          role: item.role,
          content: item.content,
        })),
      }),
      
      // ========== 多模态检索参数 ==========
      // 图片检索
      ...(config.images && config.images.length > 0 && {
        images: config.images,
      }),
    };

    // ========== 标签过滤 (使用 searchFilters) ==========
    // 构建 searchFilters 参数
    const searchFilters = this.buildSearchFilters(config);
    if (searchFilters && searchFilters.length > 0) {
      requestParams.searchFilters = searchFilters;
    }

    const request = new $Bailian20231229.RetrieveRequest(requestParams);
    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .retrieveWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      return {
        requestId: body.requestId || '',
        success: true,
        data: (data?.chunks || []).map((chunk: any) => this.mapToRetrievalResult(chunk)),
      };
    });
  }

  /**
   * 构建 searchFilters 参数
   * @description 根据官方文档，使用 searchFilters 进行标签过滤
   * - 多个标签是 OR 关系
   * - 多个子分组是 AND 关系
   * @see https://help.aliyun.com/zh/model-studio/how-to-use-search-filters
   */
  private buildSearchFilters(config: RetrievalConfig): Array<Record<string, any>> | undefined {
    const filters: Array<Record<string, any>> = [];
    
    // 如果有自定义的 searchFilters，直接使用
    if (config.searchFilters && config.searchFilters.length > 0) {
      filters.push(...config.searchFilters);
    }
    
    // 如果有标签，构建标签过滤
    // 标签格式：{ tags: JSON.stringify(["标签1", "标签2"]) }
    // 多个标签之间是 OR 关系
    if (config.tags && config.tags.length > 0) {
      filters.push({
        tags: JSON.stringify(config.tags),
      });
    }
    
    return filters.length > 0 ? filters : undefined;
  }

  /**
   * 混合检索（向量+全文）
   * @param config 混合检索配置
   * @returns 检索结果列表
   */
  async hybridRetrieve(
    config: HybridRetrievalConfig
  ): Promise<ApiResponse<RetrievalResult[]>> {
    // 混合检索通过设置 sparseSimilarityTopK 启用
    const hybridConfig: RetrievalConfig = {
      ...config,
      // 同时启用向量检索和关键词检索
      denseSimilarityTopK: config.denseSimilarityTopK || config.topK || 100,
      sparseSimilarityTopK: config.sparseSimilarityTopK || 100,
    };
    
    return this.retrieve(hybridConfig);
  }

  /**
   * 检索并返回格式化的答案
   * @param config 检索配置
   * @returns 检索结果和格式化文本
   */
  async retrieveWithFormat(
    config: RetrievalConfig
  ): Promise<
    ApiResponse<{
      results: RetrievalResult[];
      formattedText: string;
    }>
  > {
    const response = await this.retrieve(config);

    if (!response.success || !response.data) {
      return {
        requestId: response.requestId,
        success: false,
        message: response.message,
      };
    }

    // 格式化结果为文本
    const formattedText = response.data
      .map((result, index) => {
        const parts = [
          `【来源 ${index + 1}】${result.documentName}`,
        ];
        
        // 如果有层级标题，显示层级结构
        if (result.hierTitle) {
          parts.push(`章节：${result.hierTitle}`);
        }
        
        parts.push(`内容：${result.content}`);
        
        if (result.pageNumber) {
          parts.push(`页码：${result.pageNumber}`);
        }
        
        // 如果有图片，显示图片信息
        if (result.imageUrl && result.imageUrl.length > 0) {
          parts.push(`图片：${result.imageUrl.length}张`);
        }
        
        parts.push(`相关度：${(result.score * 100).toFixed(1)}%`);
        
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    return {
      requestId: response.requestId,
      success: true,
      data: {
        results: response.data,
        formattedText,
      },
    };
  }

  /**
   * 按知识库分组检索
   * @param config 检索配置
   * @returns 按知识库分组的结果
   */
  async retrieveGrouped(
    config: RetrievalConfig
  ): Promise<
    ApiResponse<
      Map<
        string,
        {
          knowledgeBaseName: string;
          results: RetrievalResult[];
        }
      >
    >
  > {
    const response = await this.retrieve(config);

    if (!response.success || !response.data) {
      return {
        requestId: response.requestId,
        success: false,
        message: response.message,
      };
    }

    // 按知识库ID分组
    const groupedResults = new Map<
      string,
      {
        knowledgeBaseName: string;
        results: RetrievalResult[];
      }
    >();

    for (const result of response.data) {
      const docId = result.documentId;
      
      if (!groupedResults.has(docId)) {
        groupedResults.set(docId, {
          knowledgeBaseName: result.documentName,
          results: [],
        });
      }
      
      groupedResults.get(docId)!.results.push(result);
    }

    return {
      requestId: response.requestId,
      success: true,
      data: groupedResults,
    };
  }

  /**
   * 带重排序的检索
   * @param config 检索配置
   * @param rerankThreshold 重排序阈值
   * @returns 过滤后的检索结果
   */
  async retrieveWithRerank(
    config: RetrievalConfig,
    rerankThreshold: number = 0.3
  ): Promise<ApiResponse<RetrievalResult[]>> {
    // 强制启用重排序
    const response = await this.retrieve({
      ...config,
      enableReranking: true,
    });

    if (!response.success || !response.data) {
      return response;
    }

    // 过滤低分结果
    const filteredResults = response.data.filter(
      result => result.score >= rerankThreshold
    );

    return {
      requestId: response.requestId,
      success: true,
      data: filteredResults,
    };
  }

  /**
   * 多轮对话检索（使用百炼原生能力）
   * @description 使用百炼原生的查询改写功能，支持上下文理解和追问
   * @param query 当前问题
   * @param knowledgeBaseIds 知识库ID列表
   * @param conversationHistory 对话历史
   * @param options 其他检索选项
   * @returns 检索结果
   */
  async retrieveWithContext(
    query: string,
    knowledgeBaseIds: string[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    options: Partial<RetrievalConfig> = {}
  ): Promise<ApiResponse<RetrievalResult[]>> {
    // 如果没有对话历史，直接检索（不启用改写）
    if (conversationHistory.length === 0) {
      return this.retrieve({
        query,
        knowledgeBaseIds,
        ...options,
        enableRewrite: false,
      });
    }

    // 使用百炼原生的查询改写功能
    // 百炼会自动：
    // 1. 理解上下文，识别追问
    // 2. 提取关键词
    // 3. 改写查询以增强语义
    return this.retrieve({
      query,
      knowledgeBaseIds,
      // 启用百炼原生的查询改写
      enableRewrite: true,
      queryHistory: conversationHistory,
      ...options,
    });
  }

  /**
   * 图片检索
   * @description 以图搜文或图文混合检索
   * @param images 图片URL列表
   * @param query 文本查询（可选）
   * @param knowledgeBaseIds 知识库ID列表
   * @param options 其他检索选项
   * @returns 检索结果
   */
  async retrieveByImages(
    images: string[],
    query: string | undefined,
    knowledgeBaseIds: string[],
    options: Partial<RetrievalConfig> = {}
  ): Promise<ApiResponse<RetrievalResult[]>> {
    return this.retrieve({
      query: query || '', // 图片检索时 query 可以为空
      knowledgeBaseIds,
      images,
      ...options,
    });
  }

  /**
   * 高级标签过滤检索
   * @description 支持多条件AND组合的标签过滤
   * @param query 查询文本
   * @param knowledgeBaseIds 知识库ID列表
   * @param searchFilters 高级过滤条件
   * @example
   * // 单值查询
   * { "姓名": "张三" }
   * 
   * // 多值查询 (OR关系)
   * { "姓名": JSON.stringify(["张三", "李四"]) }
   * 
   * // 范围查询
   * { "年龄": JSON.stringify({ gte: 20, lte: 30 }) }
   * 
   * // 模糊查询
   * { "岗位": JSON.stringify({ like: "技%员" }) }
   * 
   * // 多条件AND组合
   * [{ "姓名": "张三" }, { "性别": "男" }]
   * @returns 检索结果
   */
  async retrieveWithFilters(
    query: string,
    knowledgeBaseIds: string[],
    searchFilters: Array<Record<string, any>>,
    options: Partial<RetrievalConfig> = {}
  ): Promise<ApiResponse<RetrievalResult[]>> {
    return this.retrieve({
      query,
      knowledgeBaseIds,
      searchFilters,
      ...options,
    });
  }

  /**
   * 映射检索结果
   * @description 将百炼API返回的数据映射为标准格式，支持多模态数据
   */
  private mapToRetrievalResult(chunk: Record<string, any>): RetrievalResult {
    return {
      content: chunk.content || '',
      documentName: chunk.documentName || chunk.doc_name || 'Unknown',
      documentId: chunk.documentId || chunk.doc_id || '',
      score: chunk.score || 0,
      pageNumber: chunk.pageNumber || chunk.page_number,
      
      // 多模态支持
      imageUrl: chunk.image_url || chunk.imageUrl,
      audioUrl: chunk.audio_url || chunk.audioUrl,
      videoUrl: chunk.video_url || chunk.videoUrl,
      
      // 文档结构信息
      hierTitle: chunk.hier_title || chunk.hierTitle,
      title: chunk.title,
      chunkId: chunk.nid || chunk.chunkId,
      
      // 保留完整元数据
      metadata: chunk.metadata || chunk,
    };
  }
}
