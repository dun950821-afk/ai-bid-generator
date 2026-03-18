/**
 * 招标文档提取Prompt模板
 * 基于完整的Schema设计，提取全面的招标文档信息
 */

export const SCORING_EXTRACTION_PROMPT = `
你是专业的招标文档信息提取专家，精通中国政府采购法和招投标相关法规。请从招标文档中提取完整结构化信息。

## 核心原则

1. **100%原文提取**：所有内容必须来自原文，不得修改、编造、概括
2. **严格Schema遵循**：严格按照给定的JSON Schema输出
3. **逐条提取**：列表类内容逐条对应原文提取，不得合并、遗漏、总结
4. **NULL处理**：原文无对应信息的字段设为null，不要填写"无"、"未提及"等

## JSON Schema

严格按照以下格式输出：

{
  "projectBasicInfo": {
    "projectName": "项目完整名称",
    "projectNumber": "项目编号/招标编号",
    "purchaseUnit": "采购单位全称",
    "purchaseUnitContact": "采购单位联系人",
    "purchaseUnitPhone": "采购单位电话",
    "purchaseUnitEmail": "采购单位邮箱",
    "purchaseUnitAddress": "采购单位地址",
    "projectType": "项目类型（货物/服务/工程）",
    "procurementMethod": "采购方式（公开招标/竞争性谈判等）",
    "projectBudget": "项目预算/控制价",
    "budgetSource": "资金来源",
    "projectCycle": "项目服务期限",
    "deliveryPeriod": "交付周期",
    "warrantyPeriod": "质保期"
  },
  "timeSchedule": {
    "bidPublishDate": "招标公告发布时间",
    "bidDocumentSaleStart": "招标文件发售开始时间",
    "bidDocumentSaleEnd": "招标文件发售结束时间",
    "questionDeadline": "提问截止时间",
    "answerPublishDate": "答疑发布时间",
    "siteVisitDate": "现场踏勘时间",
    "bidSubmissionDeadline": "投标截止时间",
    "bidOpeningDate": "开标时间",
    "bidOpeningLocation": "开标地点"
  },
  "coreTechDemand": {
    "systemUpgradeDemands": [
      {
        "moduleName": "模块/系统名称",
        "demandDetails": ["需求详情1", "需求详情2"]
      }
    ],
    "technicalParameters": [
      {
        "parameterName": "参数名称",
        "requiredValue": "要求值",
        "unit": "单位",
        "isKeyParameter": true,
        "deviationAllowed": false
      }
    ],
    "professionalTechRequirements": {
      "requirementDetails": ["专业技术要求1", "专业技术要求2"]
    },
    "techSolutionRequirements": ["技术方案编写要求1", "技术方案编写要求2"],
    "performanceRequirements": [
      {
        "requirementName": "性能指标名称",
        "requirementValue": "指标值"
      }
    ]
  },
  "businessRequirements": {
    "bidderQualification": {
      "basicQualification": ["基本资格要求1", "基本资格要求2"],
      "requiredCertificates": [
        {
          "certificateName": "证书名称",
          "certificateLevel": "证书等级",
          "isMandatory": true,
          "validityPeriod": "有效期要求"
        }
      ],
      "performanceRequirements": {
        "projectType": "项目类型",
        "projectCount": 3,
        "contractAmount": "合同金额要求",
        "timeLimit": "时间限制（如近三年）",
        "proofMaterials": ["证明材料1", "证明材料2"]
      },
      "personnelRequirements": [
        {
          "position": "岗位",
          "count": 1,
          "qualification": ["资质要求1", "资质要求2"]
        }
      ]
    },
    "serviceLocation": "服务地点",
    "serviceRequirements": ["服务要求1", "服务要求2"],
    "winnerCount": 1,
    "winnerSelectionMethod": "中标人确定方法",
    "paymentMethod": "付款方式",
    "paymentTerms": ["付款条款1", "付款条款2"],
    "bidSecurity": {
      "amount": "保证金金额",
      "paymentMethod": "缴纳方式",
      "deadline": "缴纳截止时间",
      "returnConditions": ["退还条件1", "退还条件2"]
    },
    "bidValidityPeriod": "投标有效期"
  },
  "scoringStandard": {
    "techScoring": {
      "totalScore": 40,
      "scoringItems": [
        {
          "itemName": "评分项名称",
          "itemCode": "评分项编码",
          "weight": "权重",
          "maxScore": 10,
          "scoreDetails": ["评分细则1", "评分细则2"],
          "scoringMethod": "评分方法说明"
        }
      ]
    },
    "businessScoring": {
      "totalScore": 30,
      "scoringItems": [
        {
          "itemName": "评分项名称",
          "maxScore": 10,
          "scoreDetails": ["评分细则1", "评分细则2"]
        }
      ]
    },
    "priceScoring": {
      "totalScore": 30,
      "scoringMethod": "价格评分方法",
      "formula": "计算公式（如有）"
    },
    "comprehensiveScoringNote": "综合评分说明"
  },
  "disqualificationRisks": [
    {
      "riskType": "否决条款",
      "description": "风险项描述",
      "sourceText": "原文内容",
      "severity": "critical"
    }
  ],
  "biddingDocumentRequirements": {
    "documentStructure": [
      {
        "volumeName": "册/卷名称",
        "sections": [
          {
            "sectionName": "章节名称",
            "requiredDocuments": ["需要的文件1", "需要的文件2"]
          }
        ]
      }
    ],
    "formatRequirements": {
      "bindingMethod": "装订方式",
      "copiesCount": 3,
      "electronicFormat": "电子版格式要求"
    },
    "sealingRequirements": ["密封要求1", "密封要求2"],
    "signatureRequirements": ["签字盖章要求1", "签字盖章要求2"],
    "submissionRequirements": {
      "submissionLocation": "递交地点",
      "submissionMethod": "递交方式",
      "deadline": "递交截止时间"
    }
  },
  "projectBackground": {
    "constructionBackground": "建设背景描述",
    "constructionGoals": ["建设目标1", "建设目标2"],
    "constructionScope": "建设范围",
    "currentStatus": "现状描述",
    "businessRequirements": ["业务需求1", "业务需求2"]
  },
  "otherImportantInfo": {
    "specialRequirements": ["特殊要求1", "特殊要求2"],
    "notes": ["注意事项1", "注意事项2"],
    "attachments": ["附件清单1", "附件清单2"]
  },
  "summary": {
    "totalScore": 100,
    "itemCount": 10,
    "riskCount": 5
  }
}

## 提取要点

### 1. 项目基本信息
完整提取项目名称、编号、采购单位、预算金额、服务期限等基础信息

### 2. 时间节点（非常重要）
- 投标截止时间（关键）
- 开标时间（关键）
- 招标文件发售时间
- 提问截止时间
- 答疑发布时间

### 3. 技术需求
- 系统功能需求：逐模块提取
- 技术参数要求：标注关键参数（通常标有"★"或"必须满足"）
- 专业技术能力要求
- 性能指标要求

### 4. 资格要求
- 基本资格要求
- 资质证书要求：证书名称、等级、是否必须
- 业绩要求：项目类型、数量、金额、时间限制
- 人员要求：岗位、人数、资质

### 5. 评分标准（核心）
- 技术评分：逐项提取评分项、分值、评分细则
- 商务评分：逐项提取评分项、分值、评分细则
- 价格评分：提取评分方法和计算公式

### 6. 废标条款（关键）
逐条提取废标情形，这对投标至关重要，不得遗漏任何一条

### 7. 投标文件要求
- 文件组成：逐册逐章节提取
- 格式要求：装订方式、份数、电子版格式
- 密封要求
- 签字盖章要求
- 递交要求

招标文档内容：
{documentContent}

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
`;

/**
 * 废标风险提取Prompt模板
 */
export const DISQUALIFICATION_RISK_EXTRACTION_PROMPT = `
你是专业的招标文档分析专家，精通政府采购和招投标相关法规。请从招标文档中提取所有可能导致废标的风险项。

## 风险类型识别

### 1. 否决条款 (critical)
关键词：否决、废标、无效投标、不予受理、拒绝投标

### 2. 资格要求 (high)
关键词：必须具备、应当具有、须持有、资格条件、资质要求

### 3. 格式要求 (medium)
关键词：格式要求、签字盖章、密封、递交、投标文件组成

### 4. 保证金要求 (high)
关键词：投标保证金、保证金金额、保证金形式、保证金退还

## JSON Schema

{
  "risks": [
    {
      "riskType": "否决条款",
      "riskDescription": "风险项描述",
      "sourceText": "原文内容",
      "severity": "critical"
    }
  ],
  "summary": {
    "totalRisks": 10,
    "criticalRisks": 3
  }
}

仅输出符合Schema的纯JSON内容。
`;

/**
 * 完整提取Prompt模板
 */
export const FULL_EXTRACTION_PROMPT = `
你是专业的招标文档分析专家。请从招标文档中提取完整结构化信息。

## 提取内容

### 1. 项目基本信息
项目名称、项目编号、采购单位、预算金额

### 2. 评分项
提取所有评分项，包括技术评分、商务评分、价格评分

### 3. 废标风险
识别所有可能导致废标的风险项

## JSON Schema

{
  "projectBasicInfo": {
    "projectName": "项目名称",
    "projectNumber": "项目编号"
  },
  "scoringItems": [...],
  "disqualificationRisks": [...]
}

仅输出符合Schema的纯JSON内容。
`;

/**
 * TypeScript类型定义
 */

// 项目基本信息
export interface ProjectBasicInfo {
  projectName: string | null;
  projectNumber: string | null;
  purchaseUnit: string | null;
  purchaseUnitContact: string | null;
  purchaseUnitPhone: string | null;
  purchaseUnitEmail: string | null;
  purchaseUnitAddress: string | null;
  projectType: string | null;
  procurementMethod: string | null;
  projectBudget: string | null;
  budgetSource: string | null;
  projectCycle: string | null;
  deliveryPeriod: string | null;
  warrantyPeriod: string | null;
}

// 时间节点
export interface TimeSchedule {
  bidPublishDate: string | null;
  bidDocumentSaleStart: string | null;
  bidDocumentSaleEnd: string | null;
  questionDeadline: string | null;
  answerPublishDate: string | null;
  siteVisitDate: string | null;
  bidSubmissionDeadline: string | null;
  bidOpeningDate: string | null;
  bidOpeningLocation: string | null;
}

// 技术需求条目
export interface TechDemandItem {
  moduleName: string;
  moduleCode?: string;
  demandDetails: string[];
  priority?: '必须' | '重要' | '一般';
}

// 技术参数要求
export interface TechnicalParameter {
  parameterName: string;
  requiredValue: string;
  unit?: string;
  isKeyParameter: boolean;
  deviationAllowed: boolean;
}

// 核心技术需求
export interface CoreTechDemand {
  systemUpgradeDemands: TechDemandItem[];
  technicalParameters: TechnicalParameter[];
  professionalTechRequirements: {
    requirementDetails: string[];
  };
  techSolutionRequirements: string[];
  performanceRequirements: {
    requirementName: string;
    requirementValue: string;
  }[];
}

// 投标人资格要求
export interface BidderQualification {
  basicQualification: string[];
  requiredCertificates: {
    certificateName: string;
    certificateLevel?: string;
    isMandatory: boolean;
    validityPeriod?: string;
  }[];
  performanceRequirements?: {
    projectType?: string;
    projectCount?: number;
    contractAmount?: string;
    timeLimit?: string;
    proofMaterials: string[];
  };
  personnelRequirements: {
    position: string;
    count: number;
    qualification: string[];
  }[];
}

// 商务要求
export interface BusinessRequirements {
  bidderQualification: BidderQualification;
  serviceLocation: string | null;
  serviceRequirements: string[];
  winnerCount: number | null;
  winnerSelectionMethod: string | null;
  paymentMethod: string | null;
  paymentTerms: string[];
  bidSecurity: {
    amount: string | null;
    paymentMethod: string | null;
    deadline: string | null;
    returnConditions: string[];
  };
  bidValidityPeriod: string | null;
}

// 评分项
export interface ScoringItem {
  itemName: string;
  itemCode?: string;
  weight: string;
  maxScore: number;
  scoreDetails: string[];
  scoringMethod?: string;
}

// 评分标准
export interface ScoringStandard {
  techScoring: {
    totalScore: number;
    scoringItems: ScoringItem[];
  };
  businessScoring: {
    totalScore: number;
    scoringItems: ScoringItem[];
  };
  priceScoring: {
    totalScore: number;
    scoringMethod: string;
    formula?: string;
  };
  comprehensiveScoringNote: string | null;
}

// 废标风险
export interface DisqualificationRisk {
  riskType: string;
  description: string;
  sourceText: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// 投标文件要求
export interface BiddingDocumentRequirements {
  documentStructure: {
    volumeName: string;
    sections: {
      sectionName: string;
      requiredDocuments: string[];
    }[];
  }[];
  formatRequirements: {
    bindingMethod: string | null;
    copiesCount: number | null;
    electronicFormat: string | null;
  };
  sealingRequirements: string[];
  signatureRequirements: string[];
  submissionRequirements: {
    submissionLocation: string | null;
    submissionMethod: string | null;
    deadline: string | null;
  };
}

// 项目背景
export interface ProjectBackground {
  constructionBackground: string | null;
  constructionGoals: string[];
  constructionScope: string | null;
  currentStatus: string | null;
  businessRequirements: string[];
}

// 其他重要信息
export interface OtherImportantInfo {
  specialRequirements: string[];
  notes: string[];
  attachments: string[];
}

// 完整提取结果
export interface TenderDocumentExtractionResult {
  projectBasicInfo: ProjectBasicInfo;
  timeSchedule: TimeSchedule;
  coreTechDemand: CoreTechDemand;
  businessRequirements: BusinessRequirements;
  scoringStandard: ScoringStandard;
  disqualificationRisks: DisqualificationRisk[];
  biddingDocumentRequirements: BiddingDocumentRequirements;
  projectBackground: ProjectBackground;
  otherImportantInfo: OtherImportantInfo;
  summary: {
    totalScore: number;
    itemCount: number;
    riskCount: number;
  };
}
