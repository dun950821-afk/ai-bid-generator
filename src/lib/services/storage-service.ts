/**
 * 文件存储服务
 * 封装S3Storage用于文档上传
 */

import { S3Storage } from 'coze-coding-dev-sdk';

/**
 * 存储服务类
 */
export class StorageService {
  private storage: S3Storage;

  constructor() {
    this.storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
  }

  /**
   * 上传文件
   * @param fileContent 文件内容（Buffer）
   * @param fileName 文件名
   * @param contentType 文件类型
   * @returns 文件存储的key
   */
  async uploadFile(
    fileContent: Buffer,
    fileName: string,
    contentType?: string
  ): Promise<string> {
    const key = await this.storage.uploadFile({
      fileContent,
      fileName,
      contentType,
    });
    return key;
  }

  /**
   * 读取文件
   * @param fileKey 文件key
   * @returns 文件内容（Buffer）
   */
  async readFile(fileKey: string): Promise<Buffer> {
    return await this.storage.readFile({ fileKey });
  }

  /**
   * 删除文件
   * @param fileKey 文件key
   */
  async deleteFile(fileKey: string): Promise<boolean> {
    return await this.storage.deleteFile({ fileKey });
  }

  /**
   * 检查文件是否存在
   * @param fileKey 文件key
   */
  async fileExists(fileKey: string): Promise<boolean> {
    return await this.storage.fileExists({ fileKey });
  }

  /**
   * 生成文件访问URL
   * @param fileKey 文件key
   * @param expireTime 有效期（秒），默认1天
   * @returns 签名URL
   */
  async generatePresignedUrl(
    fileKey: string,
    expireTime: number = 86400
  ): Promise<string> {
    return await this.storage.generatePresignedUrl({
      key: fileKey,
      expireTime,
    });
  }

  /**
   * 从URL上传文件
   * @param url 文件URL
   * @param timeout 超时时间（毫秒）
   * @returns 文件存储的key
   */
  async uploadFromUrl(url: string, timeout?: number): Promise<string> {
    return await this.storage.uploadFromUrl({
      url,
      timeout,
    });
  }

  /**
   * 列出文件
   * @param prefix 前缀
   * @param maxKeys 最大数量
   */
  async listFiles(prefix?: string, maxKeys?: number) {
    return await this.storage.listFiles({
      prefix,
      maxKeys,
    });
  }
}

// 单例实例
let storageServiceInstance: StorageService | null = null;

/**
 * 获取存储服务实例
 */
export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
}
