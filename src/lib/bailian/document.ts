/**
 * 文档上传管理工具类
 * @description 提供文档上传、解析状态查询等功能
 */

import { BailianClient } from './client';
import {
  ParserType,
  FileStatus,
  FileParseStatus,
  ApiResponse,
  FileUploadLease,
} from './types';
import * as $Bailian20231229 from '@alicloud/bailian20231229';
import * as $Util from '@alicloud/tea-util';
import crypto from 'crypto';
import fs from 'fs';
import axios from 'axios';

/**
 * 文件上传选项
 */
export interface FileUploadOptions {
  /** 解析方式 */
  parser?: ParserType;
  /** 类目ID */
  categoryId?: string;
  /** 标签列表 */
  tags?: string[];
}

/**
 * 文档管理器
 */
export class DocumentManager {
  constructor(private client: BailianClient) {}

  /**
   * 上传文件
   * @param filePath 文件路径
   * @param options 上传选项
   * @returns 文件ID
   */
  async uploadFile(
    filePath: string,
    options: FileUploadOptions = {}
  ): Promise<ApiResponse<{ fileId: string }>> {
    try {
      // 1. 读取文件信息
      const fileBuffer = fs.readFileSync(filePath);
      const fileMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
      const fileSize = fs.statSync(filePath).size;
      const fileName = filePath.split('/').pop() || 'document';

      // 2. 申请上传租约
      const leaseResponse = await this.applyUploadLease({
        fileName,
        fileMd5,
        fileSize,
      });

      if (!leaseResponse.success || !leaseResponse.data) {
        return {
          requestId: leaseResponse.requestId,
          success: false,
          message: leaseResponse.message || 'Failed to apply upload lease',
        };
      }

      // 3. 上传文件到预签名URL
      await this.uploadToPresignedUrl(
        leaseResponse.data.preSignedUrl,
        leaseResponse.data.headers,
        fileBuffer
      );

      // 4. 添加文件到类目
      const addFileResponse = await this.addFile({
        leaseId: leaseResponse.data.leaseId,
        parser: options.parser || 'DOCUMENT_UNDERSTANDING_LLM',
        categoryId: options.categoryId,
        tags: options.tags,
      });

      return addFileResponse;
    } catch (error: any) {
      return {
        requestId: '',
        success: false,
        message: `Failed to upload file: ${error.message}`,
      };
    }
  }

  /**
   * 上传Buffer数据
   * @param buffer 文件Buffer
   * @param fileName 文件名
   * @param options 上传选项
   * @returns 文件ID
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    options: FileUploadOptions = {}
  ): Promise<ApiResponse<{ fileId: string }>> {
    try {
      // 1. 计算文件信息
      const fileMd5 = crypto.createHash('md5').update(buffer).digest('hex');
      const fileSize = buffer.length;

      // 2. 申请上传租约
      const leaseResponse = await this.applyUploadLease({
        fileName,
        fileMd5,
        fileSize,
      });

      if (!leaseResponse.success || !leaseResponse.data) {
        return {
          requestId: leaseResponse.requestId,
          success: false,
          message: leaseResponse.message || 'Failed to apply upload lease',
        };
      }

      // 3. 上传文件到预签名URL
      await this.uploadToPresignedUrl(
        leaseResponse.data.preSignedUrl,
        leaseResponse.data.headers,
        buffer
      );

      // 4. 添加文件到类目
      const addFileResponse = await this.addFile({
        leaseId: leaseResponse.data.leaseId,
        parser: options.parser || 'DOCUMENT_UNDERSTANDING_LLM',
        categoryId: options.categoryId,
        tags: options.tags,
      });

      return addFileResponse;
    } catch (error: any) {
      return {
        requestId: '',
        success: false,
        message: `Failed to upload buffer: ${error.message}`,
      };
    }
  }

  /**
   * 申请上传租约
   */
  private async applyUploadLease(config: {
    fileName: string;
    fileMd5: string;
    fileSize: number;
  }): Promise<ApiResponse<FileUploadLease>> {
    const request = new $Bailian20231229.ApplyFileUploadLeaseRequest({
      fileName: config.fileName,
      md5: config.fileMd5,
      sizeInBytes: config.fileSize,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .applyFileUploadLeaseWithOptions(
          '', // CategoryId (空字符串表示不指定类目)
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      return {
        requestId: body.requestId || '',
        success: body.success || false,
        code: body.code,
        message: body.message,
        data: data
          ? {
              leaseId: data.leaseId || '',
              preSignedUrl: data.preSignedUrl || '',
              headers: (data.headers as Record<string, string>) || {},
            }
          : undefined,
      };
    });
  }

  /**
   * 上传文件到预签名URL
   */
  private async uploadToPresignedUrl(
    url: string,
    headers: Record<string, string>,
    fileBuffer: Buffer
  ): Promise<void> {
    const response = await axios.put(url, fileBuffer, {
      headers: {
        'X-bailian-extra': headers['X-bailian-extra'],
        'Content-Type': headers['Content-Type'] || 'application/octet-stream',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    if (response.status !== 200) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }
  }

  /**
   * 添加文件到类目
   */
  private async addFile(config: {
    leaseId: string;
    parser: ParserType;
    categoryId?: string;
    tags?: string[];
  }): Promise<ApiResponse<{ fileId: string }>> {
    const request = new $Bailian20231229.AddFileRequest({
      leaseId: config.leaseId,
      parser: config.parser,
      categoryId: config.categoryId,
      tags: config.tags,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .addFileWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      return {
        requestId: body.requestId || '',
        success: Boolean(body.success),
        code: body.code,
        message: body.message,
        data: data ? { fileId: data.fileId || '' } : undefined,
      };
    });
  }

  /**
   * 查询文件解析状态
   * @param fileId 文件ID
   * @returns 解析状态
   */
  async getFileStatus(fileId: string): Promise<ApiResponse<FileParseStatus>> {
    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .describeFileWithOptions(
          this.client.getWorkspaceId(),
          fileId,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      return {
        requestId: body.requestId || '',
        success: true,
        data: {
          status: this.mapFileStatus(data?.status || ''),
          progress: data?.progress,
          message: data?.message,
        },
      };
    });
  }

  /**
   * 等待文件解析完成
   * @param fileId 文件ID
   * @param timeout 超时时间(毫秒)
   * @param interval 检查间隔(毫秒)
   * @returns 最终状态
   */
  async waitForParsing(
    fileId: string,
    timeout: number = 600000,
    interval: number = 5000
  ): Promise<ApiResponse<FileParseStatus>> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const statusResponse = await this.getFileStatus(fileId);

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
      message: `Timeout waiting for file parsing: ${fileId}`,
    };
  }

  /**
   * 追加文档到知识库
   * @param indexId 知识库ID
   * @param documentIds 文档ID列表
   * @returns 追加结果
   */
  async addToKnowledgeBase(
    indexId: string,
    documentIds: string[]
  ): Promise<ApiResponse<void>> {
    const request = new $Bailian20231229.SubmitIndexAddDocumentsJobRequest({
      indexId,
      documentIds,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .submitIndexAddDocumentsJobWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;

      return {
        requestId: body.requestId || '',
        success: Boolean(body.success),
        code: body.code,
        message: body.message,
      };
    });
  }

  /**
   * 从知识库删除文档
   * @param indexId 知识库ID
   * @param documentIds 文档ID列表
   * @returns 删除结果
   */
  async removeFromKnowledgeBase(
    indexId: string,
    documentIds: string[]
  ): Promise<ApiResponse<void>> {
    const request = new $Bailian20231229.DeleteIndexDocumentRequest({
      indexId,
      documentIds,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .deleteIndexDocumentWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;

      return {
        requestId: body.requestId || '',
        success: Boolean(body.success),
        code: body.code,
        message: body.message,
      };
    });
  }

  /**
   * 获取知识库中的文档列表
   * @param indexId 知识库ID
   * @param params 分页参数
   * @returns 文档列表
   */
  async listIndexDocuments(
    indexId: string,
    params: { pageNumber?: number; pageSize?: number } = {}
  ): Promise<ApiResponse<{
    items: Array<{
      id: string;
      name: string;
      fileType: string;
      size: number;
      status: string;
      createdAt: Date;
    }>;
    totalCount: number;
  }>> {
    const request = new $Bailian20231229.ListIndexDocumentsRequest({
      indexId,
      pageNumber: params.pageNumber || 1,
      pageSize: params.pageSize || 50,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .listIndexDocumentsWithOptions(
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
          items: (data?.documents || []).map((doc: any) => ({
            id: doc.documentId || doc.id || '',
            name: doc.documentName || doc.name || '',
            fileType: doc.fileType || 'unknown',
            size: doc.size || 0,
            status: doc.status || 'UNKNOWN',
            createdAt: new Date(doc.gmtCreate || Date.now()),
          })),
          totalCount: data?.totalCount || 0,
        },
      };
    });
  }

  /**
   * 映射文件状态
   */
  private mapFileStatus(status: string): FileStatus {
    const statusMap: Record<string, FileStatus> = {
      PARSING: 'parsing',
      COMPLETED: 'completed',
      FAILED: 'failed',
      PENDING: 'parsing',
    };
    return statusMap[status] || 'parsing';
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
