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
  SourceType,
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
   * @param config 知识库配置
   * @returns 知识库ID
   */
  async create(config: KnowledgeBaseConfig): Promise<ApiResponse<{ id: string }>> {
    const request = new $Bailian20231229.CreateIndexRequest({
      name: config.name,
      structureType: config.structureType,
      sinkType: config.sinkType,
      description: config.description,
      embeddingModelName: config.embeddingModelName || 'text-embedding-v4',
      rerankModelName: config.rerankModelName || 'qwen3-rerank-hybrid',
      rerankMinScore: config.rerankMinScore || 0.01,
      chunkSize: config.chunkSize || 500,
      overlapSize: config.overlapSize || 100,
      sinkInstanceId: config.sinkInstanceId,
      sinkRegion: config.sinkRegion,
      sourceType: 'DATA_CENTER_CATEGORY' as SourceType,
    });

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
   * 映射知识库对象
   */
  private mapToKnowledgeBase(item: any): KnowledgeBase {
    return {
      id: item.id || '',
      name: item.name || '',
      description: item.description,
      structureType: item.structureType || 'unstructured',
      status: this.mapStatus(item.status),
      embeddingModelName: item.embeddingModelName || 'text-embedding-v3',
      rerankModelName: item.rerankModelName,
      documentCount: item.documentCount || 0,
      createdAt: new Date(item.gmtCreate || Date.now()),
      updatedAt: new Date(item.gmtModified || Date.now()),
    };
  }

  /**
   * 映射知识库状态
   */
  private mapStatus(status: string): KnowledgeBaseStatus {
    const statusMap: Record<string, KnowledgeBaseStatus> = {
      CREATING: 'creating',
      ACTIVE: 'active',
      FAILED: 'failed',
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
