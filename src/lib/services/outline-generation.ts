/**
 * 标书大纲生成服务
 * 使用统一的LLMService进行大纲生成
 */

import { createModel } from '@/lib/llm';
import { parseJSON } from '@/lib/utils/json-parser';
import { OUTLINE_GENERATION_PROMPT } from '@/lib/prompts/outline-generation';

/**
 * 大纲章节
 */
export interface OutlineSection {
  id: string;
  title: string;
  level: number;
  order: number;
  isRequired: boolean;
  sectionType: 'technical' | 'business' | 'price' | 'basic';
  scoringItemIds: string[];
  riskIds: string[];
  contentGuide: {
    mainPoints: string[];
    materialSuggestions: string[];
    knowledgeBaseQueries: string[];
  };
  children?: OutlineSection[];
}

/**
 * 标书大纲
 */
export interface BidOutline {
  title: string;
  totalScore: number;
  sections: OutlineSection[];
}

/**
 * 评分项映射
 */
export interface ScoringItemMapping {
  scoringItemId: string;
  scoringItemName: string;
  maxScore: number;
  sectionId: string;
  sectionTitle: string;
  responseStrategy: string;
  coverageScore: number;
}

/**
 * 废标风险映射
 */
export interface RiskMapping {
  riskId: string;
  riskDescription: string;
  severity: string;
  sectionId: string;
  sectionTitle: string;
  responseContent: string;
  requiredMaterials: string[];
}

/**
 * 映射矩阵
 */
export interface MappingMatrix {
  scoringItemMappings: ScoringItemMapping[];
  riskMappings: RiskMapping[];
}

/**
 * 覆盖报告
 */
export interface CoverageReport {
  totalScoringItems: number;
  coveredScoringItems: number;
  coverageRate: number;
  totalRisks: number;
  respondedRisks: number;
  riskResponseRate: number;
  uncoveredItems: string[];
  unrespondedRisks: string[];
}

/**
 * 大纲生成结果
 */
export interface OutlineGenerationResult {
  outline: BidOutline;
  mappingMatrix: MappingMatrix;
  coverageReport: CoverageReport;
}

/**
 * 标书大纲生成服务类
 */
export class OutlineGenerationService {
  private model: ReturnType<typeof createModel>;

  constructor() {
    // 大纲生成是复杂任务，需要足够的输出空间
    // 禁用思考模式以确保JSON输出完整（思考模式会占用大量tokens）
    this.model = createModel({
      enableThinking: false,  // 禁用思考模式，确保JSON输出完整
      temperature: 0.5,
      maxTokens: 32768,  // 使用32K输出，足够生成完整大纲
    });
  }

  /**
   * 生成标书大纲
   */
  async generateOutline(
    projectName: string,
    scoringItems: any[],
    risks: any[],
    projectInfo?: any
  ): Promise<OutlineGenerationResult> {
    const prompt = `${OUTLINE_GENERATION_PROMPT}

请根据以下信息生成标书大纲：

## 项目信息
项目名称：${projectName}
${projectInfo ? `项目描述：${projectInfo.description || ''}` : ''}

## 评分项列表（共${scoringItems.length}项）
${JSON.stringify(scoringItems, null, 2)}

## 废标风险列表（共${risks.length}项）
${JSON.stringify(risks, null, 2)}

请生成完整的标书大纲、映射矩阵和覆盖报告。以JSON格式输出。`;

    try {
      console.log('[OutlineGeneration] 开始生成大纲...');
      const response = await this.model.invokeStreaming(prompt, '你是一位专业的标书编写专家，擅长设计投标文件结构。请直接返回JSON格式结果。');
      console.log('[OutlineGeneration] LLM响应长度:', response.length);

      const result = this.parseJSONResponse(response);
      this.validateOutlineResult(result);

      console.log('[OutlineGeneration] 大纲生成成功');
      return result;
    } catch (error) {
      console.error('[OutlineGeneration] 大纲生成失败:', error);
      throw new Error(`大纲生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 解析JSON响应
   */
  private parseJSONResponse(content: string): any {
    const result = parseJSON(content, { allowTruncated: true, verbose: true });
    if (!result.success) {
      throw new Error(result.error || '无法解析JSON响应');
    }
    if (result.repaired) {
      console.warn('[OutlineGeneration] JSON已自动修复');
    }
    return result.data;
  }

  /**
   * 验证大纲生成结果
   */
  private validateOutlineResult(result: any): void {
    if (!result.outline) {
      throw new Error('大纲生成结果缺少outline');
    }

    if (!result.outline.sections || !Array.isArray(result.outline.sections)) {
      throw new Error('大纲生成结果格式错误：缺少sections数组');
    }

    if (!result.mappingMatrix) {
      console.warn('[OutlineGeneration] 大纲生成结果缺少mappingMatrix，使用默认值');
      result.mappingMatrix = { scoringItemMappings: [], riskMappings: [] };
    }

    if (!result.coverageReport) {
      console.warn('[OutlineGeneration] 大纲生成结果缺少coverageReport，使用默认值');
      result.coverageReport = {
        totalScoringItems: 0,
        coveredScoringItems: 0,
        coverageRate: 0,
        totalRisks: 0,
        respondedRisks: 0,
        riskResponseRate: 0,
        uncoveredItems: [],
        unrespondedRisks: [],
      };
    }

    // 验证覆盖率
    if (result.coverageReport.coverageRate < 100) {
      console.warn(`[OutlineGeneration] 警告：评分项覆盖率未达100%（当前${result.coverageReport.coverageRate}%）`);
    }

    if (result.coverageReport.riskResponseRate < 100) {
      console.warn(`[OutlineGeneration] 警告：废标风险响应率未达100%（当前${result.coverageReport.riskResponseRate}%）`);
    }
  }

  /**
   * 根据章节ID获取章节内容指引
   */
  getContentGuide(sectionId: string, outline: BidOutline): OutlineSection | null {
    const findSection = (sections: OutlineSection[]): OutlineSection | null => {
      for (const section of sections) {
        if (section.id === sectionId) {
          return section;
        }
        if (section.children) {
          const found = findSection(section.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findSection(outline.sections);
  }

  /**
   * 根据评分项ID获取对应章节
   */
  getSectionForScoringItem(scoringItemId: string, outline: BidOutline): OutlineSection | null {
    const findSection = (sections: OutlineSection[]): OutlineSection | null => {
      for (const section of sections) {
        if (section.scoringItemIds.includes(scoringItemId)) {
          return section;
        }
        if (section.children) {
          const found = findSection(section.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findSection(outline.sections);
  }
}

/**
 * 创建大纲生成服务实例
 */
export function createOutlineGenerationService(): OutlineGenerationService {
  return new OutlineGenerationService();
}
