/**
 * 分段提取服务
 * 将大型招标文档提取任务拆分成多个小任务，避免LLM响应截断
 */

import { LLMService, createModel } from '@/lib/llm';
import { parseJSON, parseJSONAsync } from '@/lib/utils/json-parser';
import { parseDelimiterRisks, parseHybridScoringCriteria } from '@/lib/utils/delimiter-parser';
import { withRetry, withTimeout, rateLimiters } from '@/lib/utils/retry-utils';
import { EXTRACTION_CONFIG } from '@/lib/config/llm-config';
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
  SCORING_MINER_PROMPT,
  SCORING_ASSEMBLER_PROMPT,
} from '@/lib/prompts/scoring-extraction';

/**
 * 提取分段项类型定义
 */
export interface ExtractionSegment {
  key: string;
  prompt: string;
  name: string;
  isScoring?: boolean;
  isArray?: boolean;
  useDelimiter?: boolean;
}

/**
 * 提取分段定义
 * 包含所有可提取的分段信息
 */
export const EXTRACTION_SEGMENTS: ExtractionSegment[] = [
  { key: 'projectBasicInfo', prompt: EXTRACT_PROJECT_INFO_PROMPT, name: '项目基本信息' },
  { key: 'projectBackground', prompt: EXTRACT_PROJECT_BACKGROUND_PROMPT, name: '项目背景' },
  { key: 'timeSchedule', prompt: EXTRACT_TIME_SCHEDULE_PROMPT, name: '时间节点' },
  { key: 'scoringStandard', prompt: EXTRACT_SCORING_PROMPT, name: '评分标准', isScoring: true },
  { key: 'disqualificationRisks', prompt: EXTRACT_RISKS_PROMPT, name: '废标风险', isArray: true, useDelimiter: true },
  { key: 'businessRequirements', prompt: EXTRACT_BUSINESS_PROMPT, name: '商务要求' },
  { key: 'coreTechDemand', prompt: EXTRACT_TECH_PROMPT, name: '技术需求' },
  { key: 'biddingDocumentRequirements', prompt: EXTRACT_DOCUMENT_PROMPT, name: '投标文件要求' },
  { key: 'otherImportantInfo', prompt: EXTRACT_OTHER_INFO_PROMPT, name: '其他重要信息' },
];

/**
 * 提取分段类型
 */
export type ExtractionSegmentKey = typeof EXTRACTION_SEGMENTS[number]['key'];

/**
 * 提取结果
 */
export interface SegmentedExtractionResult {
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
    strategy: 'segmented';
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

  constructor() {
    // 禁用思考模式，确保返回纯JSON
    // 设置足够大的maxTokens避免响应被截断（最大支持64K）
    this.llm = createModel({ 
      enableThinking: false, 
      temperature: 0.3,
      maxTokens: 65536  // 增大到64K，确保大型文档不会截断
    });
  }

  /**
   * 分段提取
   * @param documentContent 文档内容
   * @param onProgress 进度回调
   */
  async extract(
    documentContent: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<SegmentedExtractionResult> {
    const startTime = Date.now();
    console.log('[SegmentedExtraction] 开始分段提取...');

    const result = await this.extractSegmented(documentContent, onProgress);
    onProgress?.('完成', 100);

    result.extractionMetadata = {
      strategy: 'segmented',
      segmentCount: 9,
      totalTokens: 0,
      extractionTimeMs: Date.now() - startTime,
    };

    return result;
  }

  /**
   * 分段提取（适用于复杂文档）
   * 将提取任务拆分成9个独立子任务
   */
  private async extractSegmented(
    documentContent: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<SegmentedExtractionResult> {
    // 检查文档内容是否有效
    if (!documentContent || documentContent.trim().length === 0) {
      console.error('[SegmentedExtraction] 文档内容为空！');
      return this.buildResult({});
    }
    
    console.log('[SegmentedExtraction] 文档内容长度:', documentContent.length);
    console.log('[SegmentedExtraction] 文档内容前500字符:', documentContent.substring(0, 500));
    
    // 执行所有分段提取
    const results = await this.extractAllSegments(documentContent, onProgress);

    // 合并结果
    return this.buildResult(results);
  }

  /**
   * 提取所有分段
   */
  private async extractAllSegments(
    documentContent: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<Record<string, any>> {
    const totalSegments = EXTRACTION_SEGMENTS.length;
    const results: Record<string, any> = {};

    for (let i = 0; i < EXTRACTION_SEGMENTS.length; i++) {
      const segment = EXTRACTION_SEGMENTS[i];
      const progress = Math.round((i / totalSegments) * 80) + 10;
      
      onProgress?.(`提取${segment.name}`, progress);
      results[segment.key] = await this.extractSingleSegment(segment, documentContent);
    }

    return results;
  }

  /**
   * 提取单个分段（公开方法，支持单独重试）
   * @param segmentKey 分段键名，如 'scoringStandard', 'projectBasicInfo' 等
   * @param documentContent 文档内容
   * @returns 提取结果
   */
  async extractSegmentByKey(segmentKey: string, documentContent: string): Promise<{
    key: string;
    name: string;
    data: any;
    success: boolean;
    error?: string;
  }> {
    const segment = EXTRACTION_SEGMENTS.find(s => s.key === segmentKey);
    
    if (!segment) {
      return {
        key: segmentKey,
        name: segmentKey,
        data: null,
        success: false,
        error: `未知的分段: ${segmentKey}`
      };
    }

    console.log(`[SegmentedExtraction] 单独提取 ${segment.name}...`);
    
    try {
      const data = await this.extractSingleSegment(segment, documentContent);
      return {
        key: segment.key,
        name: segment.name,
        data,
        success: true
      };
    } catch (error: any) {
      console.error(`[SegmentedExtraction] ${segment.name} 提取失败:`, error);
      return {
        key: segment.key,
        name: segment.name,
        data: this.getDefaultValue(segment.key),
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * 两步法评分标准提取（挖掘者 + 装配工模式）
   * ───────────────────────────────────────────────────────────────
   * 核心思想：大模型目标越单一，表现越完美
   * - 第一步（挖掘者）：高召回率，只管内容，不要求格式
   * - 第二步（装配工）：高精确度，只管格式，严格JSON输出
   * ═══════════════════════════════════════════════════════════════
   */
  async extractScoringCriteriaTwoPhase(documentContent: string): Promise<{
    evaluationCriteria: any[];
    debugInfo?: {
      phase1Length: number;
      phase2Length: number;
      hasScoring: boolean;
    };
  }> {
    console.log('[SegmentedExtraction] 🚀 开始两步法评分标准提取...');
    
    // ===== 第一步：挖掘者 (Miner) - 高召回率提取 =====
    console.log('[SegmentedExtraction] 📝 Phase 1: 挖掘者 - 提取评分相关内容...');
    
    const minerPrompt = SCORING_MINER_PROMPT.replace('{documentContent}', documentContent);
    const rawScoringInfo = await this.llm.invoke(minerPrompt);
    
    // 熔断检查：如果第一步判定没有评分标准，直接返回空数组
    if (rawScoringInfo.includes('无评分标准') || rawScoringInfo.trim().length < 50) {
      console.log('[SegmentedExtraction] ⚠️ Phase 1: 未发现评分标准，跳过第二步');
      return { 
        evaluationCriteria: [],
        debugInfo: {
          phase1Length: rawScoringInfo.length,
          phase2Length: 0,
          hasScoring: false
        }
      };
    }
    
    console.log(`[SegmentedExtraction] ✅ Phase 1 完成，提取到原始内容长度: ${rawScoringInfo.length}`);
    console.log(`[SegmentedExtraction] Phase 1 内容预览: ${rawScoringInfo.substring(0, 500)}...`);
    
    // ===== 第二步：装配工 (Assembler) - 高精确度结构化 =====
    console.log('[SegmentedExtraction] 🛠️ Phase 2: 装配工 - 结构化解析...');
    
    const assemblerPrompt = SCORING_ASSEMBLER_PROMPT.replace('{rawScoringInfo}', rawScoringInfo);
    const structuredResponse = await this.llm.invoke(assemblerPrompt);
    
    console.log(`[SegmentedExtraction] Phase 2 LLM响应长度: ${structuredResponse.length}`);
    
    // 解析JSON
    const parsed = await this.parseJSONWithLLMRepair(structuredResponse, false, '评分标准');
    
    if (!parsed || !parsed.evaluationCriteria) {
      console.warn('[SegmentedExtraction] Phase 2 解析失败，尝试直接解析evaluationCriteria');
      
      // 尝试直接解析为数组
      const directParsed = await this.parseJSONWithLLMRepair(structuredResponse, true, '评分标准数组');
      if (Array.isArray(directParsed) && directParsed.length > 0) {
        // 将数组转换为 evaluationCriteria 格式
        const evaluationCriteria = this.transformScoringItemsToCriteria(directParsed);
        return {
          evaluationCriteria,
          debugInfo: {
            phase1Length: rawScoringInfo.length,
            phase2Length: structuredResponse.length,
            hasScoring: true
          }
        };
      }
      
      return { 
        evaluationCriteria: [],
        debugInfo: {
          phase1Length: rawScoringInfo.length,
          phase2Length: structuredResponse.length,
          hasScoring: true
        }
      };
    }
    
    // 验证并修正 totalScore
    const evaluationCriteria = parsed.evaluationCriteria.map((category: any, idx: number) => {
      const items = category.items || [];
      const calculatedTotal = items.reduce((sum: number, item: any) => sum + (item.itemScore || 0), 0);
      
      // 如果 totalScore 不等于实际分值之和，使用计算值
      if (category.totalScore !== calculatedTotal && items.length > 0) {
        console.log(`[SegmentedExtraction] 修正 ${category.category} totalScore: ${category.totalScore} -> ${calculatedTotal}`);
        category.totalScore = calculatedTotal;
      }
      
      return {
        ...category,
        seq: category.seq || idx + 1
      };
    });
    
    const totalItems = evaluationCriteria.reduce((sum: number, cat: any) => sum + (cat.items?.length || 0), 0);
    console.log(`[SegmentedExtraction] ✅ 两步法提取完成，共 ${evaluationCriteria.length} 个大类，${totalItems} 个细项`);
    
    return {
      evaluationCriteria,
      debugInfo: {
        phase1Length: rawScoringInfo.length,
        phase2Length: structuredResponse.length,
        hasScoring: true
      }
    };
  }

  /**
   * 将评分项数组转换为 evaluationCriteria 格式
   */
  private transformScoringItemsToCriteria(items: any[]): any[] {
    // 按category分组
    const categoryMap = new Map<string, any[]>();
    
    for (const item of items) {
      const category = item.category || '其他评分';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push({
        subItem: item.item || item.subItem || '',
        itemScore: item.weight || item.itemScore || 0,
        rule: item.criteria || item.rule || ''
      });
    }
    
    // 转换为数组格式
    const evaluationCriteria: any[] = [];
    let seq = 1;
    
    categoryMap.forEach((categoryItems, categoryName) => {
      const totalScore = categoryItems.reduce((sum, item) => sum + item.itemScore, 0);
      
      // 判断类型
      let categoryType = 'technical';
      const lowerName = categoryName.toLowerCase();
      if (lowerName.includes('商务') || lowerName.includes('资质') || lowerName.includes('业绩')) {
        categoryType = 'business';
      } else if (lowerName.includes('价格') || lowerName.includes('报价')) {
        categoryType = 'price';
      }
      
      evaluationCriteria.push({
        seq: seq++,
        category: categoryName,
        totalScore,
        categoryType,
        items: categoryItems
      });
    });
    
    return evaluationCriteria;
  }

  /**
   * 提取单个分段（内部方法）
   */
  private async extractSingleSegment(
    segment: typeof EXTRACTION_SEGMENTS[0],
    documentContent: string
  ): Promise<any> {
    console.log(`[SegmentedExtraction] 提取 ${segment.name}...`);

    try {
      const prompt = segment.prompt.replace('{documentContent}', documentContent);
      
      // 调试：检查替换后的prompt
      console.log(`[SegmentedExtraction] ${segment.name} prompt替换后长度:`, prompt.length);
      
      // 检查是否替换成功
      if (prompt.includes('{documentContent}')) {
        console.error(`[SegmentedExtraction] ${segment.name} {documentContent}未被替换！`);
      }
      
      // ══════════════════════════════════════════════════════════
      // 评分标准：优先使用两步法（挖掘者 + 装配工）
      // ══════════════════════════════════════════════════════════
      if (segment.isScoring) {
        console.log(`[SegmentedExtraction] ${segment.name} 使用两步法提取...`);
        
        try {
          const twoPhaseResult = await this.extractScoringCriteriaTwoPhase(documentContent);
          
          if (twoPhaseResult.evaluationCriteria && twoPhaseResult.evaluationCriteria.length > 0) {
            console.log(`[SegmentedExtraction] ✅ 两步法提取成功，共 ${twoPhaseResult.evaluationCriteria.length} 个大类`);
            return { evaluationCriteria: twoPhaseResult.evaluationCriteria };
          } else {
            console.log(`[SegmentedExtraction] ⚠️ 两步法未提取到评分标准，尝试单次调用降级...`);
          }
        } catch (twoPhaseError: any) {
          console.error(`[SegmentedExtraction] 两步法提取失败:`, twoPhaseError.message);
          console.log(`[SegmentedExtraction] 尝试单次调用降级...`);
        }
      }
      
      const response = await this.llm.invoke(prompt);
      
      console.log(`[SegmentedExtraction] ${segment.name} LLM 响应长度:`, response.length);
      
      let parsed: any = null;
      
      // 根据格式类型选择解析方式
      if (segment.useDelimiter) {
        // 使用分隔符格式解析（更容错）
        console.log(`[SegmentedExtraction] ${segment.name} 使用分隔符格式解析`);
        parsed = parseDelimiterRisks(response);
        
        if (!parsed || parsed.length === 0) {
          console.log(`[SegmentedExtraction] ${segment.name} 分隔符解析结果为空，尝试JSON解析`);
          // 降级尝试JSON解析（支持LLM修复）
          parsed = await this.parseJSONWithLLMRepair(response, segment.isArray, segment.name);
        }
      } else {
        // 使用JSON格式解析（支持LLM修复）
        parsed = await this.parseJSONWithLLMRepair(response, segment.isArray, segment.name);
      }
      
      if (!parsed) {
        console.warn(`[SegmentedExtraction] ${segment.name} 解析返回 null，使用默认值`);
        console.error(`[SegmentedExtraction] ${segment.name} 解析失败的内容片段:`, response.substring(0, 1000));
        return this.getDefaultValue(segment.key);
      }
      
      // 调试：打印解析后的数据结构
      console.log(`[SegmentedExtraction] ${segment.name} 解析后的数据keys:`, 
        Array.isArray(parsed) ? `数组长度:${parsed.length}` : Object.keys(parsed));
      
      // 特殊处理评分标准
      if (segment.isScoring) {
        console.log(`[SegmentedExtraction] ${segment.name} evaluationCriteria类型:`, typeof parsed.evaluationCriteria, Array.isArray(parsed.evaluationCriteria));
        
        if (parsed.evaluationCriteria && Array.isArray(parsed.evaluationCriteria)) {
          // 检查是否使用混合格式（itemsText字段）
          const hasItemsText = parsed.evaluationCriteria.some(
            (cat: any) => cat.itemsText && typeof cat.itemsText === 'string'
          );
          
          if (hasItemsText) {
            console.log('[SegmentedExtraction] 检测到混合格式评分标准，解析itemsText');
            parsed = parseHybridScoringCriteria(parsed);
          }
          
          const totalItems = parsed.evaluationCriteria.reduce((sum: number, cat: any) => sum + (cat.items?.length || 0), 0);
          console.log(`[SegmentedExtraction] 评分标准提取完成，共 ${parsed.evaluationCriteria.length} 个大类，${totalItems} 个细项`);
          
          // 打印每个大类的信息
          parsed.evaluationCriteria.forEach((cat: any, idx: number) => {
            console.log(`[SegmentedExtraction] 大类${idx + 1}: ${cat.category} (${cat.totalScore}分, ${cat.items?.length || 0}个细项)`);
          });
          
          return { evaluationCriteria: parsed.evaluationCriteria };
        } else {
          console.warn(`[SegmentedExtraction] 评分标准格式不正确，缺少evaluationCriteria数组`);
          console.log(`[SegmentedExtraction] 实际返回的数据结构:`, JSON.stringify(parsed, null, 2).substring(0, 500));
          return { evaluationCriteria: [] };
        }
      } else if (segment.isArray) {
        // 处理数组类型的结果（废标风险）
        if (Array.isArray(parsed)) {
          console.log(`[SegmentedExtraction] ${segment.name} 提取完成，共 ${parsed.length} 项`);
          // 打印每项的摘要
          parsed.slice(0, 3).forEach((item: any, idx: number) => {
            console.log(`[SegmentedExtraction] 风险${idx + 1}: [${item.severity}] ${item.riskType} - ${item.description?.substring(0, 50)}...`);
          });
          return parsed;
        } else {
          console.warn(`[SegmentedExtraction] ${segment.name} 期望数组但返回的是对象`);
          return [];
        }
      } else {
        return parsed;
      }
    } catch (error) {
      console.error(`[SegmentedExtraction] ${segment.name} 提取失败:`, error);
      return this.getDefaultValue(segment.key);
    }
  }
  /**
   * 解析JSON - 使用统一的JSON解析器，支持LLM修复
   * 当规则修复失败时，调用LLM进行智能修复
   */
  private async parseJSONWithLLMRepair(
    content: string, 
    expectArray: boolean = false, 
    segmentName: string = '',
    expectedSchema?: string
  ): Promise<any> {
    if (!content || content.trim().length === 0) {
      console.error(`[SegmentedExtraction] [${segmentName}] 内容为空`);
      return null;
    }

    console.log(`[SegmentedExtraction] [${segmentName}] 开始解析JSON，长度: ${content.length}`);
    
    // 先尝试同步解析（规则修复）
    const syncResult = parseJSON(content, { 
      allowTruncated: true, 
      verbose: true,
      maxRepairAttempts: 5 
    });

    if (syncResult.success) {
      if (syncResult.repaired) {
        console.log(`[SegmentedExtraction] [${segmentName}] JSON已通过规则修复`);
      }
      
      // 检查返回类型是否符合预期
      if (expectArray && !Array.isArray(syncResult.data)) {
        console.warn(`[SegmentedExtraction] [${segmentName}] 期望数组但返回的是对象，尝试转换`);
        return [syncResult.data];
      }

      console.log(`[SegmentedExtraction] [${segmentName}] 解析成功，类型: ${Array.isArray(syncResult.data) ? `数组(${syncResult.data.length}项)` : '对象'}`);
      return syncResult.data;
    }

    // 规则修复失败，尝试LLM修复
    console.log(`[SegmentedExtraction] [${segmentName}] 规则修复失败，尝试LLM修复...`);
    console.error(`[SegmentedExtraction] [${segmentName}] 规则修复错误:`, syncResult.error);

    try {
      const llmResult = await parseJSONAsync(content, {
        allowTruncated: true,
        verbose: true,
        llmRepair: true,
        llmRepairOptions: {
          expectedSchema: expectedSchema || (expectArray ? '数组格式' : '对象格式'),
          fieldName: segmentName,
          maxTokens: 8192,
          verbose: true
        }
      });

      if (llmResult.success) {
        console.log(`[SegmentedExtraction] [${segmentName}] LLM修复成功`);
        
        // 检查返回类型是否符合预期
        if (expectArray && !Array.isArray(llmResult.data)) {
          console.warn(`[SegmentedExtraction] [${segmentName}] LLM修复后期望数组但返回的是对象，尝试转换`);
          return [llmResult.data];
        }

        console.log(`[SegmentedExtraction] [${segmentName}] LLM修复后解析成功，类型: ${Array.isArray(llmResult.data) ? `数组(${llmResult.data.length}项)` : '对象'}`);
        return llmResult.data;
      }

      console.error(`[SegmentedExtraction] [${segmentName}] LLM修复也失败:`, llmResult.error);
      return null;
    } catch (error: any) {
      console.error(`[SegmentedExtraction] [${segmentName}] LLM修复异常:`, error.message);
      return null;
    }
  }


  private getDefaultValue(key: string): any {
    const defaults: Record<string, any> = {
      projectBasicInfo: {},
      projectBackground: { constructionGoals: [], businessRequirements: [] },
      timeSchedule: {},
      coreTechDemand: { systemUpgradeDemands: [], technicalParameters: [], performanceRequirements: [] },
      businessRequirements: { bidderQualification: { basicQualification: [], requiredCertificates: [], personnelRequirements: [] }, bidSecurity: {} },
      scoringStandard: { evaluationCriteria: [] },
      disqualificationRisks: [],
      biddingDocumentRequirements: { documentStructure: [], sealingRequirements: [], signatureRequirements: [] },
      otherImportantInfo: { specialRequirements: [], notes: [], attachments: [] },
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
      projectBackground: data?.projectBackground || data?.project_background || { constructionGoals: [], businessRequirements: [] },
      timeSchedule: data?.timeSchedule || data?.time_schedule || {},
      coreTechDemand: data?.coreTechDemand || data?.core_tech_demand || { systemUpgradeDemands: [], technicalParameters: [] },
      businessRequirements: data?.businessRequirements || data?.business_requirements || {},
      scoringStandard,
      disqualificationRisks: data?.disqualificationRisks || data?.disqualification_risks || [],
      biddingDocumentRequirements: data?.biddingDocumentRequirements || data?.bidding_document_requirements || {},
      otherImportantInfo: data?.otherImportantInfo || data?.other_important_info || { specialRequirements: [], notes: [], attachments: [] },
      extractionMetadata: {
        strategy: 'segmented',
        segmentCount: 9,
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
