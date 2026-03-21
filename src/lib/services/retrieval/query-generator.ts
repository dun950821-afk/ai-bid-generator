/**
 * 深度查询生成器
 * @description 根据章节、评分细则、风险因素生成多个精准检索查询
 */

import {
  QueryItem,
  QueryPlan,
  QueryType,
  Section,
  ScoringItem,
  Risk,
} from './types';

/**
 * 深度查询生成器
 * 目标: 为每个评分细则生成多个精准查询，最大化召回率
 */
export class DeepQueryGenerator {
  // 停用词集合
  private stopWords: Set<string>;

  constructor() {
    // 初始化停用词
    this.stopWords = new Set([
      // 常见停用词
      '的', '和', '与', '或', '等', '及', '应', '须', '需', '要',
      '能', '可', '将', '对', '为', '在', '是', '有', '中', '上',
      '下', '不', '这', '那', '之', '所', '以', '而', '且', '但',
      // 招标文件常见词
      '要求', '规定', '按照', '依据', '根据', '符合', '满足', '具备',
      '提供', '提交', '完成', '实现', '确保', '保证', '承诺', '响应',
    ]);
  }

  /**
   * 生成完整查询计划
   * @param section 章节信息
   * @param scoringItems 评分项列表
   * @param risks 风险因素列表
   * @param writingNotes 编写注意点
   * @returns 查询计划
   */
  generateQueryPlan(
    section: Section,
    scoringItems: ScoringItem[],
    risks: Risk[],
    writingNotes: string[] = []
  ): QueryPlan {
    const queries: QueryItem[] = [];
    let queryId = 0;

    // 计算总分
    const totalScore = scoringItems.reduce((sum, item) => sum + (item.max_score || 0), 0);

    // ===== 1. 章节主题查询 =====
    queries.push({
      id: `Q${++queryId}`,
      query: section.title,
      purpose: '章节主题概览',
      type: 'topic',
      weight: 1.0,
    });

    // ===== 2. 评分细则查询 =====
    for (let i = 0; i < scoringItems.length; i++) {
      const item = scoringItems[i];
      const itemWeight = totalScore > 0 ? item.max_score / totalScore : 1 / scoringItems.length;
      const rules = item.scoring_rules || [];

      // 2.1 评分项名称查询
      queries.push({
        id: `Q${++queryId}`,
        query: `${section.title} ${item.item_name}`,
        purpose: `评分项${i + 1}: ${item.item_name}`,
        type: 'scoring_item',
        scoringItemId: item.id,
        weight: itemWeight,
      });

      // 2.2 每个评分细则的详细查询
      for (let j = 0; j < rules.length; j++) {
        const rule = rules[j];
        const ruleText = typeof rule === 'string' ? rule : rule.description || '';
        const keywords = this.extractKeywords(ruleText);

        if (keywords.length > 0) {
          queries.push({
            id: `Q${++queryId}`,
            query: `${section.title} ${item.item_name} ${keywords.slice(0, 5).join(' ')}`,
            purpose: `评分项${i + 1}-细则${j + 1}: ${ruleText.substring(0, 30)}...`,
            type: 'scoring_rule',
            scoringItemId: item.id,
            ruleIndex: j,
            weight: itemWeight * 0.8,
          });
        }
      }

      // 2.3 实施案例查询
      queries.push({
        id: `Q${++queryId}`,
        query: `${item.item_name} 实施案例 成功案例 项目经验`,
        purpose: `评分项${i + 1}: 实施案例`,
        type: 'case_study',
        scoringItemId: item.id,
        weight: 0.5,
      });

      // 2.4 数据指标查询
      queries.push({
        id: `Q${++queryId}`,
        query: `${item.item_name} 数据指标 量化标准 考核指标 KPI`,
        purpose: `评分项${i + 1}: 数据指标`,
        type: 'metrics',
        scoringItemId: item.id,
        weight: 0.5,
      });
    }

    // ===== 3. 风险规避查询 =====
    for (let i = 0; i < Math.min(risks.length, 5); i++) {
      const risk = risks[i];
      const keywords = risk.keywords || this.extractKeywords(risk.risk_description);

      queries.push({
        id: `Q${++queryId}`,
        query: `${section.title} ${risk.risk_description} ${keywords.slice(0, 3).join(' ')}`,
        purpose: `风险规避: ${risk.risk_description.substring(0, 30)}...`,
        type: 'risk',
        riskId: risk.id,
        weight: 0.6,
      });
    }

    // ===== 4. 编写注意点查询 =====
    for (let i = 0; i < Math.min(writingNotes.length, 5); i++) {
      const note = writingNotes[i];
      const keywords = this.extractKeywords(note);

      queries.push({
        id: `Q${++queryId}`,
        query: `${section.title} ${keywords.slice(0, 5).join(' ')}`,
        purpose: `编写注意点: ${note.substring(0, 30)}...`,
        type: 'writing_note',
        weight: 0.4,
      });
    }

    // ===== 5. 相关法规标准查询 =====
    queries.push({
      id: `Q${++queryId}`,
      query: `${section.title} 相关法规 国家标准 行业标准 规范 要求`,
      purpose: '相关法规标准',
      type: 'regulation',
      weight: 0.3,
    });

    // ===== 6. 技术方案查询 =====
    queries.push({
      id: `Q${++queryId}`,
      query: `${section.title} 技术方案 解决方案 实施方案 技术路线`,
      purpose: '技术方案参考',
      type: 'case_study',
      weight: 0.4,
    });

    // ===== 7. 质量保证查询 =====
    queries.push({
      id: `Q${++queryId}`,
      query: `${section.title} 质量保证 质量控制 验收标准 验收流程`,
      purpose: '质量保证参考',
      type: 'metrics',
      weight: 0.3,
    });

    return {
      totalQueries: queries.length,
      queries,
      metadata: {
        sectionId: section.id,
        scoringItemCount: scoringItems.length,
        riskCount: risks.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 提取关键词
   * @param text 文本内容
   * @returns 关键词列表
   */
  extractKeywords(text: string): string[] {
    if (!text) return [];

    // 匹配中文词汇（2-6字）
    const matches = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];

    // 过滤停用词并计算词频
    const wordFreq = new Map<string, number>();
    for (const word of matches) {
      if (!this.stopWords.has(word) && word.length >= 2) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    // 按词频排序返回前10个
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 生成查询摘要
   */
  summarizeQueryPlan(plan: QueryPlan): string {
    const typeCount = new Map<QueryType, number>();
    for (const q of plan.queries) {
      typeCount.set(q.type, (typeCount.get(q.type) || 0) + 1);
    }

    const summary = Array.from(typeCount.entries())
      .map(([type, count]) => `${type}: ${count}个`)
      .join(', ');

    return `查询计划: 共${plan.totalQueries}个查询 (${summary})`;
  }
}

/**
 * 创建查询生成器实例
 */
export function createQueryGenerator(): DeepQueryGenerator {
  return new DeepQueryGenerator();
}
