/**
 * 文件ID提取服务
 * 使用阿里云百炼的 file_id 进行文档分析
 * 避免每次提取都传递完整文档内容，节省 token 和时间
 * 
 * 优化：
 * - 3线程并行提取，提升约67%性能
 * - 流式进度回调，实时展示提取进度
 */

import { getLLMFileService } from './llm-file-service';
import { getLLMFileCacheService } from './llm-file-cache-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { runInPoolWithProgress, TaskOutcome } from '@/lib/utils/task-pool';
import {
  EXTRACT_PROJECT_INFO_PROMPT,
  EXTRACT_PROJECT_BACKGROUND_PROMPT,
  EXTRACT_TIME_SCHEDULE_PROMPT,
  EXTRACT_SCORING_PROMPT,
  EXTRACT_RISKS_PROMPT,
  EXTRACT_BUSINESS_PROMPT,
  EXTRACT_TECH_PROMPT,
  EXTRACT_DOCUMENT_PROMPT,
  EXTRACT_OTHER_INFO_PROMPT,
} from '@/lib/prompts/scoring-extraction';

/**
 * 并发配置
 */
const EXTRACTION_CONCURRENCY = 3; // 3线程并行

/**
 * 提取结果
 */
export interface FileIdExtractionResult {
  projectBasicInfo: any;
  projectBackground: any;
  timeSchedule: any;
  coreTechDemand: any;
  businessRequirements: any;
  scoringStandard: any;
  disqualificationRisks: any[];
  biddingDocumentRequirements: any;
  otherImportantInfo: any;
  extractionMetadata: {
    strategy: 'file_id';
    fileId: string;
    reuploaded: boolean;
    segmentCount: number;
    extractionTimeMs: number;
    parallelMode: boolean;
    successCount: number;
    failCount: number;
  };
}

/**
 * 提取任务定义
 */
interface ExtractionSegment {
  key: string;
  prompt: string;
  name: string;
  isScoring?: boolean;
  isArray?: boolean;
}

/**
 * 文件ID提取服务
 */
export class FileIdExtractionService {
  /**
   * 使用 file_id 进行分段提取（3线程并行）
   * @param projectId 项目ID
   * @param fileId 百炼文件ID（可选，如不存在会自动上传）
   * @param sourceUrl 源文件URL（用于上传）
   * @param filename 文件名
   * @param onProgress 进度回调（支持实时返回每个任务结果）
   */
  async extract(
    projectId: string,
    fileId: string | null,
    sourceUrl: string,
    filename: string,
    onProgress?: (stage: string, progress: number, taskResult?: { key: string; result: any }) => void
  ): Promise<FileIdExtractionResult> {
    const startTime = Date.now();
    const llmFileService = getLLMFileService();

    console.log('[FileIdExtraction] 开始使用 file_id 模式提取（3线程并行）...');
    console.log('[FileIdExtraction] fileId:', fileId || '无，需要上传');

    // 1. 确保文件可用（不存在则自动上传）
    onProgress?.('检查文件', 5);
    
    let currentFileId = fileId;
    let reuploaded = false;

    if (currentFileId) {
      const available = await llmFileService.checkFileAvailable(currentFileId);
      if (!available) {
        console.log('[FileIdExtraction] 文件不可用，重新上传...');
        currentFileId = null;
      }
    }

    if (!currentFileId) {
      onProgress?.('上传文件到AI平台', 10);
      const fileInfo = await llmFileService.uploadFile(sourceUrl, filename);
      currentFileId = fileInfo.id;
      reuploaded = true;
      
      // 更新数据库中的 file_id
      await this.updateProjectFileId(projectId, currentFileId);
    }

    // 2. 定义提取任务
    const segments: ExtractionSegment[] = [
      { key: 'projectBasicInfo', prompt: EXTRACT_PROJECT_INFO_PROMPT, name: '项目基本信息' },
      { key: 'projectBackground', prompt: EXTRACT_PROJECT_BACKGROUND_PROMPT, name: '项目背景' },
      { key: 'timeSchedule', prompt: EXTRACT_TIME_SCHEDULE_PROMPT, name: '时间节点' },
      { key: 'scoringStandard', prompt: EXTRACT_SCORING_PROMPT, name: '评分标准', isScoring: true },
      { key: 'disqualificationRisks', prompt: EXTRACT_RISKS_PROMPT, name: '废标风险', isArray: true },
      { key: 'businessRequirements', prompt: EXTRACT_BUSINESS_PROMPT, name: '商务要求' },
      { key: 'coreTechDemand', prompt: EXTRACT_TECH_PROMPT, name: '核心技术需求' },
      { key: 'biddingDocumentRequirements', prompt: EXTRACT_DOCUMENT_PROMPT, name: '投标文件要求' },
      { key: 'otherImportantInfo', prompt: EXTRACT_OTHER_INFO_PROMPT, name: '其他重要信息' },
    ];

    // 3. 【核心优化】3线程并行提取
    const results: Record<string, any> = {};
    const fileIdRef = currentFileId;
    let successCount = 0;
    let failCount = 0;

    // 创建任务函数数组
    const taskFunctions = segments.map((segment, index) => {
      return async () => {
        console.log(`[FileIdExtraction] 开始提取 ${segment.name} (${index + 1}/${segments.length})`);
        
        const result = await llmFileService.analyzeWithFileId(fileIdRef, segment.prompt);
        
        // 处理结果
        let processedResult: any;
        
        if (segment.isArray && !Array.isArray(result)) {
          processedResult = result?.items || result?.risks || [];
        } else if (segment.isScoring) {
          processedResult = result?.evaluationCriteria ? result : { evaluationCriteria: [] };
          if (!result?.evaluationCriteria && (result?.techScoring || result?.businessScoring)) {
            processedResult = result;
          }
        } else {
          processedResult = result;
        }
        
        console.log(`[FileIdExtraction] ${segment.name} 提取成功`);
        
        return { key: segment.key, result: processedResult, segment };
      };
    });

    // 使用并发池执行，最多3个并发
    const outcomes = await runInPoolWithProgress(
      taskFunctions,
      EXTRACTION_CONCURRENCY,
      (completed, total, currentIndex) => {
        // 计算进度：10-95的区间
        const progress = 10 + Math.round((completed / total) * 85);
        const segment = segments[currentIndex];
        onProgress?.(segment.name, progress);
      }
    );

    // 汇总结果
    for (const outcome of outcomes) {
      if (outcome.success) {
        results[outcome.result.key] = outcome.result.result;
        successCount++;
        
        // 实时回调每个任务结果
        onProgress?.(segments[outcome.index].name, 10 + Math.round(((outcome.index + 1) / segments.length) * 85), {
          key: outcome.result.key,
          result: outcome.result.result,
        });
      } else {
        console.error(`[FileIdExtraction] ${segments[outcome.index].name} 提取失败:`, outcome.error);
        
        // 设置默认值
        const segment = segments[outcome.index];
        if (segment.isArray) {
          results[segment.key] = [];
        } else if (segment.isScoring) {
          results[segment.key] = { evaluationCriteria: [] };
        } else {
          results[segment.key] = {};
        }
        failCount++;
      }
    }

    // 4. 完成提取
    onProgress?.('完成', 100);

    const result: FileIdExtractionResult = {
      ...this.buildResult(results),
      extractionMetadata: {
        strategy: 'file_id',
        fileId: currentFileId!,
        reuploaded,
        segmentCount: segments.length,
        extractionTimeMs: Date.now() - startTime,
        parallelMode: true,
        successCount,
        failCount,
      },
    };

    console.log(`[FileIdExtraction] 提取完成，耗时: ${result.extractionMetadata.extractionTimeMs}ms，成功: ${successCount}，失败: ${failCount}`);

    return result;
  }

  /**
   * 使用缓存的uploadId获取file_id并提取
   * 如果缓存不存在或过期，自动重新上传
   */
  async extractWithCache(
    projectId: string,
    uploadId: string,
    sourceUrl: string,
    filename: string,
    onProgress?: (stage: string, progress: number, taskResult?: { key: string; result: any }) => void
  ): Promise<FileIdExtractionResult> {
    const cacheService = getLLMFileCacheService();
    
    // 获取或上传file_id
    const { llmFileId, fromCache } = await cacheService.getOrUploadFileId(uploadId, sourceUrl, filename);
    
    console.log(`[FileIdExtraction] file_id来源: ${fromCache ? '缓存' : '新上传'}`);
    
    return this.extract(projectId, llmFileId, sourceUrl, filename, onProgress);
  }

  /**
   * 更新项目的 file_id
   */
  private async updateProjectFileId(projectId: string, fileId: string): Promise<void> {
    try {
      const client = getSupabaseClient();
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
                llmFileId: fileId,
                llmFileUploadedAt: new Date().toISOString(),
              },
            },
          })
          .eq('id', projectId);

        console.log(`[FileIdExtraction] 已更新 file_id: ${fileId}`);
      }
    } catch (error) {
      console.error('[FileIdExtraction] 更新 file_id 失败:', error);
    }
  }

  /**
   * 构建结果对象
   */
  private buildResult(results: Record<string, any>): Omit<FileIdExtractionResult, 'extractionMetadata'> {
    return {
      projectBasicInfo: results.projectBasicInfo || {},
      projectBackground: results.projectBackground || {},
      timeSchedule: results.timeSchedule || {},
      coreTechDemand: results.coreTechDemand || {},
      businessRequirements: results.businessRequirements || {},
      scoringStandard: results.scoringStandard || { evaluationCriteria: [] },
      disqualificationRisks: results.disqualificationRisks || [],
      biddingDocumentRequirements: results.biddingDocumentRequirements || {},
      otherImportantInfo: results.otherImportantInfo || {},
    };
  }
}

// 单例实例
let fileIdExtractionServiceInstance: FileIdExtractionService | null = null;

/**
 * 获取文件ID提取服务实例
 */
export function getFileIdExtractionService(): FileIdExtractionService {
  if (!fileIdExtractionServiceInstance) {
    fileIdExtractionServiceInstance = new FileIdExtractionService();
  }
  return fileIdExtractionServiceInstance;
}

/**
 * 创建新的文件ID提取服务实例
 */
export function createFileIdExtractionService(): FileIdExtractionService {
  return new FileIdExtractionService();
}
