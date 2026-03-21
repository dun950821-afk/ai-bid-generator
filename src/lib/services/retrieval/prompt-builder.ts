/**
 * 结构化Prompt构建器
 * @description 构建优化的章节生成Prompt，包含系统角色、上下文、要求等
 */

import {
  Section,
  ScoringItem,
  Risk,
  StructuredPrompt,
  EnhancedContextResult,
} from './types';

/**
 * 结构化Prompt构建器
 * 目标: 构建清晰、专业的Prompt，引导LLM生成高质量内容
 */
export class StructuredPromptBuilder {
  /**
   * 构建完整Prompt
   */
  buildPrompt(
    section: Section,
    scoringItems: ScoringItem[],
    risks: Risk[],
    writingNotes: string[],
    enhancedContext: EnhancedContextResult,
    customInstructions: string = ''
  ): StructuredPrompt {
    const totalScore = scoringItems.reduce(
      (sum, item) => sum + (item.max_score || 0),
      0
    );
    const estimatedWords = Math.max(2000, totalScore * 60);

    // ===== System Message =====
    const systemMessage = this.buildSystemMessage(section, totalScore, estimatedWords);

    // ===== Context Message =====
    const contextMessage = this.buildContextMessage(enhancedContext);

    // ===== Requirements Message =====
    const requirementsMessage = this.buildRequirementsMessage(
      section,
      scoringItems,
      risks,
      writingNotes,
      totalScore,
      customInstructions
    );

    // ===== User Message =====
    const userMessage = this.buildUserMessage(section, totalScore);

    return {
      systemMessage,
      contextMessage,
      requirementsMessage,
      userMessage,
      metadata: {
        totalScore,
        estimatedWords,
        scoringItemCount: scoringItems.length,
        riskCount: risks.length,
        contextTokenCount: enhancedContext.totalTokens,
      },
    };
  }

  /**
   * 构建系统消息
   */
  private buildSystemMessage(
    section: Section,
    totalScore: number,
    estimatedWords: number
  ): string {
    // 使用完整编号作为章节标题
    const sectionTitle = section.fullNumber 
      ? `${section.fullNumber} ${section.title.replace(/^[一二三四五六七八九十]+、\s*/, '').replace(/^[\d.）]+\s*/, '')}`
      : section.title;

    return `你是一位资深的标书编写专家，拥有丰富的投标文件撰写经验。

## 角色定位
你正在为项目撰写"${sectionTitle}"章节，需要确保内容专业、准确、有说服力。

## 输出要求
1. **字数**: 约${estimatedWords}字（根据评分项分值${totalScore}分估算）
2. **格式**: Markdown格式，层次清晰，便于阅读
3. **引用**: 使用提供的引用ID标注来源，格式如 [S1-1] 或 [G1] 或 [R1]
4. **准确性**: 只使用提供的参考资料，不编造数据或案例
5. **专业性**: 使用行业术语，避免空话套话，每项承诺需有依据

## 章节标题编号规范（必须严格遵守）

当前章节完整标题为：${sectionTitle}

章节编号规则：
- 一级标题：中文数字，如 ## 一、投标函、## 二、技术方案
- 二级标题：阿拉伯数字带父章节号，如 ## 1.1 项目概述、## 2.1 系统架构
- 三级标题：三位阿拉伯数字，如 ## 1.1.1 项目背景、## 2.1.1 总体架构
- 四级标题：四位阿拉伯数字，如 ## 1.1.1.1 详细说明、## 2.1.1.1 技术选型
- 五级标题：括号数字，如 ## 1）具体要求、## 2）实施步骤

示例结构：
\`\`\`
## 一、投标函                    （一级）
### 1.1 投标函正文              （二级）
#### 1.1.1 投标承诺            （三级）

## 二、技术方案                  （一级）
### 2.1 系统架构设计            （二级）
#### 2.1.1 总体架构             （三级）
##### 2.1.1.1 架构图说明        （四级）
###### 1）架构要点说明          （五级）
###### 2）技术实现细节          （五级）
\`\`\`

## 评分响应原则
- 每个评分细则都需要独立成段落
- 每项承诺需有明确指标和数据支撑
- 引用参考资料支撑论述
- 确保评审专家能快速找到响应内容

## 写作风格
- 专业严谨，数据准确
- 结构清晰，逻辑严密
- 突出优势，有说服力
- 规避风险提示中的问题`;
  }

  /**
   * 构建上下文消息
   */
  private buildContextMessage(enhancedContext: EnhancedContextResult): string {
    return `## 参考资料

以下是为你提供的参考资料，已按评分项分组。请根据这些资料撰写章节内容。

${enhancedContext.formatteContext}

---
**重要提示**: 请优先使用引用ID标注每条数据的来源，确保内容可追溯。`;
  }

  /**
   * 构建要求消息
   */
  private buildRequirementsMessage(
    section: Section,
    scoringItems: ScoringItem[],
    risks: Risk[],
    writingNotes: string[],
    totalScore: number,
    customInstructions: string
  ): string {
    const scoringText = this.formatScoringItems(scoringItems, totalScore);
    const riskText = this.formatRisks(risks);
    const notesText = this.formatWritingNotes(writingNotes);
    const contentGuideText = this.formatContentGuide(section);
    const customText = customInstructions
      ? `\n---\n\n## 自定义要求\n\n${customInstructions}`
      : '';

    return `## 章节要求

本章对应评分项共 **${totalScore}分**，请确保完整响应以下所有评分项，争取获得满分。

---

${contentGuideText}

---

${scoringText}

---

## 风险提示（必须规避）

${riskText}

---

## 编写注意点

${notesText}
${customText}`;
  }

  /**
   * 格式化内容指导
   */
  private formatContentGuide(section: Section): string {
    if (!section.contentGuide) {
      return '';
    }

    const { mainPoints, materialSuggestions, knowledgeBaseQueries } = section.contentGuide;
    const parts: string[] = [];

    if (mainPoints && mainPoints.length > 0) {
      parts.push(`### 📋 编写要点\n\n${mainPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
    }

    if (materialSuggestions && materialSuggestions.length > 0) {
      parts.push(`### 📁 素材建议\n\n${materialSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
    }

    if (knowledgeBaseQueries && knowledgeBaseQueries.length > 0) {
      parts.push(`### 🔍 检索关键词\n\n${knowledgeBaseQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
    }

    return parts.length > 0 ? parts.join('\n\n---\n\n') + '\n\n---' : '';
  }

  /**
   * 格式化评分项
   */
  private formatScoringItems(
    scoringItems: ScoringItem[],
    totalScore: number
  ): string {
    if (scoringItems.length === 0) {
      return '本章节暂无直接对应的评分项，请根据招标文件要求撰写。';
    }

    return scoringItems
      .map((item, idx) => {
        const weight =
          totalScore > 0
            ? ((item.max_score / totalScore) * 100).toFixed(1)
            : '0';
        const rules = item.scoring_rules || [];

        const rulesText =
          rules.length > 0
            ? rules
                .map((r, i) => {
                  const text = typeof r === 'string' ? r : r.description || r;
                  const score =
                    typeof r === 'object' && 'score' in r
                      ? ` (${r.score}分)`
                      : '';
                  return `   ${i + 1}. ${text}${score}`;
                })
                .join('\n')
            : '   （详见招标文件要求，确保完整响应）';

        return `### 评分项 ${idx + 1}: ${item.item_name}

**分值**: ${item.max_score}分（权重${weight}%）

**评分细则**:
${rulesText}

**响应要求**: 必须针对每条评分细则提供具体、可量化的响应内容。`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * 格式化风险提示
   */
  private formatRisks(risks: Risk[]): string {
    if (risks.length === 0) {
      return '暂无特定风险提示。';
    }

    return risks
      .slice(0, 5)
      .map((r) => {
        const icon =
          r.severity === 'critical'
            ? '🚨'
            : r.severity === 'high'
            ? '⚠️'
            : 'ℹ️';
        return `- ${icon} [${r.severity.toUpperCase()}] ${r.risk_description}`;
      })
      .join('\n');
  }

  /**
   * 格式化编写注意点
   */
  private formatWritingNotes(writingNotes: string[]): string {
    if (writingNotes.length === 0) {
      return '暂无特殊注意点。';
    }

    return writingNotes.map((n) => `- 💡 ${n}`).join('\n');
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(section: Section, totalScore: number): string {
    // 使用完整编号作为章节标题
    const sectionTitle = section.fullNumber 
      ? `${section.fullNumber} ${section.title.replace(/^[一二三四五六七八九十]+、\s*/, '').replace(/^[\d.）]+\s*/, '')}`
      : section.title;

    // 获取章节层级，用于确定内部子标题的起始层级
    const level = section.level || 1;
    
    // 计算内部子标题应该使用的层级（比当前章节深一级）
    const subHeaderLevel = level + 1;

    // 根据子标题层级生成格式示例
    let subHeaderFormat = '';
    if (subHeaderLevel === 2) {
      subHeaderFormat = `### 1.1 [子标题名称]`;
    } else if (subHeaderLevel === 3) {
      subHeaderFormat = `#### 1.1.1 [子标题名称]`;
    } else if (subHeaderLevel === 4) {
      subHeaderFormat = `##### 1.1.1.1 [子标题名称]`;
    } else if (subHeaderLevel >= 5) {
      subHeaderFormat = `###### 1）[子标题名称]`;
    } else {
      subHeaderFormat = `### [子标题名称]`;
    }

    return `请根据以上参考资料和要求，撰写"${sectionTitle}"章节内容。

## 核心要求

1. **完整响应**: 确保所有评分细则都有对应内容，争取${totalScore}分满分
2. **引用标注**: 使用引用ID（如[S1-1]）标注数据来源
3. **风险规避**: 注意规避风险提示中的问题
4. **结构清晰**: 使用Markdown格式，层次分明，便于评审专家阅读

## 输出格式

请直接输出章节内容，章节标题格式：

\`\`\`
## ${sectionTitle}

[本章节的主要内容...]

${subHeaderFormat}
[子章节内容...]
\`\`\`

**重要提示**：
1. 章节主标题已确定为"## ${sectionTitle}"
2. 章节内部的子标题请使用正确的编号格式
3. 内容需要有层次结构，便于评审专家阅读

请开始撰写：`;
  }

  /**
   * 构建用于LLM调用的消息数组
   */
  buildMessages(prompt: StructuredPrompt): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> {
    return [
      { role: 'system', content: prompt.systemMessage },
      { role: 'user', content: prompt.contextMessage },
      { role: 'user', content: prompt.requirementsMessage },
      { role: 'user', content: prompt.userMessage },
    ];
  }
}

/**
 * 创建Prompt构建器实例
 */
export function createStructuredPromptBuilder(): StructuredPromptBuilder {
  return new StructuredPromptBuilder();
}
