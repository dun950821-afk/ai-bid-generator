/**
 * 文档全文缓存服务
 * 
 * 核心原则：
 * 1. 全文只提取一次，后续从缓存读取
 * 2. 避免重复调用 document-extractor
 * 3. 减少计费、避免404、提升速度
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface DocumentCache {
  id: string;
  project_id: string;
  content: string;
  content_length: number;
  file_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 文档缓存服务
 */
export class DocumentCacheService {
  private client = getSupabaseClient();

  /**
   * 获取缓存的文档全文
   * @param projectId 项目ID
   * @returns 全文内容，null表示无缓存
   */
  async getDocumentText(projectId: string): Promise<{ text: string; fileId: string | null } | null> {
    try {
      const { data, error } = await this.client
        .from('document_cache')
        .select('content, file_id')
        .eq('project_id', projectId)
        .single();

      if (error || !data) {
        return null;
      }

      console.log(`[DocumentCache] 命中缓存, 文本长度: ${data.content.length}`);
      return { 
        text: data.content, 
        fileId: data.file_id 
      };
    } catch (error) {
      console.error('[DocumentCache] 读取缓存失败:', error);
      return null;
    }
  }

  /**
   * 缓存文档全文
   * @param projectId 项目ID
   * @param text 文档全文
   * @param fileId 文件ID（可选）
   */
  async setDocumentText(projectId: string, text: string, fileId?: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('document_cache')
        .upsert({
          project_id: projectId,
          content: text,
          content_length: text.length,
          file_id: fileId || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'project_id',
        });

      if (error) {
        console.error('[DocumentCache] 写入缓存失败:', error);
        throw error;
      }

      console.log(`[DocumentCache] 全文已缓存, 文本长度: ${text.length}`);
    } catch (error) {
      console.error('[DocumentCache] 缓存写入异常:', error);
    }
  }

  /**
   * 清除缓存（文件更新时）
   * @param projectId 项目ID
   */
  async clearCache(projectId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('document_cache')
        .delete()
        .eq('project_id', projectId);

      if (error) {
        console.error('[DocumentCache] 清除缓存失败:', error);
      } else {
        console.log(`[DocumentCache] 缓存已清除, projectId: ${projectId}`);
      }
    } catch (error) {
      console.error('[DocumentCache] 清除缓存异常:', error);
    }
  }

  /**
   * 检查缓存是否存在
   */
  async hasCache(projectId: string): Promise<boolean> {
    try {
      const { data } = await this.client
        .from('document_cache')
        .select('id')
        .eq('project_id', projectId)
        .single();

      return !!data;
    } catch {
      return false;
    }
  }
}

// 单例
let documentCacheService: DocumentCacheService | null = null;

export function getDocumentCacheService(): DocumentCacheService {
  if (!documentCacheService) {
    documentCacheService = new DocumentCacheService();
  }
  return documentCacheService;
}
