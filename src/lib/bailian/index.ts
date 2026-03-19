/**
 * 阿里云百炼知识库集成 - 统一入口
 * @description 提供统一的API接口，简化知识库管理、文档上传和检索功能
 */

// 导入依赖
import { BailianClient } from './client';
import { KnowledgeBaseManager } from './knowledge-base';
import { DocumentManager } from './document';
import { RetrievalManager } from './retrieval';

// 导出类型定义
export type * from './types';

// 导出配置管理
export type { BailianConfig } from './config';
export { createBailianConfig } from './config';

// 导出客户端核心类
export { BailianClient } from './client';

// 导出知识库管理器
export { KnowledgeBaseManager } from './knowledge-base';

// 导出文档管理器
export { DocumentManager } from './document';
export type { FileUploadOptions } from './document';

// 导出检索管理器
export { RetrievalManager } from './retrieval';

/**
 * 百炼客户端 - 统一封装
 * @description 提供一站式API，整合所有功能模块
 */
export class BailianService {
  /** 知识库管理器 */
  readonly knowledgeBase: ReturnType<typeof this.createKnowledgeBaseManager>;
  
  /** 文档管理器 */
  readonly document: ReturnType<typeof this.createDocumentManager>;
  
  /** 检索管理器 */
  readonly retrieval: ReturnType<typeof this.createRetrievalManager>;

  /**
   * 创建百炼服务实例
   * @param config 配置对象
   */
  constructor(config: {
    accessKeyId: string;
    accessKeySecret: string;
    workspaceId: string;
    endpoint?: string;
    regionId?: string;
  }) {
    // 创建客户端
    this.client = new BailianClient(config);

    // 初始化各功能模块
    this.knowledgeBase = this.createKnowledgeBaseManager();
    this.document = this.createDocumentManager();
    this.retrieval = this.createRetrievalManager();
  }

  /**
   * 获取原始客户端
   * @returns 百炼客户端实例
   */
  getClient(): BailianClient {
    return this.client;
  }

  /**
   * 创建知识库管理器
   */
  private createKnowledgeBaseManager() {
    return {
      /**
       * 创建知识库
       */
      create: async (
        name: string,
        description?: string,
        structureType: 'unstructured' | 'structured' | 'multimedia' = 'unstructured',
        sinkType: 'BUILT_IN' | 'ADB' = 'BUILT_IN'
      ) => {
        const manager = new KnowledgeBaseManager(this.client);
        return manager.create({
          name,
          description,
          structureType,
          sinkType,
        });
      },

      /**
       * 查询知识库列表
       */
      list: async (page?: number, pageSize?: number) => {
        const manager = new KnowledgeBaseManager(this.client);
        return manager.list({ pageNumber: page || 1, pageSize: pageSize || 10 });
      },

      /**
       * 获取知识库详情
       */
      get: async (indexId: string) => {
        const manager = new KnowledgeBaseManager(this.client);
        return manager.get(indexId);
      },

      /**
       * 删除知识库
       */
      delete: async (indexId: string) => {
        const manager = new KnowledgeBaseManager(this.client);
        return manager.delete(indexId);
      },
    };
  }

  /**
   * 创建文档管理器
   */
  private createDocumentManager() {
    return {
      /**
       * 上传文件
       */
      uploadFile: async (
        filePath: string,
        options?: import('./document').FileUploadOptions
      ) => {
        const manager = new DocumentManager(this.client);
        return manager.uploadFile(filePath, options);
      },

      /**
       * 上传Buffer
       */
      uploadBuffer: async (
        buffer: Buffer,
        fileName: string,
        options?: import('./document').FileUploadOptions
      ) => {
        const manager = new DocumentManager(this.client);
        return manager.uploadBuffer(buffer, fileName, options);
      },

      /**
       * 查询文件状态
       */
      getStatus: async (fileId: string) => {
        const manager = new DocumentManager(this.client);
        return manager.getFileStatus(fileId);
      },

      /**
       * 等待解析完成
       */
      waitForParsing: async (
        fileId: string,
        timeout?: number,
        interval?: number
      ) => {
        const manager = new DocumentManager(this.client);
        return manager.waitForParsing(fileId, timeout, interval);
      },

      /**
       * 添加到知识库
       */
      addToKnowledgeBase: async (indexId: string, documentIds: string[]) => {
        const manager = new DocumentManager(this.client);
        return manager.addToKnowledgeBase(indexId, documentIds);
      },

      /**
       * 从知识库删除
       */
      removeFromKnowledgeBase: async (indexId: string, documentIds: string[]) => {
        const manager = new DocumentManager(this.client);
        return manager.removeFromKnowledgeBase(indexId, documentIds);
      },
    };
  }

  /**
   * 创建检索管理器
   */
  private createRetrievalManager() {
    return {
      /**
       * 检索知识库
       */
      retrieve: async (
        query: string,
        knowledgeBaseIds: string[],
        topK?: number
      ) => {
        const manager = new RetrievalManager(this.client);
        return manager.retrieve({
          query,
          knowledgeBaseIds,
          topK: topK || 5,
        });
      },

      /**
       * 混合检索
       */
      hybridRetrieve: async (
        query: string,
        knowledgeBaseIds: string[],
        topK?: number
      ) => {
        const manager = new RetrievalManager(this.client);
        return manager.hybridRetrieve({
          query,
          knowledgeBaseIds,
          topK: topK || 5,
        });
      },

      /**
       * 检索并格式化
       */
      retrieveWithFormat: async (
        query: string,
        knowledgeBaseIds: string[],
        topK?: number
      ) => {
        const manager = new RetrievalManager(this.client);
        return manager.retrieveWithFormat({
          query,
          knowledgeBaseIds,
          topK: topK || 5,
        });
      },

      /**
       * 带重排序的检索
       */
      retrieveWithRerank: async (
        query: string,
        knowledgeBaseIds: string[],
        rerankThreshold?: number,
        topK?: number
      ) => {
        const manager = new RetrievalManager(this.client);
        return manager.retrieveWithRerank(
          {
            query,
            knowledgeBaseIds,
            topK: topK || 5,
          },
          rerankThreshold || 0.3
        );
      },

      /**
       * 多轮对话检索
       */
      retrieveWithContext: async (
        query: string,
        knowledgeBaseIds: string[],
        conversationHistory: Array<{
          role: 'user' | 'assistant';
          content: string;
        }>,
        topK?: number
      ) => {
        const manager = new RetrievalManager(this.client);
        return manager.retrieveWithContext(
          query,
          knowledgeBaseIds,
          conversationHistory,
          topK || 5
        );
      },
    };
  }

  // 私有属性
  private client: BailianClient;
}

/**
 * 创建百炼服务实例的便捷函数
 * @param config 配置对象
 * @returns 百炼服务实例
 */
export function createBailianService(config: {
  accessKeyId: string;
  accessKeySecret: string;
  workspaceId: string;
  endpoint?: string;
  regionId?: string;
}): BailianService {
  return new BailianService(config);
}

// 导出客户端私有属性类型
