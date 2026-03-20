/**
 * 招标文档提取 Schema 类型定义
 * 严格按照 AI-Bid-TENDER-EXTRACTION-SCHEMA.md 规范实现
 */

/**
 * 提取元数据
 */
export interface ExtractionMetadata {
  extraction_time: string;            // 提取时间
  document_name: string;              // 文档名称
  document_pages: number;             // 文档页数
  extraction_model: string;           // 提取模型
  confidence_score: number;           // 置信度分数 (0-1)
}

/**
 * 项目基本信息
 */
export interface ProjectBasicInfo {
  // 项目标识
  project_name: string | null;          // 项目完整名称
  project_number: string | null;        // 项目编号/招标编号
  
  // 采购方信息
  purchase_unit: string | null;         // 采购单位全称
  purchase_unit_contact: string | null; // 采购单位联系人
  purchase_unit_phone: string | null;   // 采购单位电话
  purchase_unit_email: string | null;   // 采购单位邮箱
  purchase_unit_address: string | null; // 采购单位地址
  
  // 项目属性
  project_type: string | null;          // 项目类型（货物/服务/工程）
  procurement_method: string | null;    // 采购方式（公开招标/竞争性谈判等）
  
  // 资金信息
  project_budget: string | null;        // 项目预算/控制价
  budget_source: string | null;         // 资金来源
  budget_approval: string | null;       // 预算批复文号
  
  // 时间周期
  project_cycle: string | null;         // 项目服务期限
  delivery_period: string | null;       // 交付周期
  warranty_period: string | null;       // 质保期
}

/**
 * 技术需求条目
 */
export interface TechDemandItem {
  module_name: string;                  // 模块/系统名称
  module_code?: string;                 // 模块编码
  demand_details: string[];             // 需求详情列表
  priority?: '必须' | '重要' | '一般';  // 重要程度
}

/**
 * 技术参数要求
 */
export interface TechnicalParameter {
  parameter_name: string;               // 参数名称
  required_value: string;               // 要求值
  unit?: string;                        // 单位
  is_key_parameter: boolean;            // 是否关键参数
  deviation_allowed: boolean;           // 是否允许偏离
}

/**
 * 核心技术需求
 */
export interface CoreTechDemand {
  // 系统功能需求
  system_upgrade_demands: TechDemandItem[];  // 系统升级需求
  
  // 技术参数要求
  technical_parameters: TechnicalParameter[]; // 技术参数列表
  
  // 专业技术能力
  professional_tech_requirements: {
    requirement_details: string[];      // 专业技术要求详情
  };
  
  // 技术方案要求
  tech_solution_requirements: string[]; // 技术方案编写要求
  
  // 性能指标
  performance_requirements: {
    requirement_name: string;
    requirement_value: string;
  }[];
}

/**
 * 投标人资格要求
 */
export interface BidderQualification {
  // 基本资格
  basic_qualification: string[];        // 基本资格要求
  
  // 资质证书
  required_certificates: {
    certificate_name: string;           // 证书名称
    certificate_level?: string;         // 证书等级
    is_mandatory: boolean;              // 是否必须
    validity_period?: string;           // 有效期要求
  }[];
  
  // 业绩要求
  performance_requirements: {
    project_type?: string;              // 项目类型
    project_count?: number;             // 项目数量
    contract_amount?: string;           // 合同金额要求
    time_limit?: string;                // 时间限制
    proof_materials: string[];          // 证明材料
  } | null;
  
  // 人员要求
  personnel_requirements: {
    position: string;                   // 岗位
    count: number;                      // 人数
    qualification: string[];            // 资质要求
  }[];
}

/**
 * 商务要求
 */
export interface BusinessRequirements {
  // 投标人资格
  bidder_qualification: BidderQualification;
  
  // 服务要求
  service_location: string | null;      // 服务地点
  service_requirements: string[];       // 服务要求列表
  
  // 中标人数量
  winner_count: number | null;          // 中标人数量
  winner_selection_method: string | null; // 中标人确定方法
  
  // 付款方式
  payment_method: string | null;        // 付款方式
  payment_terms: string[];              // 付款条款
  
  // 保证金
  bid_security: {
    amount: string | null;              // 保证金金额
    payment_method: string | null;      // 缴纳方式
    deadline: string | null;            // 缴纳截止时间
    return_conditions: string[];        // 退还条件
  };
  
  // 投标有效期
  bid_validity_period: string | null;   // 投标有效期
}

/**
 * 评分项
 */
export interface ScoringItem {
  item_name: string;                    // 评分项名称
  item_code?: string;                   // 评分项编码
  weight: string;                       // 权重（百分比或分值）
  max_score: number;                    // 满分值
  score_details: string[];              // 评分细则
  scoring_method?: string;              // 评分方法
}

/**
 * 评分细则项（新格式 - 支持evidence字段）
 */
export interface EvaluationCriteriaItem {
  subItem: string;                      // 评分细项名称
  itemScore: number;                    // 该细项的分值
  rule: string;                         // 评分规则原文描述
  evidence?: string;                    // 🌟评分依据/证明材料（V3新增）
  basis?: string;                       // 评分依据（兼容旧字段）
  techDocRef?: string | null;           // 技术文档引用
}

/**
 * 评分大类（新格式）
 */
export interface EvaluationCriteria {
  seq: number;                          // 序号
  category: string;                     // 评分大类名称
  totalScore: number;                   // 该大类的总分值
  categoryType: 'technical' | 'business' | 'price';  // 大类类型
  items: EvaluationCriteriaItem[];      // 该大类下的评分细项数组
}

/**
 * 评分标准（新格式）
 */
export interface ScoringStandardNew {
  evaluationCriteria: EvaluationCriteria[];  // 评分标准列表
}

/**
 * 评分标准
 */
export interface ScoringStandard {
  // 技术评分
  tech_scoring: {
    total_score: number;                // 技术总分
    scoring_items: ScoringItem[];       // 评分项列表
  };
  
  // 商务评分
  business_scoring: {
    total_score: number;                // 商务总分
    scoring_items: ScoringItem[];       // 评分项列表
  };
  
  // 价格评分
  price_scoring: {
    total_score: number;                // 价格总分
    scoring_method: string;             // 价格评分方法
    formula?: string;                   // 计算公式
  };
  
  // 综合评分说明
  comprehensive_scoring_note: string | null; // 综合评分说明
}

/**
 * 时间节点
 */
export interface TimeSchedule {
  // 招标时间
  bid_publish_date: string | null;      // 招标公告发布时间
  bid_document_sale_start: string | null; // 招标文件发售开始时间
  bid_document_sale_end: string | null;   // 招标文件发售结束时间
  
  // 答疑时间
  question_deadline: string | null;     // 提问截止时间
  answer_publish_date: string | null;   // 答疑发布时间
  site_visit_date: string | null;       // 现场踏勘时间
  
  // 投标时间
  bid_submission_deadline: string | null; // 投标截止时间
  bid_opening_date: string | null;        // 开标时间
  bid_opening_location: string | null;    // 开标地点
  
  // 评标时间
  evaluation_period: string | null;     // 评标周期
  result_publicity_date: string | null; // 结果公示时间
}

/**
 * 关键合规要求
 */
export interface ComplianceRequirement {
  // 废标条款
  disqualification_rules: string[];     // 废标情形列表
  
  // 重大偏离
  major_deviation_rules: string[];      // 重大偏离情形
  
  // 投标限制
  bid_restrictions: string[];           // 投标限制条款
  
  // 诚信要求
  integrity_requirements: string[];      // 诚信要求
  
  // 法律合规
  legal_compliance: string[];           // 法律合规要求
}

/**
 * 投标文件要求
 */
export interface BiddingDocumentRequirement {
  // 文件组成
  document_structure: {
    volume_name: string;                // 册/卷名称
    sections: {
      section_name: string;             // 章节名称
      required_documents: string[];     // 需要的文件
    }[];
  }[];
  
  // 格式要求
  format_requirements: {
    binding_method: string | null;      // 装订方式
    copies_count: number | null;        // 份数
    electronic_format: string | null;   // 电子版格式
  };
  
  // 密封要求
  sealing_requirements: string[];       // 密封要求
  
  // 签章要求
  signature_requirements: string[];     // 签字盖章要求
  
  // 递交要求
  submission_requirements: {
    submission_location: string | null; // 递交地点
    submission_method: string | null;   // 递交方式
    deadline: string | null;            // 递交截止时间
  };
}

/**
 * 项目背景信息
 */
export interface ProjectBackground {
  // 建设背景
  construction_background: string | null; // 建设背景描述
  
  // 建设目标
  construction_goals: string[];         // 建设目标列表
  
  // 建设范围
  construction_scope: string | null;    // 建设范围
  
  // 现状描述
  current_status: string | null;        // 现状描述
  
  // 业务需求
  business_requirements: string[];      // 业务需求列表
}

/**
 * 其他重要信息
 */
export interface OtherImportantInfo {
  special_requirements: string[];       // 特殊要求
  notes: string[];                      // 注意事项
  attachments: string[];                // 附件清单
}

/**
 * 招标文档提取完整结果
 * 严格按照 Schema 规范定义
 */
export interface TenderDocumentExtractionResult {
  // 元数据
  extraction_metadata: ExtractionMetadata;
  
  // 项目背景
  project_background: ProjectBackground;
  
  // 项目基本信息
  project_basic_info: ProjectBasicInfo;
  
  // 时间节点
  time_schedule: TimeSchedule;
  
  // 核心技术需求
  core_tech_demand: CoreTechDemand;
  
  // 商务要求
  business_requirements: BusinessRequirements;
  
  // 评分标准
  scoring_standard: ScoringStandard;
  
  // 关键合规要求
  key_compliance_requirements: ComplianceRequirement;
  
  // 投标文件要求
  bidding_document_requirements: BiddingDocumentRequirement;
  
  // 其他重要信息
  other_important_info: OtherImportantInfo;
}

/**
 * 创建空的提取结果（用于初始化）
 */
export function createEmptyExtractionResult(
  documentName: string,
  documentPages: number = 0,
  extractionModel: string = 'unknown'
): TenderDocumentExtractionResult {
  return {
    extraction_metadata: {
      extraction_time: new Date().toISOString(),
      document_name: documentName,
      document_pages: documentPages,
      extraction_model: extractionModel,
      confidence_score: 0,
    },
    project_background: {
      construction_background: null,
      construction_goals: [],
      construction_scope: null,
      current_status: null,
      business_requirements: [],
    },
    project_basic_info: {
      project_name: null,
      project_number: null,
      purchase_unit: null,
      purchase_unit_contact: null,
      purchase_unit_phone: null,
      purchase_unit_email: null,
      purchase_unit_address: null,
      project_type: null,
      procurement_method: null,
      project_budget: null,
      budget_source: null,
      budget_approval: null,
      project_cycle: null,
      delivery_period: null,
      warranty_period: null,
    },
    time_schedule: {
      bid_publish_date: null,
      bid_document_sale_start: null,
      bid_document_sale_end: null,
      question_deadline: null,
      answer_publish_date: null,
      site_visit_date: null,
      bid_submission_deadline: null,
      bid_opening_date: null,
      bid_opening_location: null,
      evaluation_period: null,
      result_publicity_date: null,
    },
    core_tech_demand: {
      system_upgrade_demands: [],
      technical_parameters: [],
      professional_tech_requirements: {
        requirement_details: [],
      },
      tech_solution_requirements: [],
      performance_requirements: [],
    },
    business_requirements: {
      bidder_qualification: {
        basic_qualification: [],
        required_certificates: [],
        performance_requirements: null,
        personnel_requirements: [],
      },
      service_location: null,
      service_requirements: [],
      winner_count: null,
      winner_selection_method: null,
      payment_method: null,
      payment_terms: [],
      bid_security: {
        amount: null,
        payment_method: null,
        deadline: null,
        return_conditions: [],
      },
      bid_validity_period: null,
    },
    scoring_standard: {
      tech_scoring: {
        total_score: 0,
        scoring_items: [],
      },
      business_scoring: {
        total_score: 0,
        scoring_items: [],
      },
      price_scoring: {
        total_score: 0,
        scoring_method: '',
      },
      comprehensive_scoring_note: null,
    },
    key_compliance_requirements: {
      disqualification_rules: [],
      major_deviation_rules: [],
      bid_restrictions: [],
      integrity_requirements: [],
      legal_compliance: [],
    },
    bidding_document_requirements: {
      document_structure: [],
      format_requirements: {
        binding_method: null,
        copies_count: null,
        electronic_format: null,
      },
      sealing_requirements: [],
      signature_requirements: [],
      submission_requirements: {
        submission_location: null,
        submission_method: null,
        deadline: null,
      },
    },
    other_important_info: {
      special_requirements: [],
      notes: [],
      attachments: [],
    },
  };
}
