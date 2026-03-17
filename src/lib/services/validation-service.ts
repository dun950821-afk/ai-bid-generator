/**
 * 内容校验服务
 * 检查标书内容的合规性、完整性、一致性
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';

/**
 * 校验类型
 */
export type ValidationType =
  | 'compliance'       // 合规校验
  | 'score_coverage'   // 评分覆盖校验
  | 'logic_consistency' // 逻辑一致性校验
  | 'disqualification'  // 废标风险校验
  | 'citation';        // 引用校验

/**
 * 问题严重程度
 */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 校验问题
 */
export interface ValidationIssue {
  severity: IssueSeverity;
  type: string;
  description: string;
  location?: string;
  suggestion?: string;
  relatedItemId?: string;
  relatedRiskId?: string;
}

/**
 * 校验结果
 */
export interface ValidationResult {
  validationType: ValidationType;
  passed: boolean;
  score: number;
  issues: ValidationIssue[];
  details: Record<string, any>;
}

/**
 * 校验报告
 */
export interface ValidationReport {
  projectId: string;
  overallScore: number;
  overallPassed: boolean;
  results: ValidationResult[];
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  criticalIssuesList: ValidationIssue[];
  suggestions: string[];
}

/**
 * 内容校验服务类
 */
export class ContentValidationService {
  private llmClient: LLMClient;
  private model: string;

  constructor() {
    const config = new Config();
    this.llmClient = new LLMClient(config);
    this.model = 'doubao-seed-1-6-thinking-250715';
  }

  /**
   * 执行完整校验
   */
  async validate(
    projectId: string,
    content: Record<string, any>,
    scoringItems: any[],
    risks: any[]
  ): Promise<ValidationReport> {
    const results: ValidationResult[] = [];

    // 1. 合规校验
    const complianceResult = await this.validateCompliance(content, risks);
    results.push(complianceResult);

    // 2. 评分覆盖校验
    const coverageResult = await this.validateScoreCoverage(content, scoringItems);
    results.push(coverageResult);

    // 3. 逻辑一致性校验
    const consistencyResult = await this.validateLogicConsistency(content);
    results.push(consistencyResult);

    // 4. 废标风险响应校验
    const riskResult = await this.validateDisqualificationRisks(content, risks);
    results.push(riskResult);

    // 5. 引用校验
    const citationResult = await this.validateCitations(content);
    results.push(citationResult);

    // 汇总问题
    const allIssues: ValidationIssue[] = [];
    results.forEach((r) => allIssues.push(...r.issues));

    const criticalIssuesList = allIssues.filter((i) => i.severity === 'critical');
    const criticalCount = allIssues.filter((i) => i.severity === 'critical').length;
    const highCount = allIssues.filter((i) => i.severity === 'high').length;
    const mediumCount = allIssues.filter((i) => i.severity === 'medium').length;
    const lowCount = allIssues.filter((i) => i.severity === 'low').length;

    // 计算总分
    const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const overallPassed = criticalCount === 0 && overallScore >= 80;

    // 生成建议
    const suggestions = this.generateSuggestions(allIssues);

    return {
      projectId,
      overallScore,
      overallPassed,
      results,
      totalIssues: allIssues.length,
      criticalIssues: criticalCount,
      highIssues: highCount,
      mediumIssues: mediumCount,
      lowIssues: lowCount,
      criticalIssuesList,
      suggestions,
    };
  }

  /**
   * 合规校验
   */
  private async validateCompliance(
    content: Record<string, any>,
    risks: any[]
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    let score = 100;

    // 检查是否响应了所有否决条款
    const criticalRisks = risks.filter((r) => r.severity === 'critical');
    for (const risk of criticalRisks) {
      const hasResponse = this.checkRiskResponse(content, risk);
      if (!hasResponse) {
        issues.push({
          severity: 'critical',
          type: 'compliance',
          description: `未响应否决条款：${risk.risk_description}`,
          relatedRiskId: risk.id,
          suggestion: '必须对否决条款进行明确响应，否则将被废标',
        });
        score -= 20;
      }
    }

    // 检查是否包含必要的资质证明引用
    const qualificationSections = this.findQualificationSections(content);
    if (qualificationSections.length === 0) {
      issues.push({
        severity: 'high',
        type: 'compliance',
        description: '缺少企业资质章节或资质证明引用',
        suggestion: '添加企业资质章节并引用相关资质证书',
      });
      score -= 10;
    }

    return {
      validationType: 'compliance',
      passed: issues.filter((i) => i.severity === 'critical').length === 0,
      score: Math.max(0, score),
      issues,
      details: {
        criticalRisksChecked: criticalRisks.length,
        criticalRisksResponded: criticalRisks.filter((r) =>
          this.checkRiskResponse(content, r)
        ).length,
      },
    };
  }

  /**
   * 评分覆盖校验
   */
  private async validateScoreCoverage(
    content: Record<string, any>,
    scoringItems: any[]
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    let score = 100;

    // 计算总分
    const totalScore = scoringItems.reduce((sum, item) => sum + item.max_score, 0);
    const coveredScore = scoringItems
      .filter((item) => this.checkScoringItemCoverage(content, item))
      .reduce((sum, item) => sum + item.max_score, 0);

    const coverageRate = totalScore > 0 ? (coveredScore / totalScore) * 100 : 0;

    // 检查未覆盖的评分项
    const uncoveredItems = scoringItems.filter(
      (item) => !this.checkScoringItemCoverage(content, item)
    );

    for (const item of uncoveredItems) {
      issues.push({
        severity: item.max_score >= 10 ? 'high' : 'medium',
        type: 'coverage',
        description: `评分项未覆盖：${item.item_name}（${item.max_score}分）`,
        relatedItemId: item.id,
        suggestion: `添加内容响应此评分项，确保获得满分`,
      });
    }

    // 根据覆盖率计算分数
    score = coverageRate;

    return {
      validationType: 'score_coverage',
      passed: coverageRate >= 100,
      score,
      issues,
      details: {
        totalScoringItems: scoringItems.length,
        coveredScoringItems: scoringItems.length - uncoveredItems.length,
        totalScore,
        coveredScore,
        coverageRate,
      },
    };
  }

  /**
   * 逻辑一致性校验
   */
  private async validateLogicConsistency(
    content: Record<string, any>
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    let score = 100;

    // 检查时间线一致性
    const timelineIssues = this.checkTimelineConsistency(content);
    issues.push(...timelineIssues);

    // 检查数据一致性
    const dataIssues = this.checkDataConsistency(content);
    issues.push(...dataIssues);

    // 检查引用一致性
    const referenceIssues = this.checkReferenceConsistency(content);
    issues.push(...referenceIssues);

    // 根据问题数量扣分
    score -= issues.length * 5;

    return {
      validationType: 'logic_consistency',
      passed: issues.filter((i) => i.severity === 'critical').length === 0,
      score: Math.max(0, score),
      issues,
      details: {
        timelineIssues: timelineIssues.length,
        dataIssues: dataIssues.length,
        referenceIssues: referenceIssues.length,
      },
    };
  }

  /**
   * 废标风险响应校验
   */
  private async validateDisqualificationRisks(
    content: Record<string, any>,
    risks: any[]
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    let score = 100;

    // 按风险等级检查响应情况
    const riskLevels = ['critical', 'high', 'medium', 'low'];
    const weights = { critical: 25, high: 15, medium: 10, low: 5 };

    for (const level of riskLevels) {
      const levelRisks = risks.filter((r) => r.severity === level);
      for (const risk of levelRisks) {
        const hasResponse = this.checkRiskResponse(content, risk);
        if (!hasResponse) {
          issues.push({
            severity: level as IssueSeverity,
            type: 'risk_response',
            description: `风险项未响应：${risk.risk_description}`,
            relatedRiskId: risk.id,
            suggestion: this.getRiskResponseSuggestion(risk),
          });
          score -= weights[level as keyof typeof weights];
        }
      }
    }

    return {
      validationType: 'disqualification',
      passed: issues.filter((i) => i.severity === 'critical').length === 0,
      score: Math.max(0, score),
      issues,
      details: {
        totalRisks: risks.length,
        respondedRisks: risks.filter((r) => this.checkRiskResponse(content, r)).length,
      },
    };
  }

  /**
   * 引用校验
   */
  private async validateCitations(
    content: Record<string, any>
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    let score = 100;

    // 提取所有引用
    const citations = this.extractCitations(content);

    // 检查引用格式
    const invalidCitations = citations.filter((c) => !this.isValidCitationFormat(c));
    for (const citation of invalidCitations) {
      issues.push({
        severity: 'medium',
        type: 'citation',
        description: `引用格式不规范：${citation}`,
        suggestion: '使用标准引用格式：【引用：来源名称】',
      });
    }

    // 检查引用是否过多
    const citationCount = citations.length;
    const wordCount = this.estimateWordCount(content);
    const citationRatio = wordCount > 0 ? citationCount / (wordCount / 100) : 0;

    if (citationRatio > 10) {
      issues.push({
        severity: 'low',
        type: 'citation',
        description: '引用数量过多，可能影响原创性',
        suggestion: '适当减少引用，增加原创分析内容',
      });
    } else if (citationRatio < 1 && wordCount > 500) {
      issues.push({
        severity: 'low',
        type: 'citation',
        description: '引用数量过少，可能缺乏证据支撑',
        suggestion: '适当增加引用，用证据支撑论述',
      });
    }

    return {
      validationType: 'citation',
      passed: issues.filter((i) => i.severity === 'high').length === 0,
      score: Math.max(0, score),
      issues,
      details: {
        citationCount,
        wordCount,
        citationRatio,
      },
    };
  }

  // 辅助方法

  private checkRiskResponse(content: any, risk: any): boolean {
    // 简化实现：检查内容中是否包含风险描述的关键词
    const contentStr = JSON.stringify(content);
    const keywords = risk.risk_description.split(/\s+/).slice(0, 3);
    return keywords.some((keyword: string) => contentStr.includes(keyword));
  }

  private checkScoringItemCoverage(content: any, item: any): boolean {
    // 简化实现：检查内容中是否包含评分项名称
    const contentStr = JSON.stringify(content);
    return contentStr.includes(item.item_name);
  }

  private findQualificationSections(content: any): any[] {
    // 简化实现：查找包含"资质"关键词的章节
    const sections: any[] = [];
    const contentStr = JSON.stringify(content);
    if (contentStr.includes('资质')) {
      sections.push({ type: 'qualification' });
    }
    return sections;
  }

  private checkTimelineConsistency(content: any): ValidationIssue[] {
    // 简化实现
    return [];
  }

  private checkDataConsistency(content: any): ValidationIssue[] {
    // 简化实现
    return [];
  }

  private checkReferenceConsistency(content: any): ValidationIssue[] {
    // 简化实现
    return [];
  }

  private extractCitations(content: any): string[] {
    const contentStr = JSON.stringify(content);
    const regex = /【引用：[^】]+】/g;
    return contentStr.match(regex) || [];
  }

  private isValidCitationFormat(citation: string): boolean {
    return /^【引用：[^】]+】$/.test(citation);
  }

  private estimateWordCount(content: any): number {
    const contentStr = JSON.stringify(content);
    return contentStr.length / 2;
  }

  private getRiskResponseSuggestion(risk: any): string {
    const suggestions: Record<string, string> = {
      '否决条款': '必须明确声明已满足该条款要求，并提供相关证明材料',
      '资格要求': '提供符合要求的资质证明文件，并明确说明符合情况',
      '格式要求': '按照招标文件要求的格式编制相关内容',
      '保证金要求': '明确说明已按要求缴纳保证金，并提供缴纳凭证',
    };
    return suggestions[risk.risk_type] || '对此风险项进行明确响应';
  }

  private generateSuggestions(issues: ValidationIssue[]): string[] {
    const suggestions: string[] = [];

    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      suggestions.push(`【紧急】修复${criticalIssues.length}个致命问题，否则可能被废标`);
    }

    const highIssues = issues.filter((i) => i.severity === 'high');
    if (highIssues.length > 0) {
      suggestions.push(`【重要】解决${highIssues.length}个高风险问题，提高中标概率`);
    }

    const coverageIssues = issues.filter((i) => i.type === 'coverage');
    if (coverageIssues.length > 0) {
      suggestions.push(`【建议】补充${coverageIssues.length}个未覆盖的评分项内容`);
    }

    return suggestions;
  }
}

/**
 * 创建内容校验服务实例
 */
export function createContentValidationService(): ContentValidationService {
  return new ContentValidationService();
}
