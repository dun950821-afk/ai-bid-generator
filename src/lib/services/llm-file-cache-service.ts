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
   * 【核心方法】确保获取有效的file_id
   * 
   * 自动处理以下情况：
   * 1. 有uploadId时，从缓存获取（缓存失效会自动重新上传）
   * 2. 无uploadId时，检查项目metadata中的llmFileId
   * 3. llmFileId失效时，自动重新上传
   * 4. 将新的file_id保存到缓存和项目metadata
   * 
   * @param projectId 项目ID
   * @param documentUrl 文档URL
   * @param documentName 文档名
   * @param uploadId 上传ID（可选）
   * @param storedFileId 项目中存储的file_id（可选）
   * @returns 有效的file_id和来源信息
   */
  async ensureValidFileId(
    projectId: string,
    documentUrl: string,
    documentName: string,
    uploadId?: string,
    storedFileId?: string
  ): Promise<{ 
    llmFileId: string; 
    fromCache: boolean; 
    reuploaded: boolean;
    source: 'cache' | 'stored' | 'new_upload' | 'reupload';
  }> {
    const llmFileService = getLLMFileService();
    
    // ===== 策略1: 使用uploadId从缓存获取 =====
    if (uploadId) {
      const result = await this.getOrUploadFileId(uploadId, documentUrl, documentName);
      const fromCache = result.fromCache;
      
      // 保存到项目metadata（确保项目也能引用）
      await this.saveToProjectMetadata(projectId, result.llmFileId, documentUrl, documentName);
      
      return {
        llmFileId: result.llmFileId,
        fromCache,
        reuploaded: !fromCache,
        source: fromCache ? 'cache' : 'reupload',
      };
    }
    
    // ===== 策略2: 检查项目中存储的file_id =====
    if (storedFileId) {
      console.log(`[LLMFileCache] ========== 策略2: 检查项目存储的file_id ==========`);
      console.log(`[LLMFileCache] storedFileId: ${storedFileId}`);
      
      const available = await llmFileService.checkFileAvailable(storedFileId);
      
      if (available) {
        console.log(`[LLMFileCache] ✅ 使用项目存储的file_id: ${storedFileId}`);
        return {
          llmFileId: storedFileId,
          fromCache: true,
          reuploaded: false,
          source: 'stored',
        };
      }
      
      // ⚠️ 关键日志：file_id 失效
      console.log(`[LLMFileCache] ❌ 项目存储的file_id已失效: ${storedFileId}`);
      console.log(`[LLMFileCache] 失效可能原因: 文件已过期(7天)/百炼平台问题/API错误/额度不足`);
    }
    
    // ===== 策略3: 重新上传文件 =====
    console.log(`[LLMFileCache] 需要重新上传文件: ${documentName}`);
    
    const fileInfo = await llmFileService.uploadFile(documentUrl, documentName);
    const newFileId = fileInfo.id;
    
    // 生成基于项目的uploadId（用于后续缓存查询）
    const projectUploadId = `project-${projectId}`;
    
    // 保存到缓存
    await this.saveFileId(projectUploadId, newFileId, documentName, documentUrl, fileInfo.bytes);
    
    // 保存到项目metadata
    await this.saveToProjectMetadata(projectId, newFileId, documentUrl, documentName);
    
    console.log(`[LLMFileCache] 重新上传完成，新file_id: ${newFileId}`);
    
    return {
      llmFileId: newFileId,
      fromCache: false,
      reuploaded: true,
      source: 'reupload',
    };
  }

  /**
   * 保存file_id到项目metadata
   */
  private async saveToProjectMetadata(
    projectId: string,
    llmFileId: string,
    documentUrl: string,
    documentName: string
  ): Promise<void> {
    try {
      const client = getSupabaseClient();
      
      // 获取当前metadata
      const { data: project } = await client
        .from('projects')
        .select('metadata')
        .eq('id', projectId)
        .single();
      
      if (project) {
        await client
          .from('projects')
          .update({
            metadata: {
              ...project.metadata,
              uploadedDocument: {
                ...project.metadata?.uploadedDocument,
                name: documentName,
                url: documentUrl,
                llmFileId: llmFileId,
                llmFileUploadedAt: new Date().toISOString(),
              },
            },
          })
          .eq('id', projectId);
        
        console.log(`[LLMFileCache] 已保存file_id到项目metadata: ${llmFileId}`);
      }
    } catch (error) {
      console.error('[LLMFileCache] 保存到项目metadata失败:', error);
    }
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
