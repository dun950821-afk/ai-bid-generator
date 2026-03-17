/**
 * 标书大纲生成服务
 */

import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
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
  private client: LLMClient;
  private model: string;

  constructor(customHeaders?: Record<string, string>) {
    const config = new Config();
    this.client = new LLMClient(config, customHeaders);
    // 使用深度思考模型处理大纲生成
    this.model = 'doubao-seed-1-6-thinking-250715';
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
    const messages = [
      {
        role: 'system' as const,
        content: OUTLINE_GENERATION_PROMPT,
      },
      {
        role: 'user' as const,
        content: `请根据以下信息生成标书大纲：

## 项目信息
项目名称：${projectName}
${projectInfo ? `项目描述：${projectInfo.description || ''}` : ''}

## 评分项列表（共${scoringItems.length}项）
${JSON.stringify(scoringItems, null, 2)}

## 废标风险列表（共${risks.length}项）
${JSON.stringify(risks, null, 2)}

请生成完整的标书大纲、映射矩阵和覆盖报告。`,
      },
    ];

    try {
      const response = await this.client.invoke(messages, {
        model: this.model,
        thinking: 'enabled',
        temperature: 0.5,
      });

      const result = this.parseJSONResponse(response.content);
      this.validateOutlineResult(result);

      return result;
    } catch (error) {
      console.error('大纲生成失败:', error);
      throw new Error(`大纲生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 解析JSON响应
   */
  private parseJSONResponse(content: string): any {
    try {
      return JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      const pureJsonMatch = content.match(/\{[\s\S]*\}/);
      if (pureJsonMatch) {
        return JSON.parse(pureJsonMatch[0]);
      }

      throw new Error('无法解析JSON响应');
    }
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
      throw new Error('大纲生成结果缺少mappingMatrix');
    }

    if (!result.coverageReport) {
      throw new Error('大纲生成结果缺少coverageReport');
    }

    // 验证覆盖率
    if (result.coverageReport.coverageRate < 100) {
      console.warn(`警告：评分项覆盖率未达100%（当前${result.coverageReport.coverageRate}%）`);
    }

    if (result.coverageReport.riskResponseRate < 100) {
      console.warn(`警告：废标风险响应率未达100%（当前${result.coverageReport.riskResponseRate}%）`);
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
export function createOutlineGenerationService(
  customHeaders?: Record<string, string>
): OutlineGenerationService {
  return new OutlineGenerationService(customHeaders);
}
