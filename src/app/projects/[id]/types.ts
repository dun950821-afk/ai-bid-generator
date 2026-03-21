/**
 * 项目详情页面类型定义
 */

// 项目信息
export interface Project {
  id: string;
  name: string;
  description: string;
  project_number: string;
  status: string;
  knowledge_base_id: string;
  metadata: {
    uploadedDocument?: {
      name: string;
      url: string;
      extracted: boolean;
      extractError?: string;
      uploadedAt?: string;
    };
    [key: string]: any;
  };
  created_at: string;
}

// 评分项
export interface ScoringItem {
  id: string;
  item_name: string;
  item_type: string;
  max_score: number;
  scoring_rules: Array<any>;
  response_status: string;
  chapter_id?: string;
}

// 风险项
export interface Risk {
  id: string;
  risk_type: string;
  risk_description: string;
  severity: string;
  response_status: string;
}

// 内容指南
export interface ContentGuide {
  mainPoints: string[];
  materialSuggestions: string[];
  knowledgeBaseQueries: string[];
}

// AI生成配置
export interface AIConfig {
  requirements: string;
  precautions: string;
  wordCount: number;
  referenceFiles?: string[];
}

// 章节
export interface Section {
  id: string;
  title: string;
  level?: number;
  order: number;
  parent_id?: string;
  isRequired?: boolean;
  sectionType?: 'technical' | 'business' | 'price' | 'basic';
  content?: string;
  status: string;
  scoring_item_ids?: string[];
  riskIds?: string[];
  contentGuide?: ContentGuide;
  aiConfig?: AIConfig;
  children?: Section[];
}

// 校验结果
export interface ValidationResult {
  overallScore: number;
  overallPassed: boolean;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

// 上传文档信息
export interface UploadedDocument {
  name: string;
  url: string;
  extracted: boolean;
  extractError?: string;
}

// 工作流步骤
export type WorkflowStepId = 'upload' | 'outline' | 'generate' | 'export';

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  shortLabel: string;
  icon: string;
  status: 'completed' | 'current' | 'pending' | 'error';
}

// 项目统计摘要
export interface ProjectSummary {
  totalScore: number;
  technicalScore: number;
  businessScore: number;
  priceScore: number;
  technicalCount: number;
  businessCount: number;
  priceCount: number;
  criticalRisks: number;
  highRisks: number;
  generatedCount: number;
  totalSections: number;
}

// 详情面板显示内容类型
export type DetailPanelType = 'scoring' | 'risk' | 'content' | 'guide' | null;

// 详情面板数据
export interface DetailPanelData {
  type: DetailPanelType;
  sectionId?: string;
  scoringItems?: ScoringItem[];
  risk?: Risk;
  content?: string;
}
