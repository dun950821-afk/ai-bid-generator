/**
 * 评分项相关类型定义
 */

export type ScoringItemType = 'technical' | 'business' | 'price';
export type ResponseStatus = 'pending' | 'responded' | 'verified';
export type ResponseQuality = 'full' | 'partial' | 'none';

/**
 * 评分细则
 */
export interface ScoringRule {
  rule: string;        // 细则内容
  score?: number;      // 该细则的分值
  description?: string; // 详细说明
}

/**
 * 评分项
 */
export interface ScoringItem {
  id: string;
  projectId: string;

  // 基本信息
  itemName: string;
  itemCode?: string;
  itemType: ScoringItemType;
  parentItemId?: string;

  // 分值
  maxScore: number;
  weight?: number;  // 权重百分比

  // 评分细则
  scoringRules: ScoringRule[];

  // 响应状态
  responseStatus: ResponseStatus;
  responseQuality?: ResponseQuality;

  // 关联章节
  chapterId?: string;

  // 元数据
  extractedFrom?: string;
  confidenceScore?: number;

  createdAt: Date;
  updatedAt: Date;

  // 关联信息（非数据库字段）
  chapterTitle?: string;
  parentItemName?: string;
  childrenCount?: number;
}

/**
 * 创建评分项请求
 */
export interface CreateScoringItemRequest {
  itemName: string;
  itemCode?: string;
  itemType: ScoringItemType;
  parentItemId?: string;
  maxScore: number;
  weight?: number;
  scoringRules: ScoringRule[];
  extractedFrom?: string;
  confidenceScore?: number;
}

/**
 * 更新评分项请求
 */
export interface UpdateScoringItemRequest {
  responseStatus?: ResponseStatus;
  responseQuality?: ResponseQuality;
  chapterId?: string;
}

/**
 * 评分项覆盖报告
 */
export interface ScoringCoverageReport {
  projectId: string;
  totalItems: number;
  respondedItems: number;
  fullResponseItems: number;
  coverageRate: number;
  qualityRate: number;

  // 按类型统计
  technicalStats: {
    total: number;
    responded: number;
    maxScore: number;
    respondedScore: number;
  };
  businessStats: {
    total: number;
    responded: number;
    maxScore: number;
    respondedScore: number;
  };
  priceStats: {
    total: number;
    responded: number;
    maxScore: number;
    respondedScore: number;
  };

  // 未覆盖的评分项
  uncoveredItems: ScoringItem[];
  partialItems: ScoringItem[];
}

/**
 * 评分项汇总
 */
export interface ScoringSummary {
  totalScore: number;
  technicalScore: number;
  businessScore: number;
  priceScore: number;
  itemCount: number;
  technicalItemCount: number;
  businessItemCount: number;
  priceItemCount: number;
}

/**
 * 废标风险相关类型定义
 */

export type RiskType = '否决条款' | '资格要求' | '格式要求' | '保证金要求' | '其他';
export type RiskStatus = 'unresponded' | 'responded' | 'verified';
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 废标风险
 */
export interface DisqualificationRisk {
  id: string;
  projectId: string;

  // 风险信息
  riskType: RiskType;
  riskDescription: string;
  sourceText?: string;
  sourceLocation?: string;

  // 响应状态
  responseStatus: RiskStatus;
  responseContent?: string;
  respondedAt?: Date;

  // 风险等级
  severity: RiskSeverity;

  // 元数据
  extractedFrom?: string;
  confidenceScore?: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建废标风险请求
 */
export interface CreateDisqualificationRiskRequest {
  riskType: RiskType;
  riskDescription: string;
  sourceText?: string;
  sourceLocation?: string;
  severity: RiskSeverity;
  extractedFrom?: string;
  confidenceScore?: number;
}

/**
 * 更新废标风险请求
 */
export interface UpdateDisqualificationRiskRequest {
  responseStatus: RiskStatus;
  responseContent: string;
}

/**
 * 废标风险汇总
 */
export interface RiskSummary {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  unrespondedRisks: number;
  respondedRisks: number;
  verifiedRisks: number;
}

/**
 * 校验相关类型定义
 */

export type ValidationType = 'compliance' | 'score_coverage' | 'logic_consistency' | 'disqualification' | 'citation';
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
  id: string;
  projectId: string;
  documentId?: string;

  // 校验类型
  validationType: ValidationType;

  // 校验结果
  passed: boolean;
  score: number;

  // 问题列表
  issues: ValidationIssue[];

  // 校验详情
  details: Record<string, any>;

  // 元数据
  validatedAt: Date;
  validatorVersion?: string;
}

/**
 * 校验报告
 */
export interface ValidationReport {
  projectId: string;
  overallScore: number;
  overallPassed: boolean;

  results: ValidationResult[];

  // 问题汇总
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;

  // 关键问题
  criticalIssuesList: ValidationIssue[];

  // 建议
  suggestions: string[];

  validatedAt: Date;
}

/**
 * 提取相关类型定义
 */

/**
 * 评分项提取结果
 */
export interface ScoringExtractionResult {
  scoringItems: CreateScoringItemRequest[];
  summary: ScoringSummary;
  extractionConfidence: number;
}

/**
 * 废标风险提取结果
 */
export interface RiskExtractionResult {
  risks: CreateDisqualificationRiskRequest[];
  summary: RiskSummary;
  extractionConfidence: number;
}

/**
 * 完整提取结果
 */
export interface FullExtractionResult {
  // 项目基本信息
  projectBasicInfo: any;

  // 评分项
  scoringItems: CreateScoringItemRequest[];
  scoringSummary: ScoringSummary;

  // 废标风险
  risks: CreateDisqualificationRiskRequest[];
  riskSummary: RiskSummary;

  // 时间节点
  timeSchedule: any;

  // 技术需求
  technicalRequirements: any;

  // 商务要求
  businessRequirements: any;

  // 合规要求
  complianceRequirements: any;

  // 元数据
  extractionMetadata: {
    extractionTime: string;
    documentName: string;
    documentPages: number;
    extractionModel: string;
    confidenceScore: number;
  };
}
