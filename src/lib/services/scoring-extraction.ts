/**
 * 评分项提取服务
 * 使用LLM从招标文档中提取评分项和废标风险
 */

import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import {
  SCORING_EXTRACTION_PROMPT,
  DISQUALIFICATION_RISK_EXTRACTION_PROMPT,
  FULL_EXTRACTION_PROMPT,
} from '@/lib/prompts/scoring-extraction';
import type {
  CreateScoringItemRequest,
  CreateDisqualificationRiskRequest,
  ScoringExtractionResult,
  RiskExtractionResult,
  FullExtractionResult,
} from '@/types/scoring-system';

/**
 * 评分项提取服务类
 */
export class ScoringExtractionService {
  private client: LLMClient;
  private model: string;

  constructor(customHeaders?: Record<string, string>) {
    const config = new Config();
    this.client = new LLMClient(config, customHeaders);
    // 使用深度思考模型处理复杂提取任务
    this.model = 'doubao-seed-1-6-thinking-250715';
  }

  /**
   * 从招标文档文本中提取评分项
   */
  async extractScoringItems(
    documentText: string,
    documentName: string,
    pages?: number
  ): Promise<ScoringExtractionResult> {
    const messages = [
      {
        role: 'system' as const,
        content: SCORING_EXTRACTION_PROMPT,
      },
      {
        role: 'user' as const,
        content: `请从以下招标文档内容中提取评分项信息：

文档名称：${documentName}
${pages ? `文档页数：${pages}` : ''}

文档内容：
${documentText}

请按照JSON Schema格式输出评分项提取结果。`,
      },
    ];

    try {
      const response = await this.client.invoke(messages, {
        model: this.model,
        thinking: 'enabled',
        temperature: 0.3, // 低温度确保提取准确性
      });

      // 解析JSON响应
      const result = this.parseJSONResponse(response.content);
      
      // 验证提取结果
      this.validateScoringResult(result);

      return result;
    } catch (error) {
      console.error('评分项提取失败:', error);
      throw new Error(`评分项提取失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 从招标文档文本中提取废标风险
   */
  async extractDisqualificationRisks(
    documentText: string,
    documentName: string,
    pages?: number
  ): Promise<RiskExtractionResult> {
    const messages = [
      {
        role: 'system' as const,
        content: DISQUALIFICATION_RISK_EXTRACTION_PROMPT,
      },
      {
        role: 'user' as const,
        content: `请从以下招标文档内容中提取废标风险项：

文档名称：${documentName}
${pages ? `文档页数：${pages}` : ''}

文档内容：
${documentText}

请按照JSON Schema格式输出废标风险提取结果。`,
      },
    ];

    try {
      const response = await this.client.invoke(messages, {
        model: this.model,
        thinking: 'enabled',
        temperature: 0.3,
      });

      const result = this.parseJSONResponse(response.content);
      this.validateRiskResult(result);

      return result;
    } catch (error) {
      console.error('废标风险提取失败:', error);
      throw new Error(`废标风险提取失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 完整提取（一次性提取所有信息）
   */
  async extractFullInfo(
    documentText: string,
    documentName: string,
    pages?: number
  ): Promise<FullExtractionResult> {
    const messages = [
      {
        role: 'system' as const,
        content: FULL_EXTRACTION_PROMPT,
      },
      {
        role: 'user' as const,
        content: `请从以下招标文档内容中提取完整结构化信息：

文档名称：${documentName}
${pages ? `文档页数：${pages}` : ''}

文档内容：
${documentText}

请按照JSON Schema格式输出完整提取结果。`,
      },
    ];

    try {
      const response = await this.client.invoke(messages, {
        model: this.model,
        thinking: 'enabled',
        temperature: 0.3,
      });

      const result = this.parseJSONResponse(response.content);
      this.validateFullResult(result);

      return result;
    } catch (error) {
      console.error('完整信息提取失败:', error);
      throw new Error(`完整信息提取失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 解析JSON响应
   */
  private parseJSONResponse(content: string): any {
    try {
      // 尝试直接解析
      return JSON.parse(content);
    } catch (e) {
      // 如果失败，尝试提取JSON代码块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // 尝试提取纯JSON
      const pureJsonMatch = content.match(/\{[\s\S]*\}/);
      if (pureJsonMatch) {
        return JSON.parse(pureJsonMatch[0]);
      }

      throw new Error('无法解析JSON响应');
    }
  }

  /**
   * 验证评分项提取结果
   */
  private validateScoringResult(result: any): void {
    if (!result.scoringItems || !Array.isArray(result.scoringItems)) {
      throw new Error('评分项提取结果格式错误：缺少scoringItems数组');
    }

    if (!result.summary) {
      throw new Error('评分项提取结果格式错误：缺少summary');
    }

    // 验证每个评分项
    result.scoringItems.forEach((item: any, index: number) => {
      if (!item.itemName || typeof item.itemName !== 'string') {
        throw new Error(`评分项${index}缺少itemName字段`);
      }
      if (!item.itemType || !['technical', 'business', 'price'].includes(item.itemType)) {
        throw new Error(`评分项${index}的itemType字段无效`);
      }
      if (typeof item.maxScore !== 'number' || item.maxScore < 0) {
        throw new Error(`评分项${index}的maxScore字段无效`);
      }
    });

    // 验证总分
    const totalScore = result.scoringItems.reduce((sum: number, item: any) => sum + item.maxScore, 0);
    if (Math.abs(totalScore - result.summary.totalScore) > 0.01) {
      console.warn(`警告：评分项总分(${totalScore})与汇总总分(${result.summary.totalScore})不一致`);
    }
  }

  /**
   * 验证废标风险提取结果
   */
  private validateRiskResult(result: any): void {
    if (!result.risks || !Array.isArray(result.risks)) {
      throw new Error('废标风险提取结果格式错误：缺少risks数组');
    }

    if (!result.summary) {
      throw new Error('废标风险提取结果格式错误：缺少summary');
    }

    // 验证每个风险项
    result.risks.forEach((risk: any, index: number) => {
      if (!risk.riskType || typeof risk.riskType !== 'string') {
        throw new Error(`风险项${index}缺少riskType字段`);
      }
      if (!risk.riskDescription || typeof risk.riskDescription !== 'string') {
        throw new Error(`风险项${index}缺少riskDescription字段`);
      }
      if (!['critical', 'high', 'medium', 'low'].includes(risk.severity)) {
        throw new Error(`风险项${index}的severity字段无效`);
      }
    });
  }

  /**
   * 验证完整提取结果
   */
  private validateFullResult(result: any): void {
    if (!result.projectBasicInfo) {
      throw new Error('完整提取结果缺少projectBasicInfo');
    }

    if (result.scoringItems && result.scoringItems.length > 0) {
      this.validateScoringResult({
        scoringItems: result.scoringItems,
        summary: result.scoringSummary,
      });
    }

    if (result.risks && result.risks.length > 0) {
      this.validateRiskResult({
        risks: result.risks,
        summary: result.riskSummary,
      });
    }
  }
}

/**
 * 创建评分项提取服务实例
 */
export function createScoringExtractionService(
  customHeaders?: Record<string, string>
): ScoringExtractionService {
  return new ScoringExtractionService(customHeaders);
}
