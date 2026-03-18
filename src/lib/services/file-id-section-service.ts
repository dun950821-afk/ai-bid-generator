/**
 * 基于文件ID的章节内容生成服务
 * 使用百炼平台的file_id引用原始招标文档，结合知识库素材生成章节内容
 */

import { getLLMFileService, LLMFile } from './llm-file-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 章节内容生成结果
 */
export interface SectionGenerationResult {
  sectionId: string;
  sectionTitle: string;
  content: string;
  scoringResponse: {
    scoringItemId: string;
    maxScore: number;
    responseDetails: Array<{
      rule: string;
      response: string;
      evidence: string;
      expectedScore: number;
    }>;
  };
  citations: Array<{
    id: string;
    type: 'qualification' | 'case' | 'technical' | 'tender_doc' | 'other';
    source: string;
    content: string;
  }>;
  metadata: {
    wordCount: number;
    citationCount: number;
    sourceType: 'file_id' | 'text';
    generationTimeMs: number;
  };
}

/**
 * 基于文件ID的章节生成服务
 */
export class FileIdSectionService {
  /**
   * 生成章节内容
   * @param projectId 项目ID
   * @param sectionId 章节ID
   * @param sectionTitle 章节标题
   * @param scoringItems 评分项列表
   * @param fileId 百炼文件ID（引用招标文档）
   * @param knowledgeContext 知识库上下文（企业素材）
   * @param risks 风险列表
   * @param customInstructions 自定义指令
   */
  async generateSectionContent(
    projectId: string,
    sectionId: string,
    sectionTitle: string,
    scoringItems: Array<{
      id: string;
      itemName: string;
      maxScore: number;
      scoringRules?: string[];
    }>,
    fileId: string,
    knowledgeContext?: string,
    risks?: Array<{ severity: string; riskDescription: string }>,
    customInstructions?: string
  ): Promise<SectionGenerationResult> {
    const startTime = Date.now();
    const llmFileService = getLLMFileService();

    console.log(`[FileIdSection] 开始生成章节: ${sectionTitle}`);
    console.log(`[FileIdSection] fileId: ${fileId}`);
    console.log(`[FileIdSection] 评分项数量: ${scoringItems.length}`);

    // 检查文件是否可用
    const fileAvailable = await llmFileService.checkFileAvailable(fileId);
    if (!fileAvailable) {
      throw new Error(`文件ID不可用: ${fileId}，请重新上传招标文档`);
    }

    // 构建生成提示
    const task = this.buildSectionTask(
      sectionTitle,
      scoringItems,
      knowledgeContext,
      risks,
      customInstructions
    );

    // 使用 file_id 调用 LLM
    try {
      const result = await llmFileService.analyzeWithFileId(fileId, task);

      // 处理结果
      const content = result.content || result.mainContent || '';
      const citations = result.citations || [];
      
      // 添加招标文档引用标记
      citations.unshift({
        id: 'tender-doc',
        type: 'tender_doc',
        source: '招标文件',
        content: '基于招标文档原始内容生成',
      });

      const generationTimeMs = Date.now() - startTime;
      console.log(`[FileIdSection] 生成完成，耗时: ${generationTimeMs}ms，字数: ${content.length}`);

      return {
        sectionId,
        sectionTitle,
        content,
        scoringResponse: result.scoringResponse || {
          scoringItemId: scoringItems[0]?.id || '',
          maxScore: scoringItems.reduce((sum, item) => sum + item.maxScore, 0),
          responseDetails: [],
        },
        citations,
        metadata: {
          wordCount: content.length,
          citationCount: citations.length,
          sourceType: 'file_id',
          generationTimeMs,
        },
      };
    } catch (error) {
      console.error(`[FileIdSection] 生成失败:`, error);
      throw error;
    }
  }

  /**
   * 构建章节生成任务提示
   */
  private buildSectionTask(
    sectionTitle: string,
    scoringItems: Array<{
      id: string;
      itemName: string;
      maxScore: number;
      scoringRules?: string[];
    }>,
    knowledgeContext?: string,
    risks?: Array<{ severity: string; riskDescription: string }>,
    customInstructions?: string
  ): string {
    const totalScore = scoringItems.reduce((sum, item) => sum + item.maxScore, 0);
    const estimatedWords = Math.max(1000, totalScore * 50);

    // 构建评分项文本
    const scoringItemsText = scoringItems.map((item, idx) => {
      const weight = totalScore > 0 ? ((item.maxScore / totalScore) * 100).toFixed(1) : 0;
      const rules = item.scoringRules || [];
      const rulesText = rules.length > 0
        ? rules.map((r, i) => `${i + 1}. ${r}`).join('\n   ')
        : '按招标文件要求执行';

      return `
### 评分项 ${idx + 1}：${item.itemName}
- **分值**：${item.maxScore}分（权重${weight}%）
- **评分细则**：
   ${rulesText}
`;
    }).join('\n');

    // 构建风险文本
    const riskText = risks && risks.length > 0
      ? risks.slice(0, 5).map(r =>
          `- ⚠️ [${r.severity.toUpperCase()}] ${r.riskDescription}`
        ).join('\n')
      : '无特定风险提示';

    // 构建知识库上下文
    const contextText = knowledgeContext
      ? `\n## 企业素材参考（可选择性使用）

${knowledgeContext}

`
      : '';

    return `你是一位专业的标书编写专家，正在为项目撰写"${sectionTitle}"章节。

## 核心任务

请基于招标文档内容，撰写本章节内容。本章对应评分项总分为 **${totalScore}分**。

## 评分项详情（必须完整响应，确保获得满分）

${scoringItemsText}

## 废标风险提示（注意规避）

${riskText}
${contextText}
## 内容要求

1. **字数要求**：约${estimatedWords}字
2. **风格要求**：专业严谨，数据支撑，避免空话套话
3. **结构要求**：层次分明，每个评分细则独立成段落
4. **量化要求**：每项承诺需有明确指标
5. **响应要求**：确保完整响应招标文件中的相关要求

## 输出格式

请以JSON格式输出：
{
  "content": "章节正文内容（Markdown格式）",
  "scoringResponse": {
    "scoringItemId": "评分项ID",
    "maxScore": 总分,
    "responseDetails": [
      {
        "rule": "评分细则",
        "response": "响应内容摘要",
        "evidence": "支撑证据",
        "expectedScore": 预期得分
      }
    ]
  },
  "citations": [
    {
      "type": "引用类型",
      "source": "引用来源",
      "content": "引用内容摘要"
    }
  ]
}

## 自定义要求
${customInstructions || '无额外要求'}

请开始撰写章节内容：`;
  }

  /**
   * 批量生成章节内容
   */
  async batchGenerateSections(
    projectId: string,
    sections: Array<{
      id: string;
      title: string;
      type: string;
      scoringItemIds: string[];
    }>,
    fileId: string,
    scoringItemsMap: Map<string, any>,
    knowledgeContext?: string,
    onProgress?: (sectionId: string, progress: number) => void
  ): Promise<SectionGenerationResult[]> {
    const results: SectionGenerationResult[] = [];
    const total = sections.length;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const progress = Math.round(((i + 1) / total) * 100);

      // 获取该章节相关的评分项
      const relatedScoringItems = section.scoringItemIds
        .map(id => scoringItemsMap.get(id))
        .filter(Boolean)
        .map(item => ({
          id: item.id,
          itemName: item.item_name || item.itemName,
          maxScore: item.max_score || item.maxScore,
          scoringRules: item.scoring_rules || item.scoringRules,
        }));

      if (relatedScoringItems.length === 0) {
        console.log(`[FileIdSection] 章节 ${section.title} 无评分项，跳过`);
        continue;
      }

      try {
        onProgress?.(section.id, progress);
        
        const result = await this.generateSectionContent(
          projectId,
          section.id,
          section.title,
          relatedScoringItems,
          fileId,
          knowledgeContext,
          undefined,
          undefined
        );

        results.push(result);

        // 避免API限流，添加间隔
        if (i < sections.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`[FileIdSection] 章节 ${section.title} 生成失败:`, error);
      }
    }

    return results;
  }
}

// 单例实例
let fileIdSectionServiceInstance: FileIdSectionService | null = null;

/**
 * 获取服务实例
 */
export function getFileIdSectionService(): FileIdSectionService {
  if (!fileIdSectionServiceInstance) {
    fileIdSectionServiceInstance = new FileIdSectionService();
  }
  return fileIdSectionServiceInstance;
}

/**
 * 创建新实例
 */
export function createFileIdSectionService(): FileIdSectionService {
  return new FileIdSectionService();
}
