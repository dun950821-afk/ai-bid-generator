/**
 * 章节内容生成服务
 */

import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { createRAGRetrievalService } from './rag-retrieval';
import {
  CONTENT_GENERATION_PROMPT,
  TECHNICAL_SOLUTION_PROMPT,
  IMPLEMENTATION_PLAN_PROMPT,
  AFTER_SALES_SERVICE_PROMPT,
  QUALIFICATION_PROMPT,
  CASE_STUDY_PROMPT,
} from '@/lib/prompts/content-generation';

/**
 * 章节内容
 */
export interface SectionContent {
  summary: string;
  mainContent: string;
  tables?: Array<{
    title: string;
    headers: string[];
    rows: string[][];
  }>;
}

/**
 * 评分响应详情
 */
export interface ScoringResponseDetail {
  rule: string;
  response: string;
  evidence: string;
  expectedScore: number;
}

/**
 * 评分响应
 */
export interface ScoringResponse {
  scoringItemId: string;
  maxScore: number;
  responseDetails: ScoringResponseDetail[];
}

/**
 * 引用信息
 */
export interface Citation {
  id: string;
  type: 'qualification' | 'case' | 'technical' | 'other';
  source: string;
  content: string;
  location?: string;
}

/**
 * 内容生成结果
 */
export interface ContentGenerationResult {
  sectionId: string;
  sectionTitle: string;
  content: SectionContent;
  scoringResponse: ScoringResponse;
  citations: Citation[];
  metadata: {
    wordCount: number;
    citationCount: number;
    confidence: number;
  };
}

/**
 * 章节内容生成服务类
 */
export class ContentGenerationService {
  private llmClient: LLMClient;
  private model: string;

  constructor(customHeaders?: Record<string, string>) {
    const config = new Config();
    this.llmClient = new LLMClient(config, customHeaders);
    this.model = 'doubao-seed-2-0-pro-260215'; // 使用旗舰模型生成高质量内容
  }

  /**
   * 生成章节内容
   */
  async generateSectionContent(
    sectionId: string,
    sectionTitle: string,
    sectionType: string,
    scoringItems: Array<{
      id: string;
      itemName: string;
      maxScore: number;
      scoringRules: Array<{ rule: string; score?: number }>;
    }>,
    knowledgeBaseId?: string,
    customPrompt?: string
  ): Promise<ContentGenerationResult> {
    // 1. 获取知识库相关素材
    let knowledgeContext = '';
    if (knowledgeBaseId) {
      const ragService = createRAGRetrievalService();
      const queries = scoringItems.map((item) => item.itemName);
      const allContext: string[] = [];

      for (const query of queries) {
        const context = await ragService.getRelevantContext(query, knowledgeBaseId, 500);
        if (context) {
          allContext.push(context);
        }
      }

      knowledgeContext = allContext.join('\n\n');
    }

    // 2. 选择合适的Prompt模板
    let systemPrompt = customPrompt || CONTENT_GENERATION_PROMPT;
    if (!customPrompt) {
      switch (sectionType) {
        case 'technical':
          systemPrompt = TECHNICAL_SOLUTION_PROMPT;
          break;
        case 'implementation':
          systemPrompt = IMPLEMENTATION_PLAN_PROMPT;
          break;
        case 'service':
          systemPrompt = AFTER_SALES_SERVICE_PROMPT;
          break;
        case 'qualification':
          systemPrompt = QUALIFICATION_PROMPT;
          break;
        case 'case':
          systemPrompt = CASE_STUDY_PROMPT;
          break;
      }
    }

    // 3. 构建消息
    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt,
      },
      {
        role: 'user' as const,
        content: `请根据以下信息生成标书章节内容：

## 章节信息
- 章节ID：${sectionId}
- 章节标题：${sectionTitle}
- 章节类型：${sectionType}

## 评分项要求
${JSON.stringify(scoringItems, null, 2)}

## 知识库素材
${knowledgeContext || '暂无相关知识库素材'}

请生成完整的章节内容，确保响应所有评分项要求。`,
      },
    ];

    // 4. 调用LLM生成内容
    try {
      const response = await this.llmClient.invoke(messages, {
        model: this.model,
        temperature: 0.7,
      });

      const result = this.parseJSONResponse(response.content);
      this.validateContentResult(result);

      return result;
    } catch (error) {
      console.error('章节内容生成失败:', error);
      throw new Error(`章节内容生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 批量生成章节内容
   */
  async batchGenerateSections(
    sections: Array<{
      id: string;
      title: string;
      type: string;
      scoringItemIds: string[];
    }>,
    scoringItems: Map<string, any>,
    knowledgeBaseId?: string
  ): Promise<ContentGenerationResult[]> {
    const results: ContentGenerationResult[] = [];

    for (const section of sections) {
      // 获取该章节相关的评分项
      const relatedScoringItems = section.scoringItemIds
        .map((id) => scoringItems.get(id))
        .filter(Boolean);

      if (relatedScoringItems.length === 0) {
        continue;
      }

      try {
        const result = await this.generateSectionContent(
          section.id,
          section.title,
          section.type,
          relatedScoringItems,
          knowledgeBaseId
        );

        results.push(result);

        // 避免API限流
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`生成章节 ${section.id} 失败:`, error);
      }
    }

    return results;
  }

  /**
   * 优化章节内容
   */
  async optimizeContent(
    existingContent: ContentGenerationResult,
    feedback: string
  ): Promise<ContentGenerationResult> {
    const messages = [
      {
        role: 'system' as const,
        content: `你是标书内容优化专家。请根据用户反馈优化标书章节内容。

## 优化原则
1. 保持原有结构
2. 针对反馈问题进行修改
3. 保持专业性和规范性
4. 不增加新的引用来源

请输出优化后的完整内容（JSON格式）。`,
      },
      {
        role: 'user' as const,
        content: `请根据以下反馈优化章节内容：

## 原有内容
${JSON.stringify(existingContent, null, 2)}

## 优化反馈
${feedback}

请输出优化后的完整内容。`,
      },
    ];

    try {
      const response = await this.llmClient.invoke(messages, {
        model: this.model,
        temperature: 0.7,
      });

      const result = this.parseJSONResponse(response.content);
      return result;
    } catch (error) {
      console.error('优化内容失败:', error);
      throw new Error(`优化内容失败: ${error instanceof Error ? error.message : '未知错误'}`);
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
   * 验证内容生成结果
   */
  private validateContentResult(result: any): void {
    if (!result.content) {
      throw new Error('内容生成结果缺少content');
    }

    if (!result.scoringResponse) {
      throw new Error('内容生成结果缺少scoringResponse');
    }

    if (!result.citations || !Array.isArray(result.citations)) {
      result.citations = [];
    }

    if (!result.metadata) {
      result.metadata = {
        wordCount: result.content.mainContent?.length || 0,
        citationCount: result.citations.length,
        confidence: 0.8,
      };
    }
  }

  /**
   * 计算内容与评分项的匹配度
   */
  calculateMatchingScore(
    content: string,
    scoringRules: string[]
  ): number {
    const contentLower = content.toLowerCase();
    let matchCount = 0;

    for (const rule of scoringRules) {
      const keywords = rule.toLowerCase().split(/\s+/);
      const hasMatch = keywords.some((keyword) => contentLower.includes(keyword));
      if (hasMatch) {
        matchCount++;
      }
    }

    return scoringRules.length > 0 ? matchCount / scoringRules.length : 0;
  }
}

/**
 * 创建章节内容生成服务实例
 */
export function createContentGenerationService(
  customHeaders?: Record<string, string>
): ContentGenerationService {
  return new ContentGenerationService(customHeaders);
}
