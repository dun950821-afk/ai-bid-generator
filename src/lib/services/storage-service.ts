/**
 * 文件存储服务
 * 使用 S3 兼容对象存储管理文件
 */

import { S3Storage } from 'coze-coding-dev-sdk';

export interface UploadResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

export interface FileInfo {
  key: string;
  url: string;
  size?: number;
  lastModified?: Date;
}

/**
 * 文件存储服务类
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
   * @param file 文件内容
   * @param fileName 文件名或存储路径
   * @param contentType 内容类型
   * @param skipPrefix 是否跳过自动添加前缀（默认 false）
   */
  async uploadFile(
    file: File | Buffer,
    fileName: string,
    contentType?: string,
    skipPrefix: boolean = false
  ): Promise<UploadResult> {
    try {
      let buffer: Buffer;
      let actualContentType = contentType;

      if (file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer());
        actualContentType = contentType || file.type;
      } else {
        buffer = file;
      }

      // 生成安全的文件名
      const safeFileName = this.sanitizeFileName(fileName);
      
      // 根据参数决定是否添加前缀
      const objectKey = skipPrefix ? safeFileName : `knowledge-docs/${Date.now()}-${safeFileName}`;

      const key = await this.storage.uploadFile({
        fileContent: buffer,
        fileName: objectKey,
        contentType: actualContentType,
      });

      return {
        success: true,
        key,
      };
    } catch (error) {
      console.error('文件上传失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传失败',
      };
    }
  }

  /**
   * 从URL上传文件
   */
  async uploadFromUrl(url: string): Promise<UploadResult> {
    try {
      const key = await this.storage.uploadFromUrl({
        url,
        timeout: 30000,
      });

      return {
        success: true,
        key,
      };
    } catch (error) {
      console.error('URL文件上传失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '从URL上传失败',
      };
    }
  }

  /**
   * 获取文件访问URL
   */
  async getFileUrl(key: string, expireTime: number = 86400): Promise<string> {
    return await this.storage.generatePresignedUrl({
      key,
      expireTime,
    });
  }

  /**
   * 读取文件内容
   */
  async readFile(key: string): Promise<Buffer | null> {
    try {
      return await this.storage.readFile({ fileKey: key });
    } catch (error) {
      console.error('文件读取失败:', error);
      return null;
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      return await this.storage.deleteFile({ fileKey: key });
    } catch (error) {
      console.error('文件删除失败:', error);
      return false;
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      return await this.storage.fileExists({ fileKey: key });
    } catch (error) {
      console.error('文件检查失败:', error);
      return false;
    }
  }

  /**
   * 列出文件
   */
  async listFiles(prefix: string, maxKeys: number = 100): Promise<FileInfo[]> {
    try {
      const result = await this.storage.listFiles({
        prefix,
        maxKeys,
      });

      const files: FileInfo[] = [];
      for (const key of result.keys) {
        const url = await this.getFileUrl(key);
        files.push({
          key,
          url,
        });
      }

      return files;
    } catch (error) {
      console.error('文件列表获取失败:', error);
      return [];
    }
  }

  /**
   * 清理文件名
   * 保留路径分隔符 /，只清理每个路径部分中的不安全字符
   */
  private sanitizeFileName(fileName: string): string {
    // 分割路径，处理每个部分，然后重新组合
    const parts = fileName.split('/');
    const sanitizedParts = parts.map(part => {
      return part
        .replace(/[^\w\u4e00-\u9fa5.-]/g, '_')  // 移除不安全字符（保留字母、数字、下划线、中文、点、横线）
        .replace(/_{2,}/g, '_')  // 合并多个下划线
        .substring(0, 100);  // 限制每部分长度
    });
    const result = sanitizedParts.join('/');
    return result.substring(0, 500);  // 总长度限制
  }
}

/**
 * 创建存储服务实例
 */
export function createStorageService(): StorageService {
  return new StorageService();
}

/**
 * 文件类型工具
 */
export const FileTypes = {
  /**
   * 获取文件MIME类型
   */
  getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      md: 'text/markdown',
      html: 'text/html',
      json: 'application/json',
      xml: 'application/xml',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  },

  /**
   * 检查是否为支持的文档类型
   */
  isSupportedDocument(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext);
  },

  /**
   * 检查是否为图片
   */
  isImage(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  },

  /**
   * 获取文件扩展名
   */
  getExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  },

  /**
   * 格式化文件大小
   */
  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
};
