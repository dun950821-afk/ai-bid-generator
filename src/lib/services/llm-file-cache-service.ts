/**
 * 百炼文件ID缓存服务
 * 用于存储和管理上传到百炼平台的文件ID
 * 支持过期检测和自动重新上传
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getLLMFileService } from './llm-file-service';

export interface LLMFileCacheItem {
  id: string;
  uploadId: string;
  llmFileId: string;
  filename: string;
  fileUrl: string;
  fileSize?: number;
  status: 'ready' | 'expired' | 'error' | 'uploading';
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * 百炼文件缓存服务
 */
export class LLMFileCacheService {
  /** 默认过期时间：7天 */
  private defaultExpireDays = 7;

  /**
   * 保存file_id到缓存
   */
  async saveFileId(
    uploadId: string,
    llmFileId: string,
    filename: string,
    fileUrl: string,
    fileSize?: number
  ): Promise<LLMFileCacheItem> {
    const client = getSupabaseClient();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.defaultExpireDays);

    const { data, error } = await client
      .from('llm_file_cache')
      .upsert({
        upload_id: uploadId,
        llm_file_id: llmFileId,
        filename,
        file_url: fileUrl,
        file_size: fileSize,
        status: 'ready',
        expires_at: expiresAt.toISOString(),
        last_used_at: new Date().toISOString(),
      }, {
        onConflict: 'upload_id',
      })
      .select()
      .single();

    if (error) {
      console.error('[LLMFileCache] 保存失败:', error);
      throw error;
    }

    console.log(`[LLMFileCache] 保存成功: uploadId=${uploadId}, llmFileId=${llmFileId}`);
    
    return this.mapToItem(data);
  }

  /**
   * 获取缓存的file_id
   * @param uploadId 上传ID
   * @param autoValidate 是否自动验证有效性
   * @returns file_id，如果不存在或已过期返回null
   */
  async getFileId(uploadId: string, autoValidate = true): Promise<string | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('llm_file_cache')
      .select('*')
      .eq('upload_id', uploadId)
      .single();

    if (error || !data) {
      console.log(`[LLMFileCache] 未找到缓存: uploadId=${uploadId}`);
      return null;
    }

    // 检查是否过期
    if (new Date(data.expires_at) < new Date()) {
      console.log(`[LLMFileCache] 缓存已过期: uploadId=${uploadId}`);
      await this.updateStatus(uploadId, 'expired');
      return null;
    }

    // 自动验证有效性
    if (autoValidate && data.status === 'ready') {
      const llmFileService = getLLMFileService();
      const available = await llmFileService.checkFileAvailable(data.llm_file_id);
      
      if (!available) {
        console.log(`[LLMFileCache] file_id不可用: llmFileId=${data.llm_file_id}`);
        await this.updateStatus(uploadId, 'expired');
        return null;
      }
    }

    // 更新最后使用时间
    await this.updateLastUsed(uploadId);

    return data.llm_file_id;
  }

  /**
   * 获取或上传file_id
   * 如果缓存存在且有效，直接返回
   * 否则重新上传并缓存
   */
  async getOrUploadFileId(
    uploadId: string,
    fileUrl: string,
    filename: string
  ): Promise<{ llmFileId: string; fromCache: boolean }> {
    // 尝试从缓存获取
    const cachedFileId = await this.getFileId(uploadId);
    
    if (cachedFileId) {
      console.log(`[LLMFileCache] 使用缓存: llmFileId=${cachedFileId}`);
      return { llmFileId: cachedFileId, fromCache: true };
    }

    // 缓存不存在或已过期，重新上传
    console.log(`[LLMFileCache] 重新上传: filename=${filename}`);
    
    const llmFileService = getLLMFileService();
    const fileInfo = await llmFileService.uploadFile(fileUrl, filename);
    
    // 保存到缓存
    await this.saveFileId(uploadId, fileInfo.id, filename, fileUrl, fileInfo.bytes);
    
    return { llmFileId: fileInfo.id, fromCache: false };
  }

  /**
   * 更新状态
   */
  async updateStatus(uploadId: string, status: 'ready' | 'expired' | 'error' | 'uploading'): Promise<void> {
    const client = getSupabaseClient();
    
    await client
      .from('llm_file_cache')
      .update({ status })
      .eq('upload_id', uploadId);
  }

  /**
   * 更新最后使用时间
   */
  async updateLastUsed(uploadId: string): Promise<void> {
    const client = getSupabaseClient();
    
    await client
      .from('llm_file_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('upload_id', uploadId);
  }

  /**
   * 标记为上传中
   */
  async markUploading(uploadId: string): Promise<void> {
    await this.updateStatus(uploadId, 'uploading');
  }

  /**
   * 标记为错误
   */
  async markError(uploadId: string): Promise<void> {
    await this.updateStatus(uploadId, 'error');
  }

  /**
   * 删除缓存
   */
  async deleteCache(uploadId: string): Promise<void> {
    const client = getSupabaseClient();
    
    await client
      .from('llm_file_cache')
      .delete()
      .eq('upload_id', uploadId);
    
    console.log(`[LLMFileCache] 删除缓存: uploadId=${uploadId}`);
  }

  /**
   * 清理过期缓存
   */
  async cleanExpired(): Promise<number> {
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('llm_file_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('[LLMFileCache] 清理过期缓存失败:', error);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`[LLMFileCache] 清理过期缓存: ${count}条`);
    return count;
  }

  /**
   * 获取缓存统计
   */
  async getStats(): Promise<{
    total: number;
    ready: number;
    expired: number;
    error: number;
    uploading: number;
  }> {
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('llm_file_cache')
      .select('status');

    if (error || !data) {
      return { total: 0, ready: 0, expired: 0, error: 0, uploading: 0 };
    }

    return {
      total: data.length,
      ready: data.filter(d => d.status === 'ready').length,
      expired: data.filter(d => d.status === 'expired').length,
      error: data.filter(d => d.status === 'error').length,
      uploading: data.filter(d => d.status === 'uploading').length,
    };
  }

  /**
   * 映射数据库记录到对象
   */
  private mapToItem(data: any): LLMFileCacheItem {
    return {
      id: data.id,
      uploadId: data.upload_id,
      llmFileId: data.llm_file_id,
      filename: data.filename,
      fileUrl: data.file_url,
      fileSize: data.file_size,
      status: data.status,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
      lastUsedAt: new Date(data.last_used_at),
      metadata: data.metadata,
    };
  }
}

// 单例实例
let llmFileCacheServiceInstance: LLMFileCacheService | null = null;

/**
 * 获取缓存服务实例
 */
export function getLLMFileCacheService(): LLMFileCacheService {
  if (!llmFileCacheServiceInstance) {
    llmFileCacheServiceInstance = new LLMFileCacheService();
  }
  return llmFileCacheServiceInstance;
}
