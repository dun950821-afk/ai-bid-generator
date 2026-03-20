/**
 * 知识库管理工具类
 * @description 提供知识库的创建、查询、删除等功能
 */

import { BailianClient } from './client';
import {
  KnowledgeBaseConfig,
  KnowledgeBase,
  KnowledgeBaseStatus,
  JobStatus,
  PaginatedResult,
  PaginationParams,
  ApiResponse,
  IndexJobStatus,
} from './types';
import * as $Bailian20231229 from '@alicloud/bailian20231229';
import * as $Util from '@alicloud/tea-util';

/**
 * 知识库管理器
 */
export class KnowledgeBaseManager {
  constructor(private client: BailianClient) {}

  /**
   * 创建知识库
   * @description 创建知识库，支持完整的百炼参数配置
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-createindex
   * @param config 知识库配置
   * @returns 知识库ID
   */
  async create(config: KnowledgeBaseConfig): Promise<ApiResponse<{ id: string }>> {
    // 构建请求参数
    const requestParams: any = {
      // ========== 基础配置 ==========
      name: config.name,
      description: config.description,
      structureType: config.structureType,
      
      // ========== 数据源配置 (必填) ==========
      sourceType: config.sourceType || 'DATA_CENTER_CATEGORY',
      
      // ========== 模型配置 ==========
      embeddingModelName: config.embeddingModelName || 'text-embedding-v4',
      rerankModelName: config.rerankModelName || 'qwen3-rerank-hybrid',
      rerankMinScore: config.rerankMinScore || 0.01,
      
      // ========== 切分配置 ==========
      chunkSize: config.chunkSize || 500,
      overlapSize: config.overlapSize || 100,
      
      // ========== 向量存储配置 ==========
      sinkType: config.sinkType,
      sinkInstanceId: config.sinkInstanceId,
      sinkRegion: config.sinkRegion,
    };

    // ========== 可选参数 ==========

    // 文件ID列表
    if (config.documentIds && config.documentIds.length > 0) {
      requestParams.documentIds = config.documentIds;
    }

    // 类目ID列表
    if (config.categoryIds && config.categoryIds.length > 0) {
      requestParams.categoryIds = config.categoryIds;
    }

    // 切分策略
    if (config.chunkMode) {
      requestParams.chunkMode = config.chunkMode;
      
      // 自定义分隔符 (仅 chunkMode='regex' 时生效)
      if (config.separator) {
        requestParams.separator = config.separator;
      }
    }

    // 是否启用多轮对话改写
    if (config.enableRewrite !== undefined) {
      requestParams.enableRewrite = config.enableRewrite;
    }

    // Excel文件是否启用表头
    if (config.enableHeaders !== undefined) {
      requestParams.enableHeaders = config.enableHeaders;
    }

    // 元数据提取配置
    if (config.metaExtractColumns && config.metaExtractColumns.length > 0) {
      requestParams.metaExtractColumns = config.metaExtractColumns.map(col => ({
        key: col.key,
        value: col.value,
        type: col.type,
        desc: col.desc,
        enableLlm: col.enableLlm,
        enableSearch: col.enableSearch,
      }));
    }

    // 规格配置
    if (config.pipelineCommercialType) {
      requestParams.pipelineCommercialType = config.pipelineCommercialType;
    }
    if (config.pipelineCommercialCu) {
      requestParams.pipelineCommercialCu = config.pipelineCommercialCu;
    }

    // 场景配置
    if (config.knowledgeScene) {
      requestParams.knowledgeScene = config.knowledgeScene;
    }

    const request = new $Bailian20231229.CreateIndexRequest(requestParams);
    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .createIndexWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;

      return {
        requestId: body.requestId || '',
        success: body.success || false,
        code: body.code,
        message: body.message,
        data: body.data ? { id: body.data.id || '' } : undefined,
      };
    });
  }

  /**
   * 提交知识库创建任务
   * @description 创建知识库后必须调用此方法才能完成创建
   * @param indexId 知识库ID
   * @returns 提交结果
   */
  async submitCreateJob(indexId: string): Promise<ApiResponse<void>> {
    const request = new $Bailian20231229.SubmitIndexJobRequest({
      indexId,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .submitIndexJobWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;

      return {
        requestId: body.requestId || '',
        success: body.success || false,
        code: body.code,
        message: body.message,
      };
    });
  }

  /**
   * 查询知识库列表
   * @param params 分页参数和过滤条件
   * @returns 知识库列表
   */
  async list(
    params: PaginationParams & { name?: string } = {}
  ): Promise<ApiResponse<PaginatedResult<KnowledgeBase>>> {
    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const request = new $Bailian20231229.ListIndicesRequest({
        name: params.name,
        pageNumber: params.pageNumber || 1,
        pageSize: params.pageSize || 10,
      });
      
      const response = await this.client
        .getRawClient()
        .listIndicesWithOptions(
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
        data: {
          items: (data?.indices || []).map(item => this.mapToKnowledgeBase(item)),
          totalCount: data?.totalCount || 0,
          pageNumber: data?.pageNumber || 1,
          pageSize: data?.pageSize || 10,
        },
      };
    });
  }

  /**
   * 查询知识库详情
   * @param indexId 知识库ID
   * @returns 知识库详情
   */
  async get(indexId: string): Promise<ApiResponse<KnowledgeBase>> {
    // 百炼API没有单独的查询详情接口，从列表中过滤
    const response = await this.list({ pageSize: 100 });
    
    if (!response.success || !response.data) {
      return {
        requestId: response.requestId,
        success: false,
        message: response.message || 'Failed to list knowledge bases',
      };
    }

    const knowledgeBase = response.data.items.find(kb => kb.id === indexId);
    
    if (!knowledgeBase) {
      return {
        requestId: response.requestId,
        success: false,
        message: `Knowledge base not found: ${indexId}`,
      };
    }

    return {
      requestId: response.requestId,
      success: true,
      data: knowledgeBase,
    };
  }

  /**
   * 根据名称查找知识库
   * @param name 知识库名称
   * @returns 知识库信息
   */
  async getByName(name: string): Promise<ApiResponse<KnowledgeBase>> {
    const response = await this.list({ name });
    
    if (!response.success || !response.data) {
      return {
        requestId: response.requestId,
        success: false,
        message: response.message || 'Failed to list knowledge bases',
      };
    }

    const knowledgeBase = response.data.items.find(kb => kb.name === name);
    
    if (!knowledgeBase) {
      return {
        requestId: response.requestId,
        success: false,
        message: `Knowledge base not found with name: ${name}`,
      };
    }

    return {
      requestId: response.requestId,
      success: true,
      data: knowledgeBase,
    };
  }

  /**
   * 删除知识库
   * @param indexId 知识库ID
   * @returns 删除结果
   */
  async delete(indexId: string): Promise<ApiResponse<void>> {
    const request = new $Bailian20231229.DeleteIndexRequest({
      indexId,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .deleteIndexWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;

      return {
        requestId: body.requestId || '',
        success: body.success || false,
        code: body.code,
        message: body.message,
      };
    });
  }

  /**
   * 查询知识库创建任务状态
   * @param indexId 知识库ID
   * @returns 任务状态
   */
  async getJobStatus(indexId: string): Promise<ApiResponse<IndexJobStatus>> {
    const request = new $Bailian20231229.GetIndexJobStatusRequest({
      indexId,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .getIndexJobStatusWithOptions(
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
        data: {
          status: this.mapJobStatus(data?.status || ''),
          progress: data?.progress,
          message: data?.message,
        },
      };
    });
  }

  /**
   * 等待知识库创建完成
   * @param indexId 知识库ID
   * @param timeout 超时时间(毫秒)
   * @param interval 检查间隔(毫秒)
   * @returns 最终状态
   */
  async waitForCompletion(
    indexId: string,
    timeout: number = 300000,
    interval: number = 5000
  ): Promise<ApiResponse<IndexJobStatus>> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const statusResponse = await this.getJobStatus(indexId);

      if (!statusResponse.success) {
        return statusResponse;
      }

      const { status } = statusResponse.data!;

      if (status === 'completed' || status === 'failed') {
        return statusResponse;
      }

      // 等待一段时间后继续检查
      await this.sleep(interval);
    }

    return {
      requestId: '',
      success: false,
      message: `Timeout waiting for knowledge base creation: ${indexId}`,
    };
  }

  /**
   * 创建知识库并等待完成
   * @description 一站式创建知识库，自动等待创建完成
   * @param config 知识库配置
   * @param timeout 超时时间(毫秒)
   * @returns 创建结果
   */
  async createAndWait(
    config: KnowledgeBaseConfig,
    timeout: number = 300000
  ): Promise<ApiResponse<{ id: string; status: IndexJobStatus }>> {
    // 1. 创建知识库
    const createResponse = await this.create(config);
    
    if (!createResponse.success || !createResponse.data) {
      return createResponse as any;
    }

    const indexId = createResponse.data.id;

    // 2. 提交创建任务
    const submitResponse = await this.submitCreateJob(indexId);
    
    if (!submitResponse.success) {
      return {
        ...submitResponse,
        data: { id: indexId, status: { status: 'failed' } },
      };
    }

    // 3. 等待创建完成
    const statusResponse = await this.waitForCompletion(indexId, timeout);
    
    return {
      requestId: statusResponse.requestId,
      success: statusResponse.success,
      message: statusResponse.message,
      data: {
        id: indexId,
        status: statusResponse.data!,
      },
    };
  }

  /**
   * 映射知识库对象
   * @description 将百炼API返回的数据映射为完整的 KnowledgeBase 对象
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindices
   */
  private mapToKnowledgeBase(item: any): KnowledgeBase {
    return {
      // ========== 基础信息 ==========
      id: item.id || item.indexId || '',
      name: item.name || '',
      description: item.description,
      structureType: this.mapStructureType(item.structureType),
      status: this.mapStatus(item.status || item.indexStatus || 'ACTIVE'),
      
      // ========== 模型配置 ==========
      embeddingModelName: item.embeddingModelName || item.embeddingModel || 'text-embedding-v4',
      rerankModelName: item.rerankModelName || item.rerankModel,
      rerankMinScore: item.rerankMinScore ? parseFloat(item.rerankMinScore) : undefined,
      enableRewrite: item.enableRewrite,
      
      // ========== 切分配置 ==========
      chunkSize: item.chunkSize,
      overlapSize: item.overlapSize,
      separator: item.separator,
      
      // ========== 数据源配置 ==========
      sourceType: item.sourceType,
      documentIds: item.documentIds,
      // 注意：百炼API的ListIndices不返回文档数量，此字段需要通过ListIndexDocuments API获取
      // 这里设置为0，实际文档数量应该从stats API获取
      documentCount: 0,
      
      // ========== 向量存储配置 ==========
      sinkType: item.sinkType,
      sinkInstanceId: item.sinkInstanceId,
      sinkRegion: item.sinkRegion,
      
      // ========== 配置模式 ==========
      configModel: this.mapConfigModel(item.confgModel),
      
      // ========== 时间信息 ==========
      createdAt: item.gmtCreate ? new Date(item.gmtCreate) : undefined,
      updatedAt: item.gmtModified ? new Date(item.gmtModified) : undefined,
    };
  }

  /**
   * 映射知识库类型
   */
  private mapStructureType(type: string): 'unstructured' | 'structured' | 'multimedia' {
    if (!type) return 'unstructured';
    const lower = type.toLowerCase();
    if (lower === 'structured') return 'structured';
    if (lower === 'multimedia') return 'multimedia';
    return 'unstructured';
  }

  /**
   * 映射配置模式
   */
  private mapConfigModel(model: string): 'recommend' | 'custom' | undefined {
    if (!model) return undefined;
    const lower = model.toLowerCase();
    if (lower === 'recommend' || lower === 'custom') return lower;
    return undefined;
  }

  /**
   * 映射知识库状态
   */
  private mapStatus(status: string): KnowledgeBaseStatus {
    const statusMap: Record<string, KnowledgeBaseStatus> = {
      CREATING: 'creating',
      ACTIVE: 'active',
      FAILED: 'failed',
      RUNNING: 'active',
      PENDING: 'creating',
    };
    return statusMap[status] || 'failed';
  }

  /**
   * 映射任务状态
   */
  private mapJobStatus(status: string): JobStatus {
    const statusMap: Record<string, JobStatus> = {
      PENDING: 'pending',
      RUNNING: 'running',
      COMPLETED: 'completed',
      FAILED: 'failed',
    };
    return statusMap[status] || 'pending';
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
