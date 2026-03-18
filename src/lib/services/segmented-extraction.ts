/**
 * 分段提取服务
 * 将大型招标文档提取任务拆分成多个小任务，避免LLM响应截断
 */

import { LLMService, createModel } from '@/lib/llm';
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
    this.llm = createModel({ enableThinking: false, temperature: 0.3 });
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
    
    // 定义9个提取任务
    const segments = [
      { key: 'projectBasicInfo', prompt: EXTRACT_PROJECT_INFO_PROMPT, name: '项目基本信息' },
      { key: 'projectBackground', prompt: EXTRACT_PROJECT_BACKGROUND_PROMPT, name: '项目背景' },
      { key: 'timeSchedule', prompt: EXTRACT_TIME_SCHEDULE_PROMPT, name: '时间节点' },
      { key: 'scoringStandard', prompt: EXTRACT_SCORING_PROMPT, name: '评分标准', isScoring: true },
      { key: 'disqualificationRisks', prompt: EXTRACT_RISKS_PROMPT, name: '废标风险', isArray: true },
      { key: 'businessRequirements', prompt: EXTRACT_BUSINESS_PROMPT, name: '商务要求' },
      { key: 'coreTechDemand', prompt: EXTRACT_TECH_PROMPT, name: '技术需求' },
      { key: 'biddingDocumentRequirements', prompt: EXTRACT_DOCUMENT_PROMPT, name: '投标文件要求' },
      { key: 'otherImportantInfo', prompt: EXTRACT_OTHER_INFO_PROMPT, name: '其他重要信息' },
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
        
        // 调试：检查替换后的prompt
        console.log(`[SegmentedExtraction] ${segment.name} prompt替换后长度:`, prompt.length);
        console.log(`[SegmentedExtraction] ${segment.name} prompt前200字符:`, prompt.substring(0, 200));
        
        // 检查是否替换成功
        if (prompt.includes('{documentContent}')) {
          console.error(`[SegmentedExtraction] ${segment.name} {documentContent}未被替换！`);
        }
        
        const response = await this.llm.invokeStreaming(prompt);
        
        console.log(`[SegmentedExtraction] ${segment.name} LLM 响应长度:`, response.length);
        console.log(`[SegmentedExtraction] ${segment.name} LLM 响应前500字符:`, response.substring(0, 500));
        
        const parsed = this.parseJSON(response, segment.isArray, segment.name);
        
        if (!parsed) {
          console.warn(`[SegmentedExtraction] ${segment.name} JSON 解析返回 null，使用默认值`);
          // 调试：打印解析失败的内容
          console.error(`[SegmentedExtraction] ${segment.name} 解析失败的内容片段:`, response.substring(0, 1000));
          results[segment.key] = this.getDefaultValue(segment.key);
          continue;
        }
        
        // 调试：打印解析后的数据结构
        console.log(`[SegmentedExtraction] ${segment.name} 解析后的数据keys:`, 
          Array.isArray(parsed) ? `数组长度:${parsed.length}` : Object.keys(parsed));
        
        // 特殊处理评分标准
        if (segment.isScoring) {
          console.log(`[SegmentedExtraction] ${segment.name} evaluationCriteria类型:`, typeof parsed.evaluationCriteria, Array.isArray(parsed.evaluationCriteria));
          
          if (parsed.evaluationCriteria && Array.isArray(parsed.evaluationCriteria)) {
            const totalItems = parsed.evaluationCriteria.reduce((sum: number, cat: any) => sum + (cat.items?.length || 0), 0);
            console.log(`[SegmentedExtraction] 评分标准提取完成，共 ${parsed.evaluationCriteria.length} 个大类，${totalItems} 个细项`);
            
            // 打印每个大类的信息
            parsed.evaluationCriteria.forEach((cat: any, idx: number) => {
              console.log(`[SegmentedExtraction] 大类${idx + 1}: ${cat.category} (${cat.totalScore}分, ${cat.items?.length || 0}个细项)`);
            });
            
            results[segment.key] = { evaluationCriteria: parsed.evaluationCriteria };
          } else {
            console.warn(`[SegmentedExtraction] 评分标准格式不正确，缺少evaluationCriteria数组`);
            console.log(`[SegmentedExtraction] 实际返回的数据结构:`, JSON.stringify(parsed, null, 2).substring(0, 500));
            results[segment.key] = { evaluationCriteria: [] };
          }
        } else if (segment.isArray) {
          // 处理数组类型的结果（废标风险）
          if (Array.isArray(parsed)) {
            console.log(`[SegmentedExtraction] ${segment.name} 提取完成，共 ${parsed.length} 项`);
            // 打印每项的摘要
            parsed.slice(0, 3).forEach((item: any, idx: number) => {
              console.log(`[SegmentedExtraction] 风险${idx + 1}: [${item.severity}] ${item.riskType} - ${item.description?.substring(0, 50)}...`);
            });
            results[segment.key] = parsed;
          } else {
            console.warn(`[SegmentedExtraction] ${segment.name} 期望数组但返回的是对象`);
            results[segment.key] = [];
          }
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
   * 解析JSON - 增强版，支持多种格式和错误修复
   * 包含截断JSON修复功能
   */
  private parseJSON(content: string, expectArray: boolean = false, segmentName: string = ''): any {
    if (!content || content.trim().length === 0) {
      console.error(`[SegmentedExtraction] [${segmentName}] 内容为空`);
      return null;
    }

    console.log(`[SegmentedExtraction] [${segmentName}] 开始解析JSON，长度: ${content.length}`);
    
    // 清理可能的思考标签和多余内容
    let cleanedContent = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .trim();

    // 检查是否可能被截断
    const lastChars = cleanedContent.slice(-50);
    const looksTruncated = !lastChars.includes('}') && !lastChars.includes(']');
    if (looksTruncated) {
      console.warn(`[SegmentedExtraction] [${segmentName}] 检测到内容可能被截断，最后50字符: ${lastChars}`);
    }

    try {
      const result = JSON.parse(cleanedContent);
      console.log(`[SegmentedExtraction] [${segmentName}] 直接解析成功`);
      return result;
    } catch (e: any) {
      console.error(`[SegmentedExtraction] [${segmentName}] 直接解析失败: ${e.message}`);
      
      // 尝试定位错误位置
      if (e.message && e.message.includes('position')) {
        const posMatch = e.message.match(/position (\d+)/);
        if (posMatch) {
          const errorPos = parseInt(posMatch[1]);
          const context = cleanedContent.substring(Math.max(0, errorPos - 30), errorPos + 30);
          console.error(`[SegmentedExtraction] [${segmentName}] 错误位置(pos ${errorPos}): ...${context}...`);
        }
      }
    }

    // 尝试从代码块中提取
    const codeBlockMatch = cleanedContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        const result = JSON.parse(codeBlockMatch[1].trim());
        console.log(`[SegmentedExtraction] [${segmentName}] 代码块解析成功`);
        return result;
      } catch (e: any) {
        console.error(`[SegmentedExtraction] [${segmentName}] 代码块解析失败: ${e.message}`);
      }
    }

    // 尝试找到第一个 { 和最后一个 }
    const firstBrace = cleanedContent.indexOf('{');
    const lastBrace = cleanedContent.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = cleanedContent.substring(firstBrace, lastBrace + 1);
      
      try {
        const result = JSON.parse(jsonStr);
        console.log(`[SegmentedExtraction] [${segmentName}] 提取对象解析成功`);
        return result;
      } catch (e: any) {
        console.error(`[SegmentedExtraction] [${segmentName}] 提取对象解析失败: ${e.message}`);
        
        // 尝试修复末尾逗号
        try {
          let fixed = jsonStr.replace(/,(\s*[}\]])/g, '$1');
          const result = JSON.parse(fixed);
          console.log(`[SegmentedExtraction] [${segmentName}] 修复末尾逗号后解析成功`);
          return result;
        } catch (e2: any) {
          console.error(`[SegmentedExtraction] [${segmentName}] 修复后仍失败: ${e2.message}`);
          
          // 尝试修复截断的JSON
          const repaired = this.tryRepairTruncatedJSON(jsonStr, segmentName);
          if (repaired) return repaired;
          
          console.error(`[SegmentedExtraction] [${segmentName}] 内容前300字符: ${cleanedContent.substring(0, 300)}`);
          console.error(`[SegmentedExtraction] [${segmentName}] 内容后200字符: ${cleanedContent.slice(-200)}`);
        }
      }
    }
    
    // 如果期望数组格式，尝试解析数组
    if (expectArray) {
      const firstBracket = cleanedContent.indexOf('[');
      const lastBracket = cleanedContent.lastIndexOf(']');
      
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const jsonStr = cleanedContent.substring(firstBracket, lastBracket + 1);
        try {
          const result = JSON.parse(jsonStr);
          console.log(`[SegmentedExtraction] [${segmentName}] 提取数组解析成功`);
          return result;
        } catch (e: any) {
          console.error(`[SegmentedExtraction] [${segmentName}] 提取数组解析失败: ${e.message}`);
          try {
            let fixed = jsonStr.replace(/,(\s*[}\]])/g, '$1');
            const result = JSON.parse(fixed);
            console.log(`[SegmentedExtraction] [${segmentName}] 数组修复后解析成功`);
            return result;
          } catch (e2: any) {
            console.error(`[SegmentedExtraction] [${segmentName}] 数组修复后仍失败: ${e2.message}`);
            
            const repaired = this.tryRepairTruncatedJSON(jsonStr, segmentName);
            if (repaired) return repaired;
          }
        }
      }
    }

    console.error(`[SegmentedExtraction] [${segmentName}] 无法从内容中提取JSON`);
    return null;
  }

  /**
   * 尝试修复被截断的JSON
   */
  private tryRepairTruncatedJSON(jsonStr: string, segmentName: string): any {
    console.log(`[SegmentedExtraction] [${segmentName}] 尝试修复截断JSON，长度: ${jsonStr.length}`);
    
    try {
      // 统计括号数量
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        
        if (escapeNext) { escapeNext = false; continue; }
        if (char === '\\') { escapeNext = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }
      
      console.log(`[SegmentedExtraction] [${segmentName}] 缺少 ${openBraces} 个 }, ${openBrackets} 个 ]`);
      
      let repaired = jsonStr;
      if (inString) {
        console.log(`[SegmentedExtraction] [${segmentName}] 字符串未闭合，添加引号`);
        repaired += '"';
      }
      
      // 移除末尾不完整部分
      const lastComma = repaired.lastIndexOf(',');
      if (lastComma > 0) {
        const afterLastComma = repaired.substring(lastComma + 1).trim();
        if (!afterLastComma.match(/^(\s*"[^"]*"\s*:|[}\]]\s*$)/)) {
          console.log(`[SegmentedExtraction] [${segmentName}] 移除末尾不完整部分`);
          repaired = repaired.substring(0, lastComma);
        }
      }
      
      // 重新统计
      openBraces = 0; openBrackets = 0; inString = false;
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === '"' && (i === 0 || repaired[i-1] !== '\\')) {
          inString = !inString;
        } else if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }
      
      // 添加闭合符号
      const closingSymbols: string[] = [];
      for (let i = 0; i < openBrackets; i++) closingSymbols.push(']');
      for (let i = 0; i < openBraces; i++) closingSymbols.push('}');
      
      if (closingSymbols.length > 0) {
        console.log(`[SegmentedExtraction] [${segmentName}] 添加闭合符号: ${closingSymbols.join('')}`);
        repaired += closingSymbols.join('');
      }
      
      const result = JSON.parse(repaired);
      console.log(`[SegmentedExtraction] [${segmentName}] 截断修复成功`);
      console.log(`[SegmentedExtraction] [${segmentName}] 修复后keys: ${Array.isArray(result) ? result.length + '项' : Object.keys(result).join(',')}`);
      return result;
      
    } catch (e: any) {
      console.error(`[SegmentedExtraction] [${segmentName}] 截断修复失败: ${e.message}`);
      return null;
    }
  }


  /**
   * 获取默认值
   */
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
