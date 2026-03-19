/**
 * 阿里云百炼客户端核心类
 * @description 封装百炼SDK客户端，提供通用的请求处理能力
 */

import Bailian20231229 from '@alicloud/bailian20231229';
import * as $OpenApi from '@alicloud/openapi-client';
import { BailianConfig } from './config';

/**
 * 请求选项
 */
export interface RequestOptions {
  /** 重试次数 */
  retries?: number;
  /** 重试延迟(毫秒) */
  retryDelay?: number;
  /** 超时时间(毫秒) */
  timeout?: number;
}

/**
 * 百炼客户端类
 */
export class BailianClient {
  private client: Bailian20231229;
  private workspaceId: string;
  private config: BailianConfig;

  /**
   * 构造函数
   * @param config 百炼配置
   */
  constructor(config: BailianConfig) {
    this.config = config;
    this.workspaceId = config.workspaceId;

    // 初始化OpenAPI配置
    const openApiConfig = new $OpenApi.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: config.endpoint || 'bailian.cn-beijing.aliyuncs.com',
    });

    // 设置超时时间
    if (config.region) {
      openApiConfig.regionId = config.region;
    }

    // 创建百炼客户端实例
    this.client = new Bailian20231229(openApiConfig);
  }

  /**
   * 获取工作空间ID
   * @returns 工作空间ID
   */
  getWorkspaceId(): string {
    return this.workspaceId;
  }

  /**
   * 获取配置信息
   * @returns 配置对象
   */
  getConfig(): BailianConfig {
    return { ...this.config };
  }

  /**
   * 通用请求方法（带重试和错误处理）
   * @param request 请求函数
   * @param options 请求选项
   * @returns 响应结果
   */
  async request<T>(
    request: () => Promise<T>,
    options: RequestOptions = {}
  ): Promise<T> {
    const { retries = 3, retryDelay = 1000 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await request();
      } catch (error: any) {
        lastError = error;
        
        // 获取错误信息
        const errorCode = error.code || error.statusCode;
        const errorMessage = error.message || 'Unknown error';

        // 判断是否需要重试
        if (this.shouldRetry(errorCode, attempt, retries)) {
          const delay = retryDelay * Math.pow(2, attempt); // 指数退避
          console.warn(
            `[Bailian] Request failed (attempt ${attempt + 1}/${retries + 1}), ` +
            `retrying in ${delay}ms... Error: ${errorMessage}`
          );
          await this.sleep(delay);
          continue;
        }

        // 不可重试的错误，直接抛出
        throw this.wrapError(error);
      }
    }

    // 所有重试都失败了
    throw lastError ? this.wrapError(lastError) : new Error('Request failed after all retries');
  }

  /**
   * 判断是否应该重试
   * @param errorCode 错误码
   * @param attempt 当前尝试次数
   * @param maxRetries 最大重试次数
   * @returns 是否应该重试
   */
  private shouldRetry(errorCode: any, attempt: number, maxRetries: number): boolean {
    // 如果已经达到最大重试次数，不再重试
    if (attempt >= maxRetries) {
      return false;
    }

    // 可重试的错误码
    const retryableCodes = [
      'Throttling',           // 限流
      'ServiceUnavailable',   // 服务不可用
      'InternalError',        // 内部错误
      'Timeout',              // 超时
      429,                    // HTTP 429
      503,                    // HTTP 503
      504,                    // HTTP 504
    ];

    return retryableCodes.includes(errorCode);
  }

  /**
   * 包装错误信息
   * @param error 原始错误
   * @returns 包装后的错误
   */
  private wrapError(error: any): Error {
    const errorCode = error.code || error.statusCode || 'UNKNOWN';
    const errorMessage = error.message || 'Unknown error';
    
    const wrappedError = new Error(
      `[Bailian Error ${errorCode}] ${errorMessage}`
    );
    
    // 保留原始错误信息
    (wrappedError as any).originalError = error;
    (wrappedError as any).code = errorCode;
    
    return wrappedError;
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取原始SDK客户端实例
   * @returns 百炼SDK客户端
   */
  getRawClient(): Bailian20231229 {
    return this.client;
  }

  /**
   * 检查客户端健康状态
   * @returns 是否健康
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 尝试获取知识库列表来验证连接
      const { ListIndicesRequest } = await import('@alicloud/bailian20231229');
      const { RuntimeOptions } = await import('@alicloud/tea-util');
      
      const request = new ListIndicesRequest({ pageSize: '1' });
      const runtime = new RuntimeOptions({});
      
      await this.client.listIndicesWithOptions(
        this.workspaceId,
        request,
        {},
        runtime
      );
      return true;
    } catch (error) {
      console.error('[Bailian] Health check failed:', error);
      return false;
    }
  }
}
