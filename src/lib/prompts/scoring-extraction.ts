/**
 * 招标文档提取Prompt模板（完整版 - 基于TenderExtractionSchema）
 */

/**
 * 分段提取Prompt - 项目基本信息（完整版）
 * 包含项目标识、采购方信息、项目属性、资金信息、时间周期
 */
export const EXTRACT_PROJECT_INFO_PROMPT = `
你是专业的招标文档信息提取专家。从招标文档中提取项目基本信息。

## 提取规则
1. **100%原文提取**：所有内容必须来自原文，不得修改、编造、概括
2. **null处理**：原文无对应信息的字段设为null，不要填写"无"、"未提及"等
3. **时间格式**：保持原文格式，如"2024年3月1日 17:00"
4. **金额格式**：保持原文格式，如"人民币伍佰万元整"或"500万元"

## 输出JSON格式
{
  "projectName": "项目完整名称",
  "projectNumber": "项目编号/招标编号",
  "purchaseUnit": "采购单位全称",
  "purchaseUnitContact": "采购单位联系人",
  "purchaseUnitPhone": "采购单位电话",
  "purchaseUnitEmail": "采购单位邮箱",
  "purchaseUnitAddress": "采购单位地址",
  "projectType": "项目类型（货物/服务/工程）",
  "procurementMethod": "采购方式（公开招标/竞争性谈判/询价等）",
  "projectBudget": "项目预算/控制价",
  "budgetSource": "资金来源",
  "budgetApproval": "预算批复文号",
  "projectCycle": "项目服务期限",
  "deliveryPeriod": "交付周期",
  "warrantyPeriod": "质保期"
}

招标文档:
{documentContent}

输出JSON（仅输出JSON，不要任何解释）:
`;

/**
 * 分段提取Prompt - 时间节点（完整版）
 * 包含招标时间、答疑时间、投标时间、评标时间
 */
export const EXTRACT_TIME_SCHEDULE_PROMPT = `
你是专业的招标文档信息提取专家。从招标文档中提取时间节点信息。

## 提取规则
1. **时间格式**：保持原文格式，包含日期和时间（如有）
2. **null处理**：原文无对应信息的字段设为null
3. **重点关注**：投标截止时间、开标时间是关键时间，务必准确提取

## 输出JSON格式
{
  "bidPublishDate": "招标公告发布时间",
  "bidDocumentSaleStart": "招标文件发售开始时间",
  "bidDocumentSaleEnd": "招标文件发售结束时间",
  "questionDeadline": "提问截止时间",
  "answerPublishDate": "答疑发布时间",
  "siteVisitDate": "现场踏勘时间",
  "bidSubmissionDeadline": "投标截止时间（关键时间）",
  "bidOpeningDate": "开标时间（关键时间）",
  "bidOpeningLocation": "开标地点",
  "evaluationPeriod": "评标周期",
  "resultPublicityDate": "结果公示时间"
}

招标文档:
{documentContent}

输出JSON（仅输出JSON，不要任何解释）:
`;

/**
 * 分段提取Prompt - 项目背景（新增）
 * 包含建设背景、建设目标、建设范围、现状描述、业务需求
 */
export const EXTRACT_PROJECT_BACKGROUND_PROMPT = `
你是专业的招标文档信息提取专家。从招标文档中提取项目背景信息。

## 提取规则
1. **完整性**：项目背景通常位于招标文档开头的"项目概况"或"项目背景"章节
2. **原文提取**：保持原文表述，不要概括或改写
3. **列表提取**：建设目标、业务需求如有多个，逐条提取

## 输出JSON格式
{
  "constructionBackground": "建设背景描述",
  "constructionGoals": ["建设目标1", "建设目标2"],
  "constructionScope": "建设范围",
  "currentStatus": "现状描述",
  "businessRequirements": ["业务需求1", "业务需求2"]
}

招标文档:
{documentContent}

输出JSON（仅输出JSON，不要任何解释）:
`;

/**
 * 分段提取Prompt - 评分标准（简化版V3）
 * 宽松匹配，只要涉及评分、分值的内容都提取
 */
export const EXTRACT_SCORING_PROMPT = `
你是招标文档评分标准提取助手。请从文档中提取所有与"评分"、"评审"、"分值"相关的内容。

## 提取原则
1. **宽松匹配**：只要出现"分"、"评分"、"评审"、"得分"等关键词就提取
2. **保持原文**：评分规则和依据保持原文表述
3. **宁可多提取**：不要遗漏任何可能有分值的内容

## 关键词提示
查找以下关键词所在的段落和表格：
- "评分"、"评分标准"、"评分细则"、"评分办法"
- "评审"、"评审标准"、"评审内容"
- "技术分"、"商务分"、"价格分"
- 带数字+分的内容，如"5分"、"10分"、"（20分）"
- "得X分"、"满分X分"、"最高X分"

## 输出格式
{
  "evaluationCriteria": [
    {
      "seq": 1,
      "category": "评分类别名称（如：技术评分、商务评分、价格评分）",
      "totalScore": 30,
      "categoryType": "technical",
      "items": [
        {
          "subItem": "评分项名称",
          "itemScore": 5,
          "rule": "评分规则原文",
          "basis": "证明材料要求",
          "techDocRef": null
        }
      ]
    }
  ]
}

## categoryType 分类
- technical: 技术、方案、人员、案例相关
- business: 商务、资质、服务承诺相关  
- price: 价格、报价相关

## 示例输入
"技术评分（60分）：1. 技术方案（30分）：方案完整详细得20-30分，方案一般得10-19分。2. 项目团队（20分）：项目经理有PMP证书得10分，团队成员有相关资质得10分。3. 企业资质（10分）：有ISO9001认证得5分，有CMMI认证得5分。"

## 示例输出
{
  "evaluationCriteria": [
    {
      "seq": 1,
      "category": "技术评分",
      "totalScore": 60,
      "categoryType": "technical",
      "items": [
        {
          "subItem": "技术方案",
          "itemScore": 30,
          "rule": "方案完整详细得20-30分，方案一般得10-19分",
          "basis": null,
          "techDocRef": null
        },
        {
          "subItem": "项目团队",
          "itemScore": 20,
          "rule": "项目经理有PMP证书得10分，团队成员有相关资质得10分",
          "basis": null,
          "techDocRef": null
        },
        {
          "subItem": "企业资质",
          "itemScore": 10,
          "rule": "有ISO9001认证得5分，有CMMI认证得5分",
          "basis": null,
          "techDocRef": null
        }
      ]
    }
  ]
}

## 重要提示
1. 如果文档中有任何带分值的内容，都要提取
2. 如果找不到评分标准，返回 {"evaluationCriteria": []}
3. 只输出JSON，不要其他解释

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 分段提取Prompt - 废标风险（简化版V3）
 * 宽松匹配，提取所有可能导致投标失败的风险条款
 */
export const EXTRACT_RISKS_PROMPT = `
你是招标文档风险分析助手。请从文档中提取所有可能导致投标失败或废标的条款。

## 提取原则
1. **宽松匹配**：任何涉及"废标"、"无效"、"否决"、"拒绝"、"不予"的内容都提取
2. **保持原文**：sourceText必须完整保留原文
3. **宁可多提取**：不要遗漏任何风险条款

## 关键词提示
查找以下关键词所在的段落：
- "废标"、"无效投标"、"否决投标"、"拒绝投标"
- "不予受理"、"不予评审"、"按无效标处理"
- "必须"、"应当"、"不得"、"严禁"
- "资质"、"资格"、"证书"、"证明"
- "签字"、"盖章"、"密封"、"递交"
- "逾期"、"截止"、"过期"

## 风险类型
- 资格性：资质、证书、业绩等资格要求
- 符合性：文件格式、签字盖章、密封等要求
- 技术性：技术参数、技术方案等要求
- 商务性：报价、保证金、服务期等要求
- 程序性：递交时间、方式等程序要求

## 严重程度
- critical：直接导致废标
- high：极可能导致废标
- medium：可能导致扣分或不通过
- low：轻微问题

## 输出格式
[
  {
    "riskType": "资格性",
    "description": "简明扼要的风险描述",
    "sourceText": "原文完整条款",
    "severity": "critical"
  }
]

## 示例输入
"有下列情形之一的，其投标将被否决：1. 未按规定缴纳投标保证金的；2. 投标文件未经法定代表人签字或加盖公章的；3. 投标报价超过采购预算的。"

## 示例输出
[
  {
    "riskType": "商务性",
    "description": "未按规定缴纳投标保证金",
    "sourceText": "未按规定缴纳投标保证金的，其投标将被否决",
    "severity": "critical"
  },
  {
    "riskType": "符合性",
    "description": "投标文件未经法定代表人签字或加盖公章",
    "sourceText": "投标文件未经法定代表人签字或加盖公章的，其投标将被否决",
    "severity": "critical"
  },
  {
    "riskType": "商务性",
    "description": "投标报价超过采购预算",
    "sourceText": "投标报价超过采购预算的，其投标将被否决",
    "severity": "critical"
  }
]

## 重要提示
1. 如果找不到风险条款，返回空数组 []
2. 只输出JSON数组，不要其他解释

招标文档:
{documentContent}

输出JSON数组:
`;

/**
 * 分段提取Prompt - 商务要求（完整版）
 * 包含投标人资格、服务要求、中标人信息、付款方式、保证金、投标有效期
 */
export const EXTRACT_BUSINESS_PROMPT = `
你是专业的招标文档信息提取专家。从招标文档中提取商务要求信息。

## 提取规则
1. **资格要求**：逐条提取基本资格要求，不得遗漏
2. **资质证书**：提取证书名称、等级、是否必须
3. **业绩要求**：提取项目类型、数量、金额、时间限制、证明材料
4. **人员要求**：提取岗位、人数、资质要求
5. **保证金**：提取金额、缴纳方式、缴纳截止、退还条件
6. **中标人信息**：提取中标人数量、确定方法
7. **付款方式**：提取付款条款

## 输出JSON格式
{
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
        "position": "岗位名称",
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
}

招标文档:
{documentContent}

输出JSON（仅输出JSON，不要任何解释）:
`;

/**
 * 分段提取Prompt - 技术需求（完整版）
 * 包含系统功能需求、技术参数要求、专业技术能力、技术方案要求、性能指标
 */
export const EXTRACT_TECH_PROMPT = `
你是专业的招标文档信息提取专家。从招标文档中提取技术需求信息。

## 提取规则
1. **系统功能需求**：按模块提取，每个模块的需求逐条列出
2. **技术参数**：提取参数名称、要求值、单位，标注是否关键参数（通常带★或"必须满足"）
3. **性能指标**：提取性能要求名称和指标值
4. **技术方案要求**：提取对技术方案编写的要求
5. **优先级**：标注需求的重要程度（必须/重要/一般）

## 输出JSON格式
{
  "systemUpgradeDemands": [
    {
      "moduleName": "模块/系统名称",
      "moduleCode": "模块编码",
      "demandDetails": ["需求详情1", "需求详情2"],
      "priority": "必须|重要|一般"
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
}

招标文档:
{documentContent}

输出JSON（仅输出JSON，不要任何解释）:
`;

/**
 * 分段提取Prompt - 投标文件要求（完整版）
 * 包含文件组成、格式要求、密封要求、签章要求、递交要求
 */
export const EXTRACT_DOCUMENT_PROMPT = `
你是专业的招标文档信息提取专家。从招标文档中提取投标文件要求信息。

## 提取规则
1. **文件组成**：按册/卷提取，每卷包含章节和需要的文件
2. **格式要求**：提取装订方式、份数、电子版格式
3. **密封要求**：逐条提取密封要求
4. **签章要求**：逐条提取签字盖章要求
5. **递交要求**：提取递交地点、方式、截止时间

## 输出JSON格式
{
  "documentStructure": [
    {
      "volumeName": "册/卷名称（如第一册：商务标）",
      "sections": [
        {
          "sectionName": "章节名称",
          "requiredDocuments": ["需要文件1", "需要文件2"]
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
}

招标文档:
{documentContent}

输出JSON（仅输出JSON，不要任何解释）:
`;

/**
 * 分段提取Prompt - 其他重要信息（新增）
 * 包含特殊要求、注意事项、附件清单
 */
export const EXTRACT_OTHER_INFO_PROMPT = `
你是专业的招标文档信息提取专家。从招标文档中提取其他重要信息。

## 提取规则
1. **特殊要求**：文档中的特殊要求或特别说明
2. **注意事项**：投标人需要注意的事项
3. **附件清单**：招标文档附带的附件列表

## 输出JSON格式
{
  "specialRequirements": ["特殊要求1", "特殊要求2"],
  "notes": ["注意事项1", "注意事项2"],
  "attachments": ["附件1名称", "附件2名称"]
}

招标文档:
{documentContent}

输出JSON（仅输出JSON，不要任何解释）:
`;

/**
 * 评分标准提取专用提示词（单独调用时使用）
 */
export const EVALUATION_CRITERIA_EXTRACTION_PROMPT = EXTRACT_SCORING_PROMPT;

/**
 * 废标风险提取Prompt（兼容旧版）
 */
export const DISQUALIFICATION_RISK_EXTRACTION_PROMPT = `
你是招标文档废标风险分析专家。从招标文档中提取所有可能导致废标的风险条款。

输出JSON格式:
{
  "risks": [
    {
      "riskType": "资格性|符合性|技术性|商务性|程序性|其他",
      "description": "风险描述",
      "sourceText": "原文条款",
      "severity": "critical|high|medium|low",
      "mitigationSuggestion": "应对建议"
    }
  ],
  "summary": {
    "totalCount": 0,
    "criticalCount": 0,
    "highCount": 0
  }
}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 完整提取Prompt（兼容旧版）
 */
export const FULL_EXTRACTION_PROMPT = `
你是招标文档信息提取专家。从招标文档中提取完整的结构化信息。

输出JSON格式:
{
  "projectBasicInfo": {
    "projectName": "项目名称",
    "projectNumber": "项目编号",
    "purchaseUnit": "采购单位",
    "projectBudget": "项目预算",
    "projectCycle": "项目周期"
  },
  "timeSchedule": {
    "bidSubmissionDeadline": "投标截止时间",
    "bidOpeningDate": "开标时间",
    "bidOpeningLocation": "开标地点"
  },
  "scoringItems": [
    {
      "itemName": "评分项名称",
      "itemType": "technical|business|price",
      "maxScore": 10,
      "scoringRules": ["评分规则1", "评分规则2"]
    }
  ],
  "risks": [
    {
      "riskType": "风险类型",
      "description": "风险描述",
      "severity": "critical|high|medium|low"
    }
  ],
  "scoringSummary": {
    "totalScore": 100
  },
  "riskSummary": {
    "totalCount": 0,
    "criticalCount": 0
  }
}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 综合提取Prompt（主入口，包含所有字段）
 */
export const SCORING_EXTRACTION_PROMPT = `
你是招标文档信息提取专家。从招标文档中提取完整的结构化信息，输出JSON格式。

【重要】评分标准提取规则：
1. 使用 evaluationCriteria 数组存储评分大类
2. 每个大类包含：seq、category、totalScore、categoryType、items[]
3. 细项包含：subItem、itemScore（数字）、rule（原文）、basis、techDocRef
4. categoryType: "technical"（技术）、"business"（商务）、"price"（价格）
5. 必须100%忠于原文，不得遗漏任何评分项

{
  "projectBasicInfo": {
    "projectName": "项目名称",
    "projectNumber": "项目编号",
    "purchaseUnit": "采购单位",
    "purchaseUnitContact": "联系人",
    "purchaseUnitPhone": "电话",
    "purchaseUnitEmail": "邮箱",
    "purchaseUnitAddress": "地址",
    "projectType": "货物/服务/工程",
    "procurementMethod": "采购方式",
    "projectBudget": "预算",
    "budgetSource": "资金来源",
    "budgetApproval": "预算批复文号",
    "projectCycle": "服务期限",
    "deliveryPeriod": "交付周期",
    "warrantyPeriod": "质保期"
  },
  "timeSchedule": {
    "bidPublishDate": "招标公告发布时间",
    "bidDocumentSaleStart": "文件发售开始",
    "bidDocumentSaleEnd": "文件发售结束",
    "questionDeadline": "提问截止",
    "answerPublishDate": "答疑发布",
    "siteVisitDate": "现场踏勘",
    "bidSubmissionDeadline": "投标截止",
    "bidOpeningDate": "开标时间",
    "bidOpeningLocation": "开标地点",
    "evaluationPeriod": "评标周期",
    "resultPublicityDate": "结果公示时间"
  },
  "scoringStandard": {
    "evaluationCriteria": [
      {
        "seq": 1,
        "category": "评分大类名称",
        "totalScore": 20,
        "categoryType": "technical",
        "items": [
          {
            "subItem": "评分细项名称",
            "itemScore": 5,
            "rule": "评分细则原文",
            "basis": "评分依据原文",
            "techDocRef": null
          }
        ]
      }
    ]
  },
  "disqualificationRisks": [
    {
      "riskType": "风险类型",
      "description": "风险描述",
      "sourceText": "原文",
      "severity": "critical/high/medium/low"
    }
  ],
  "businessRequirements": {
    "bidderQualification": {
      "basicQualification": ["资格要求"],
      "requiredCertificates": [{"certificateName": "证书名", "isMandatory": true}],
      "performanceRequirements": {"projectCount": 3, "contractAmount": "金额要求"},
      "personnelRequirements": [{"position": "岗位", "count": 1, "qualification": ["资质"]}]
    },
    "serviceLocation": "服务地点",
    "serviceRequirements": ["服务要求"],
    "winnerCount": 1,
    "winnerSelectionMethod": "中标人确定方法",
    "paymentMethod": "付款方式",
    "paymentTerms": ["付款条款"],
    "bidSecurity": {
      "amount": "保证金金额",
      "paymentMethod": "缴纳方式",
      "deadline": "缴纳截止",
      "returnConditions": ["退还条件"]
    },
    "bidValidityPeriod": "投标有效期"
  },
  "coreTechDemand": {
    "systemUpgradeDemands": [{"moduleName": "模块名", "demandDetails": ["需求"], "priority": "必须"}],
    "technicalParameters": [{"parameterName": "参数名", "requiredValue": "要求值", "isKeyParameter": true, "deviationAllowed": false}],
    "professionalTechRequirements": {"requirementDetails": ["要求"]},
    "techSolutionRequirements": ["技术方案要求"],
    "performanceRequirements": [{"requirementName": "性能指标", "requirementValue": "指标值"}]
  },
  "biddingDocumentRequirements": {
    "documentStructure": [{"volumeName": "册名", "sections": [{"sectionName": "章节名", "requiredDocuments": ["文件"]}]}],
    "formatRequirements": {"bindingMethod": "装订方式", "copiesCount": 3, "electronicFormat": "电子版格式"},
    "sealingRequirements": ["密封要求"],
    "signatureRequirements": ["签章要求"],
    "submissionRequirements": {"submissionLocation": "递交地点", "submissionMethod": "递交方式", "deadline": "截止时间"}
  },
  "projectBackground": {
    "constructionBackground": "建设背景",
    "constructionGoals": ["建设目标"],
    "constructionScope": "建设范围",
    "currentStatus": "现状描述",
    "businessRequirements": ["业务需求"]
  },
  "otherImportantInfo": {
    "specialRequirements": ["特殊要求"],
    "notes": ["注意事项"],
    "attachments": ["附件清单"]
  }
}

招标文档:
{documentContent}

输出JSON（确保完整闭合，不要遗漏任何评分项）:
`;
