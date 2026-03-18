/**
 * 章节内容生成服务
 * 使用统一的LLMService进行内容生成
 */

import { createModel } from '@/lib/llm';
import { parseJSON } from '@/lib/utils/json-parser';
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
  private model: ReturnType<typeof createModel>;

  constructor() {
    // 使用统一LLMService，禁用思考模式以快速生成内容
    this.model = createModel({
      enableThinking: false,
      temperature: 0.7,
      maxTokens: 16384,
    });
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
    console.log(`[ContentGeneration] 开始生成章节内容: ${sectionTitle}`);

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

    // 3. 构建Prompt
    const prompt = `${systemPrompt}

请根据以下信息生成标书章节内容：

## 章节信息
- 章节ID：${sectionId}
- 章节标题：${sectionTitle}
- 章节类型：${sectionType}

## 评分项要求
${JSON.stringify(scoringItems, null, 2)}

## 知识库素材
${knowledgeContext || '暂无相关知识库素材'}

请生成完整的章节内容，确保响应所有评分项要求。以JSON格式输出。`;

    // 4. 调用LLM生成内容
    try {
      const response = await this.model.invokeStreaming(prompt, '你是一位专业的标书内容编写专家，擅长撰写符合招标要求的高质量内容。请直接返回JSON格式结果。');

      const result = this.parseJSONResponse(response);
      this.validateContentResult(result);

      console.log(`[ContentGeneration] 章节内容生成成功: ${sectionTitle}`);
      return result;
    } catch (error) {
      console.error('[ContentGeneration] 章节内容生成失败:', error);
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
        console.error(`[ContentGeneration] 生成章节 ${section.id} 失败:`, error);
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
    const prompt = `你是标书内容优化专家。请根据用户反馈优化标书章节内容。

## 优化原则
1. 保持原有结构
2. 针对反馈问题进行修改
3. 保持专业性和规范性
4. 不增加新的引用来源

请输出优化后的完整内容（JSON格式）。

## 原有内容
${JSON.stringify(existingContent, null, 2)}

## 优化反馈
${feedback}

请输出优化后的完整内容。`;

    try {
      const response = await this.model.invokeStreaming(prompt, '你是一位标书内容优化专家。请直接返回JSON格式结果。');

      const result = this.parseJSONResponse(response);
      return result;
    } catch (error) {
      console.error('[ContentGeneration] 优化内容失败:', error);
      throw new Error(`优化内容失败: ${error instanceof Error ? error.message : '未知错误'}`);
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
      console.warn('[ContentGeneration] JSON已自动修复');
    }
    return result.data;
  }

  /**
   * 验证内容生成结果
   */
  private validateContentResult(result: any): void {
    if (!result.content) {
      throw new Error('内容生成结果缺少content');
    }

    if (!result.scoringResponse) {
      console.warn('[ContentGeneration] 内容生成结果缺少scoringResponse，使用默认值');
      result.scoringResponse = {
        scoringItemId: 'unknown',
        maxScore: 0,
        responseDetails: [],
      };
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
export function createContentGenerationService(): ContentGenerationService {
  return new ContentGenerationService();
}
