/**
 * 分段提取服务
 * 将大型招标文档提取任务拆分成多个小任务，避免LLM响应截断
 */

import { LLMService, createModel } from '@/lib/llm';
import {
  EXTRACT_PROJECT_INFO_PROMPT,
  EXTRACT_TIME_SCHEDULE_PROMPT,
  EXTRACT_SCORING_PROMPT,
  EXTRACT_RISKS_PROMPT,
  EXTRACT_BUSINESS_PROMPT,
  EXTRACT_TECH_PROMPT,
  EXTRACT_DOCUMENT_PROMPT,
  SCORING_EXTRACTION_PROMPT,
} from '@/lib/prompts/scoring-extraction';

/**
 * 提取结果
 */
export interface SegmentedExtractionResult {
  projectBasicInfo: any;
  timeSchedule: any;
  coreTechDemand: any;
  businessRequirements: any;
  scoringStandard: any;
  disqualificationRisks: any[];
  biddingDocumentRequirements: any;
  projectBackground: any;
  otherImportantInfo: any;
  extractionMetadata: {
    strategy: 'single' | 'streaming' | 'segmented';
    segmentCount: number;
    totalTokens: number;
    extractionTimeMs: number;
  };
}

/**
 * 分段提取服务类
 */
export class SegmentedExtractionService {
  private llm: LLMService;
  private enableStreaming: boolean = true;

  constructor() {
    // 禁用思考模式，确保返回纯JSON
    this.llm = createModel({ enableThinking: false, temperature: 0.3 });
  }

  /**
   * 智能提取：自动选择最佳策略
   * @param documentContent 文档内容
   * @param onProgress 进度回调
   */
  async extract(
    documentContent: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<SegmentedExtractionResult> {
    const startTime = Date.now();
    
    // 估算文档复杂度
    const complexity = this.estimateComplexity(documentContent);
    console.log('[SegmentedExtraction] 文档复杂度评估:', complexity);

    let result: SegmentedExtractionResult;
    let strategy: 'single' | 'streaming' | 'segmented';

    if (complexity === 'simple') {
      // 简单文档：单次提取
      strategy = 'single';
      onProgress?.('单次提取', 0);
      result = await this.extractSingle(documentContent);
      onProgress?.('完成', 100);
    } else if (complexity === 'medium') {
      // 中等复杂度：流式提取
      strategy = 'streaming';
      onProgress?.('流式提取', 0);
      result = await this.extractStreaming(documentContent, onProgress);
      onProgress?.('完成', 100);
    } else {
      // 复杂文档：分段提取
      strategy = 'segmented';
      result = await this.extractSegmented(documentContent, onProgress);
      onProgress?.('完成', 100);
    }

    result.extractionMetadata = {
      strategy,
      segmentCount: strategy === 'segmented' ? 6 : 1,
      totalTokens: 0, // TODO: 从API响应获取
      extractionTimeMs: Date.now() - startTime,
    };

    return result;
  }

  /**
   * 估算文档复杂度
   */
  private estimateComplexity(content: string): 'simple' | 'medium' | 'complex' {
    const length = content.length;
    
    // 基于长度估算
    if (length < 20000) {
      return 'simple';
    } else if (length < 100000) {
      return 'medium';
    }
    
    return 'complex';
  }

  /**
   * 单次提取（适用于简单文档）
   */
  private async extractSingle(documentContent: string): Promise<SegmentedExtractionResult> {
    const prompt = SCORING_EXTRACTION_PROMPT.replace('{documentContent}', documentContent);
    const response = await this.llm.invokeStreaming(prompt);
    const data = this.parseJSON(response);
    
    return this.buildResult(data);
  }

  /**
   * 流式提取（适用于中等复杂度文档）
   */
  private async extractStreaming(
    documentContent: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<SegmentedExtractionResult> {
    onProgress?.('准备提取', 10);
    
    const prompt = SCORING_EXTRACTION_PROMPT.replace('{documentContent}', documentContent);
    const response = await this.llm.invokeStreaming(prompt);
    onProgress?.('解析结果', 90);
    
    const data = this.parseJSON(response);
    
    return this.buildResult(data);
  }

  /**
   * 分段提取（适用于复杂文档）
   * 将提取任务拆分成6个独立子任务
   */
  private async extractSegmented(
    documentContent: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<SegmentedExtractionResult> {
    const segments = [
      { key: 'projectBasicInfo', prompt: EXTRACT_PROJECT_INFO_PROMPT, name: '项目基本信息' },
      { key: 'timeSchedule', prompt: EXTRACT_TIME_SCHEDULE_PROMPT, name: '时间节点' },
      { key: 'scoringStandard', prompt: EXTRACT_SCORING_PROMPT, name: '评分标准', isScoring: true },
      { key: 'disqualificationRisks', prompt: EXTRACT_RISKS_PROMPT, name: '废标风险' },
      { key: 'businessRequirements', prompt: EXTRACT_BUSINESS_PROMPT, name: '商务要求' },
      { key: 'coreTechDemand', prompt: EXTRACT_TECH_PROMPT, name: '技术需求' },
    ];

    const results: Record<string, any> = {};
    const totalSegments = segments.length;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const progress = Math.round((i / totalSegments) * 80) + 10;
      
      onProgress?.(`提取${segment.name}`, progress);
      console.log(`[SegmentedExtraction] 提取 ${segment.name}...`);

      try {
        const prompt = segment.prompt.replace('{documentContent}', documentContent);
        const response = await this.llm.invokeStreaming(prompt);
        const parsed = this.parseJSON(response);
        
        // 特殊处理评分标准：EXTRACT_SCORING_PROMPT 返回 { evaluationCriteria: [...] }
        // 需要包装成 { scoringStandard: { evaluationCriteria: [...] } }
        if (segment.isScoring && parsed?.evaluationCriteria) {
          results[segment.key] = { evaluationCriteria: parsed.evaluationCriteria };
          console.log(`[SegmentedExtraction] 评分标准提取完成，共 ${parsed.evaluationCriteria.length} 个大类`);
        } else {
          results[segment.key] = parsed;
        }
        
        console.log(`[SegmentedExtraction] ${segment.name} 提取完成`);
      } catch (error) {
        console.error(`[SegmentedExtraction] ${segment.name} 提取失败:`, error);
        results[segment.key] = this.getDefaultValue(segment.key);
      }
    }

    // 合并结果
    return this.buildResult(results);
  }

  /**
   * 解析JSON
   */
  private parseJSON(content: string): any {
    try {
      // 尝试直接解析
      return JSON.parse(content);
    } catch (e) {
      // 尝试提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error('[SegmentedExtraction] JSON解析失败');
          return null;
        }
      }
      return null;
    }
  }

  /**
   * 获取默认值
   */
  private getDefaultValue(key: string): any {
    const defaults: Record<string, any> = {
      projectBasicInfo: {},
      timeSchedule: {},
      coreTechDemand: { systemUpgradeDemands: [], technicalParameters: [] },
      businessRequirements: { bidderQualification: {} },
      scoringStandard: { evaluationCriteria: [] },
      disqualificationRisks: [],
      biddingDocumentRequirements: {},
      projectBackground: {},
      otherImportantInfo: {},
    };
    return defaults[key] || {};
  }

  /**
   * 构建结果
   */
  private buildResult(data: any): SegmentedExtractionResult {
    // 处理评分标准：确保使用统一的 evaluationCriteria 格式
    let scoringStandard = data?.scoringStandard || data?.scoring_standard || {};
    
    // 如果有 evaluationCriteria，保持原样
    // 如果是旧格式（techScoring/businessScoring），需要转换
    if (!scoringStandard.evaluationCriteria) {
      const techScoring = scoringStandard.techScoring || scoringStandard.tech_scoring || {};
      const businessScoring = scoringStandard.businessScoring || scoringStandard.business_scoring || {};
      const priceScoring = scoringStandard.priceScoring || scoringStandard.price_scoring || {};
      
      const evaluationCriteria: any[] = [];
      
      // 转换技术评分
      const techItems = techScoring.scoringItems || techScoring.scoring_items || [];
      if (techItems.length > 0) {
        evaluationCriteria.push({
          seq: 1,
          category: techScoring.categoryName || '技术评分',
          totalScore: techScoring.totalScore || techScoring.total_score || 0,
          categoryType: 'technical',
          items: techItems.map((item: any) => ({
            subItem: item.itemName || item.item_name || '',
            itemScore: item.maxScore || item.max_score || 0,
            rule: Array.isArray(item.scoreDetails || item.score_details) 
              ? (item.scoreDetails || item.score_details).join('\n') 
              : (item.rule || ''),
            basis: item.basis || '',
            techDocRef: item.techDocRef || item.tech_doc_ref || null,
          })),
        });
      }
      
      // 转换商务评分
      const businessItems = businessScoring.scoringItems || businessScoring.scoring_items || [];
      if (businessItems.length > 0) {
        evaluationCriteria.push({
          seq: evaluationCriteria.length + 1,
          category: businessScoring.categoryName || '商务评分',
          totalScore: businessScoring.totalScore || businessScoring.total_score || 0,
          categoryType: 'business',
          items: businessItems.map((item: any) => ({
            subItem: item.itemName || item.item_name || '',
            itemScore: item.maxScore || item.max_score || 0,
            rule: Array.isArray(item.scoreDetails || item.score_details) 
              ? (item.scoreDetails || item.score_details).join('\n') 
              : (item.rule || ''),
            basis: item.basis || '',
            techDocRef: item.techDocRef || item.tech_doc_ref || null,
          })),
        });
      }
      
      // 转换价格评分
      if (priceScoring.totalScore || priceScoring.total_score || priceScoring.scoringMethod || priceScoring.scoring_method) {
        evaluationCriteria.push({
          seq: evaluationCriteria.length + 1,
          category: '价格评分',
          totalScore: priceScoring.totalScore || priceScoring.total_score || 0,
          categoryType: 'price',
          items: [{
            subItem: '价格得分',
            itemScore: priceScoring.totalScore || priceScoring.total_score || 0,
            rule: priceScoring.scoringMethod || priceScoring.scoring_method || '',
            basis: '',
            techDocRef: null,
          }],
        });
      }
      
      if (evaluationCriteria.length > 0) {
        scoringStandard = { evaluationCriteria };
      }
    }
    
    return {
      projectBasicInfo: data?.projectBasicInfo || data?.project_basic_info || {},
      timeSchedule: data?.timeSchedule || data?.time_schedule || {},
      coreTechDemand: data?.coreTechDemand || data?.core_tech_demand || {},
      businessRequirements: data?.businessRequirements || data?.business_requirements || {},
      scoringStandard,
      disqualificationRisks: data?.disqualificationRisks || data?.disqualification_risks || [],
      biddingDocumentRequirements: data?.biddingDocumentRequirements || data?.bidding_document_requirements || {},
      projectBackground: data?.projectBackground || data?.project_background || {},
      otherImportantInfo: data?.otherImportantInfo || data?.other_important_info || {},
      extractionMetadata: {
        strategy: 'single',
        segmentCount: 1,
        totalTokens: 0,
        extractionTimeMs: 0,
      },
    };
  }
}

/**
 * 创建分段提取服务实例
 */
export function createSegmentedExtractionService(): SegmentedExtractionService {
  return new SegmentedExtractionService();
}
