/**
 * 文件ID提取服务
 * 使用阿里云百炼的 document-extractor 进行文档分析
 * 
 * 流程：
 * 1. 上传文件获取 file_id（或使用已有的）
 * 2. 调用 document-extractor 提取文档全文
 * 3. 分段调用LLM提取各类信息
 * 
 * 优化：
 * - 只调用一次document-extractor，避免重复提取
 * - 3线程并行LLM调用，提升约67%性能
 * - 流式进度回调，实时展示提取进度
 */

import { getLLMFileService } from './llm-file-service';
import { getLLMFileCacheService } from './llm-file-cache-service';
import { getDocumentCacheService } from './document-cache-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createModel } from '@/lib/llm';
import { parseJSON } from '@/lib/utils/json-parser';
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
    cacheHit: boolean;  // 是否命中缓存
    segmentCount: number;
    extractionTimeMs: number;
    parallelMode: boolean;
    successCount: number;
    failCount: number;
    docTextLength: number;
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
   * 使用 file_id 进行分段提取
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

    console.log('[FileIdExtraction] 开始提取（使用document-extractor方案）...');
    console.log('[FileIdExtraction] fileId:', fileId || '无，需要上传');

    const cacheService = getDocumentCacheService();
    let currentFileId = fileId;
    let reuploaded = false;
    let cacheHit = false;  // 缓存命中标记

    // ========== 1. 优先从缓存读取 ==========
    onProgress?.('检查缓存', 3);
    const cached = await cacheService.getDocumentText(projectId);
    
    let docText: string | null = cached?.text || null;
    
    if (docText) {
      cacheHit = true;  // 标记缓存命中
      console.log(`[FileIdExtraction] 缓存命中，跳过文档提取，文本长度: ${docText.length}`);
      onProgress?.('读取缓存文档', 10);
    } else {
      // ========== 2. 缓存未命中，走正常提取流程 ==========
      console.log('[FileIdExtraction] 缓存未命中，开始提取');
      
      // 2.1 确保文件有效
      onProgress?.('检查文件', 5);
      
      if (currentFileId) {
        const available = await llmFileService.checkFileAvailable(currentFileId);
        if (!available) {
          console.log('[FileIdExtraction] 文件不可用，需要重新上传');
          currentFileId = null;
        }
      }

      // 2.2 需要上传文件
      if (!currentFileId) {
        onProgress?.('上传文件到AI平台', 7);
        const fileInfo = await llmFileService.uploadFile(sourceUrl, filename);
        currentFileId = fileInfo.id;
        reuploaded = true;
        
        // 更新数据库中的 file_id
        await this.updateProjectFileId(projectId, currentFileId);
      }

      // 2.3 调用 document-extractor 提取全文
      onProgress?.('提取文档文本', 10);
      
      try {
        docText = await llmFileService.extractDocumentText(currentFileId);
        console.log(`[FileIdExtraction] 文档文本提取成功，长度: ${docText.length}`);
        
        // 【关键】成功后立即缓存
        await cacheService.setDocumentText(projectId, docText, currentFileId);
        
      } catch (extractError: any) {
        // ========== 3. 404自动恢复 ==========
        const errorMsg = extractError.message || '';
        
        if (errorMsg.includes('404')) {
          console.log('[FileIdExtraction] 404错误，文件已失效，重新上传');
          
          // 清除无效的 file_id
          await this.clearProjectFileId(projectId);
          
          // 重新上传
          onProgress?.('重新上传文件', 8);
          const fileInfo = await llmFileService.uploadFile(sourceUrl, filename);
          currentFileId = fileInfo.id;
          reuploaded = true;
          
          // 再次提取
          onProgress?.('重新提取文档', 10);
          docText = await llmFileService.extractDocumentText(currentFileId);
          
          // 更新并缓存
          await this.updateProjectFileId(projectId, currentFileId);
          await cacheService.setDocumentText(projectId, docText, currentFileId);
          
          console.log(`[FileIdExtraction] 重新提取成功，长度: ${docText.length}`);
        } else {
          console.error('[FileIdExtraction] 文档文本提取失败:', extractError);
          throw new Error('文档文本提取失败，请检查文件格式是否正确');
        }
      }
    }

    if (!docText || docText.trim().length === 0) {
      throw new Error('文档内容为空');
    }

    onProgress?.('文档准备完成', 15);

    // ========== 4. 定义提取任务 ==========
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

    // 4. 3线程并行提取（每个任务都使用相同的文档文本）
    const results: Record<string, any> = {};
    let successCount = 0;
    let failCount = 0;

    // 创建LLM实例
    const llm = createModel({
      enableThinking: false,
      temperature: 0.3,
      maxTokens: 16384,
    });

    // 创建任务函数数组
    const taskFunctions = segments.map((segment, index) => {
      return async () => {
        console.log(`[FileIdExtraction] 开始提取 ${segment.name} (${index + 1}/${segments.length})`);
        
        // 构建 prompt：将文档内容注入
        const prompt = segment.prompt.replace('{documentContent}', docText);
        
        // 调用LLM
        const response = await llm.invokeStreaming(prompt);
        
        // 解析JSON
        const parseResult = parseJSON(response, { allowTruncated: true, verbose: true });
        
        if (!parseResult.success) {
          console.error(`[FileIdExtraction] ${segment.name} JSON解析失败`);
          return { 
            key: segment.key, 
            result: this.getDefaultValue(segment.key), 
            segment,
            parseError: true 
          };
        }

        let result = parseResult.data;
        
        // 处理结果
        if (segment.isArray && !Array.isArray(result)) {
          result = result?.items || result?.risks || [];
        } else if (segment.isScoring) {
          if (!result?.evaluationCriteria && (result?.techScoring || result?.businessScoring)) {
            result = this.transformScoringFormat(result);
          } else if (!result?.evaluationCriteria) {
            result = { evaluationCriteria: [] };
          }
        }
        
        console.log(`[FileIdExtraction] ${segment.name} 提取成功`);
        
        return { key: segment.key, result, segment };
      };
    });

    // 使用并发池执行，最多3个并发
    const outcomes = await runInPoolWithProgress(
      taskFunctions,
      EXTRACTION_CONCURRENCY,
      (completed, total, currentIndex) => {
        // 计算进度：15-95的区间
        const progress = 15 + Math.round((completed / total) * 80);
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
        onProgress?.(segments[outcome.index].name, 15 + Math.round(((outcome.index + 1) / segments.length) * 80), {
          key: outcome.result.key,
          result: outcome.result.result,
        });
      } else {
        console.error(`[FileIdExtraction] ${segments[outcome.index].name} 提取失败:`, outcome.error);
        const segment = segments[outcome.index];
        results[segment.key] = this.getDefaultValue(segment.key);
        failCount++;
      }
    }

    // 5. 完成提取
    onProgress?.('完成', 100);

    const result: FileIdExtractionResult = {
      ...this.buildResult(results),
      extractionMetadata: {
        strategy: 'file_id',
        fileId: currentFileId || 'cached',
        reuploaded,
        cacheHit,
        segmentCount: segments.length,
        extractionTimeMs: Date.now() - startTime,
        parallelMode: true,
        successCount,
        failCount,
        docTextLength: docText.length,
      },
    };

    console.log(`[FileIdExtraction] 提取完成，耗时: ${result.extractionMetadata.extractionTimeMs}ms，缓存命中: ${cacheHit}，成功: ${successCount}，失败: ${failCount}`);

    return result;
  }

  /**
   * 获取默认值
   */
  private getDefaultValue(key: string): any {
    const defaults: Record<string, any> = {
      projectBasicInfo: {},
      projectBackground: {},
      timeSchedule: {},
      coreTechDemand: {},
      businessRequirements: {},
      scoringStandard: { evaluationCriteria: [] },
      disqualificationRisks: [],
      biddingDocumentRequirements: {},
      otherImportantInfo: {},
    };
    return defaults[key] || {};
  }

  /**
   * 转换评分格式
   */
  private transformScoringFormat(data: any): any {
    const evaluationCriteria: any[] = [];
    
    const techScoring = data.techScoring || data.tech_scoring || {};
    const businessScoring = data.businessScoring || data.business_scoring || {};
    const priceScoring = data.priceScoring || data.price_scoring || {};
    
    const techItems = techScoring.scoringItems || techScoring.scoring_items || [];
    if (techItems.length > 0) {
      evaluationCriteria.push({
        seq: 1,
        category: techScoring.categoryName || '技术评分',
        totalScore: techScoring.totalScore || 0,
        categoryType: 'technical',
        items: techItems.map((item: any) => ({
          subItem: item.itemName || item.item_name || '',
          itemScore: item.maxScore || item.max_score || 0,
          rule: Array.isArray(item.scoreDetails) ? item.scoreDetails.join('\n') : (item.rule || ''),
          basis: item.basis || '',
        })),
      });
    }
    
    const businessItems = businessScoring.scoringItems || businessScoring.scoring_items || [];
    if (businessItems.length > 0) {
      evaluationCriteria.push({
        seq: evaluationCriteria.length + 1,
        category: businessScoring.categoryName || '商务评分',
        totalScore: businessScoring.totalScore || 0,
        categoryType: 'business',
        items: businessItems.map((item: any) => ({
          subItem: item.itemName || item.item_name || '',
          itemScore: item.maxScore || item.max_score || 0,
          rule: Array.isArray(item.scoreDetails) ? item.scoreDetails.join('\n') : (item.rule || ''),
          basis: item.basis || '',
        })),
      });
    }
    
    if (priceScoring.totalScore || priceScoring.scoringMethod) {
      evaluationCriteria.push({
        seq: evaluationCriteria.length + 1,
        category: '价格评分',
        totalScore: priceScoring.totalScore || 0,
        categoryType: 'price',
        items: [{
          subItem: '价格得分',
          itemScore: priceScoring.totalScore || 0,
          rule: priceScoring.scoringMethod || '',
        }],
      });
    }
    
    return { evaluationCriteria };
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
   * 清除项目的 file_id（文件失效时）
   */
  private async clearProjectFileId(projectId: string): Promise<void> {
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
                llmFileId: null,
                llmFileUploadedAt: null,
              },
            },
          })
          .eq('id', projectId);

        console.log(`[FileIdExtraction] 已清除 file_id`);
      }
    } catch (error) {
      console.error('[FileIdExtraction] 清除 file_id 失败:', error);
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
