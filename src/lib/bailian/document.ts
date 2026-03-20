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
  BailianDocumentStatus,
  BailianDocument,
  ListDocumentsParams,
  ListDocumentsResult,
  ListFileDetailsParams,
  ListFileDetailsResult,
  FileDetail,
  DocumentPreview,
  DataCenterFile,
  ListDataCenterFilesParams,
  ListDataCenterFilesResult,
} from './types';
import * as $Bailian20231229 from '@alicloud/bailian20231229';
import * as $Util from '@alicloud/tea-util';
import * as $OpenApiUtil from '@alicloud/openapi-util';
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
      sizeInBytes: String(config.fileSize),  // 修复：sizeInBytes 需要是字符串类型
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
   * @description 支持状态过滤、名称搜索、模糊匹配和分页
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindexdocuments
   * @param params 查询参数
   * @returns 文档列表
   */
  async listIndexDocuments(
    params: ListDocumentsParams
  ): Promise<ApiResponse<ListDocumentsResult>> {
    const request = new $Bailian20231229.ListIndexDocumentsRequest({
      indexId: params.indexId,
      pageNumber: params.pageNumber || 1,
      pageSize: params.pageSize || 50,
      // 状态过滤
      documentStatus: params.documentStatus,
      // 名称过滤
      documentName: params.documentName,
      // 模糊匹配
      enableNameLike: params.enableNameLike ? 'true' : 'false',
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

      // 映射文档列表
      const documents: BailianDocument[] = (data?.documents || []).map((doc: any) => ({
        documentId: doc.documentId || doc.id || '',
        documentName: doc.documentName || doc.name || '',
        fileType: doc.fileType,
        sizeInBytes: doc.sizeInBytes || doc.size || 0,
        status: this.mapBailianDocumentStatus(doc.status),
        progress: doc.progress,
        errorMessage: doc.errorMessage || doc.message,
        sourceType: doc.sourceType,
        categoryId: doc.categoryId,
        fileId: doc.fileId,
        tags: doc.tags,
        metadata: doc.metadata,
        gmtCreate: doc.gmtCreate,
        gmtModified: doc.gmtModified,
      }));

      return {
        requestId: body.requestId || '',
        success: true,
        data: {
          documents,
          totalCount: data?.totalCount || 0,
          pageNumber: params.pageNumber || 1,
          pageSize: params.pageSize || 50,
        },
      };
    });
  }

  /**
   * 获取知识库文件详情列表
   * @description 包含分块配置等详细信息
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listindexfiledetails
   * @param params 查询参数
   * @returns 文件详情列表
   */
  async listIndexFileDetails(
    params: ListFileDetailsParams
  ): Promise<ApiResponse<ListFileDetailsResult>> {
    const request = new $Bailian20231229.ListIndexFileDetailsRequest({
      indexId: params.indexId,
      pageNumber: params.pageNumber || 1,
      pageSize: Math.min(params.pageSize || 10, 10), // 最大值10
      // 状态过滤
      documentStatus: params.documentStatus,
      // 名称过滤
      documentName: params.documentName,
      // 模糊匹配
      enableNameLike: params.enableNameLike ? 'true' : 'false',
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .listIndexFileDetailsWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      // 映射文件详情列表
      const documents: FileDetail[] = (data?.documents || []).map((doc: any) => ({
        id: doc.id || '',
        name: doc.name || '',
        documentType: doc.documentType,
        size: doc.size,
        status: this.mapBailianDocumentStatus(doc.status || ''),
        code: doc.code,
        message: doc.message,
        chunkMode: doc.chunkMode,
        chunkSize: doc.chunkSize,
        overlapSize: doc.overlapSize,
        separator: doc.separator,
        enableHeaders: doc.enableHeaders,
        sourceId: doc.sourceId,
        gmtModified: doc.gmtModified,
      }));

      return {
        requestId: body.requestId || '',
        success: body.success ?? true,
        code: body.code,
        message: body.message,
        data: {
          documents,
          indexId: data?.indexId,
          totalCount: data?.totalCount || 0,
          pageNumber: data?.pageNumber || params.pageNumber || 1,
          pageSize: data?.pageSize || params.pageSize || 10,
        },
      };
    });
  }

  /**
   * 获取单个文件详情
   * @param indexId 知识库ID
   * @param documentId 文档ID
   * @returns 文件详情
   */
  async getFileDetail(
    indexId: string,
    documentId: string
  ): Promise<ApiResponse<FileDetail>> {
    // 由于API不支持按ID查询单个文件，需要遍历查找
    // 这里假设文档名称可以作为唯一标识，或者遍历所有文件
    const result = await this.listIndexFileDetails({
      indexId,
      pageSize: 100, // 获取足够多的文件
    });

    if (!result.success || !result.data) {
      return {
        requestId: result.requestId,
        success: false,
        message: result.message || '获取文件详情失败',
      };
    }

    const file = result.data.documents.find(doc => doc.id === documentId);
    if (!file) {
      return {
        requestId: result.requestId,
        success: false,
        message: '文件不存在',
      };
    }

    return {
      requestId: result.requestId,
      success: true,
      data: file,
    };
  }

  /**
   * 映射百炼文档状态
   */
  private mapBailianDocumentStatus(status: string): BailianDocumentStatus {
    const statusMap: Record<string, BailianDocumentStatus> = {
      'INSERT_ERROR': 'INSERT_ERROR',
      'RUNNING': 'RUNNING',
      'DELETED': 'DELETED',
      'FINISH': 'FINISH',
      'PARSING': 'RUNNING',
      'PARSER_SUCCESS': 'FINISH',
      'PARSER_FAILED': 'INSERT_ERROR',
      'INSERTING': 'RUNNING',
      'PENDING': 'RUNNING',
      'COMPLETED': 'FINISH',
      'FAILED': 'INSERT_ERROR',
    };
    return statusMap[status] || 'RUNNING';
  }

  /**
   * 删除知识库中的文档
   * @param indexId 知识库ID
   * @param documentId 文档ID
   * @returns 删除结果
   */
  async deleteIndexDocument(
    indexId: string,
    documentId: string
  ): Promise<ApiResponse<void>> {
    const request = new $Bailian20231229.DeleteIndexDocumentRequest({
      indexId,
      documentId,
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
        success: body.success || false,
        code: body.code,
        message: body.message,
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

  /**
   * 获取文档分块列表
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listchunks
   * @param indexId 知识库ID
   * @param fileId 文件ID（可选，用于筛选特定文件的切片）
   * @param params 分页参数
   * @returns 分块列表
   */
  async listChunks(params: {
    indexId: string;
    fileId?: string;
    pageNum?: number;
    pageSize?: number;
  }): Promise<ApiResponse<{
    chunks: Array<{
      id: string;
      text: string;
      score: number;
      metadata: Record<string, any>;
    }>;
    total: number;
  }>> {
    const request = new $Bailian20231229.ListChunksRequest({
      indexId: params.indexId,
      fileId: params.fileId,
      pageNum: params.pageNum || 1,
      pageSize: params.pageSize || 100,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .listChunksWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      const chunks = (data?.nodes || []).map((node: any) => ({
        id: node.metadata?.nid || node.metadata?._id || '',
        text: node.text || '',
        score: node.score || 0,
        metadata: node.metadata || {},
      }));

      return {
        requestId: body.requestId || '',
        success: body.success ?? true,
        code: body.code,
        message: body.message,
        data: {
          chunks,
          total: data?.total || chunks.length,
        },
      };
    });
  }

  /**
   * 获取文档预览信息
   * @description 获取文档的预览URL，支持PDF、图片等格式
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-getdocumentpreview
   * @param documentId 文档ID
   * @returns 文档预览信息
   */
  async getDocumentPreview(
    documentId: string
  ): Promise<ApiResponse<DocumentPreview>> {
    // 使用 describeFile API 获取文件信息
    // 由于百炼 SDK 暂未提供 getDocumentPreview 方法，这里返回文件的详细信息
    // 实际预览链接可能需要从 parseResultDownloadUrl 获取
    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .describeFileWithOptions(
          this.client.getWorkspaceId(),
          documentId,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      // 如果文件解析完成，返回解析结果下载链接作为预览链接
      // 否则返回基本信息
      const previewUrl = data?.parseResultDownloadUrl || '';
      const fileType = data?.fileType || '';
      
      return {
        requestId: body.requestId || '',
        success: true,
        data: {
          previewType: fileType,
          title: data?.fileName || '',
          uploadTime: data?.createTime || '',
          url: previewUrl,
        },
      };
    });
  }

  /**
   * 获取文件完整信息（包括下载链接）
   * @description 使用 describeFile API 获取文件的完整信息，包括解析结果下载链接
   * @param fileId 文件ID
   * @returns 文件完整信息
   */
  async getFileInfo(fileId: string): Promise<ApiResponse<{
    id: string;
    name: string;
    fileType: string;
    size: number;
    status: string;
    parseResultDownloadUrl?: string;
    createTime?: string;
    parser?: string;
    tags?: string[];
    categoryId?: string;
  }>> {
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
          id: data?.fileId || fileId,
          name: data?.fileName || '',
          fileType: data?.fileType || '',
          size: data?.sizeInBytes || 0,
          status: data?.status || '',
          parseResultDownloadUrl: data?.parseResultDownloadUrl,
          createTime: data?.createTime,
          parser: data?.parser,
          tags: data?.tags,
          categoryId: data?.categoryId,
        },
      };
    });
  }

  /**
   * 更新文件标签
   * @description 更新数据中心文件的标签信息
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-updatefiletag
   * @param fileId 文件ID
   * @param tags 标签列表（最多32个，每个最多32字符）
   * @returns 更新结果
   */
  async updateFileTags(
    fileId: string,
    tags: string[]
  ): Promise<ApiResponse<{ fileId: string }>> {
    const request = new $Bailian20231229.UpdateFileTagRequest({
      tags,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .updateFileTagWithOptions(
          this.client.getWorkspaceId(),
          fileId,
          request,
          {},
          runtime
        );

      const body = response.body!;

      return {
        requestId: body.requestId || '',
        success: body.success ?? true,
        code: body.code,
        message: body.message,
        data: body.data ? { fileId: body.data.fileId || fileId } : undefined,
      };
    });
  }

  /**
   * 获取数据中心文件列表
   * @description 支持按类目、文件名查询，支持标签过滤（客户端过滤）
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-listfile
   * @param params 查询参数
   * @returns 文件列表
   */
  async listDataCenterFiles(
    params: ListDataCenterFilesParams
  ): Promise<ApiResponse<ListDataCenterFilesResult>> {
    const request = new $Bailian20231229.ListFileRequest({
      categoryId: params.categoryId,
      fileName: params.fileName,
      nextToken: params.nextToken,
      maxResults: params.maxResults || 50,
    });

    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .listFileWithOptions(
          this.client.getWorkspaceId(),
          request,
          {},
          runtime
        );

      const body = response.body!;
      const data = body.data;

      // 映射文件列表
      let files: DataCenterFile[] = (data?.fileList || []).map((file: any) => ({
        fileId: file.fileId || '',
        fileName: file.fileName || '',
        fileType: file.fileType,
        sizeInBytes: file.sizeInBytes,
        categoryId: file.categoryId,
        parser: file.parser,
        status: file.status,
        tags: file.tags || [],
        createTime: file.createTime,
      }));

      // 客户端标签过滤
      if (params.tags && params.tags.length > 0) {
        files = files.filter(file => 
          file.tags && params.tags!.some(tag => file.tags!.includes(tag))
        );
      }

      return {
        requestId: body.requestId || '',
        success: body.success ?? true,
        code: body.code,
        message: body.message,
        data: {
          files,
          hasNext: data?.hasNext || false,
          nextToken: data?.nextToken,
          totalCount: data?.totalCount,
          maxResults: data?.maxResults || params.maxResults || 50,
        },
      };
    });
  }

  /**
   * 删除数据中心文件
   * @description 删除数据中心中的文件
   * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-deletefile
   * @param fileId 文件ID
   * @returns 删除结果
   */
  async deleteFile(fileId: string): Promise<ApiResponse<{ fileId: string }>> {
    const runtime = new $Util.RuntimeOptions();

    return this.client.request(async () => {
      const response = await this.client
        .getRawClient()
        .deleteFileWithOptions(
          fileId,
          this.client.getWorkspaceId(),
          {},
          runtime
        );

      const body = response.body!;

      return {
        requestId: body.requestId || '',
        success: body.success ?? true,
        code: body.code,
        message: body.message,
        data: body.data ? { fileId: body.data.fileId || fileId } : undefined,
      };
    });
  }
}
