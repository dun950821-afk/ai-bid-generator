/**
 * 招标文档提取Prompt模板（精简版）
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
    "bidOpeningLocation": "开标地点"
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
      "requiredCertificates": [],
      "personnelRequirements": []
    },
    "serviceLocation": "服务地点",
    "bidSecurity": {
      "amount": "保证金金额",
      "deadline": "缴纳截止"
    },
    "bidValidityPeriod": "投标有效期"
  },
  "coreTechDemand": {
    "systemUpgradeDemands": [],
    "technicalParameters": [],
    "professionalTechRequirements": {"requirementDetails": []}
  },
  "biddingDocumentRequirements": {
    "documentStructure": [],
    "formatRequirements": {},
    "sealingRequirements": [],
    "signatureRequirements": []
  },
  "projectBackground": {
    "constructionBackground": "",
    "constructionGoals": [],
    "constructionScope": ""
  },
  "otherImportantInfo": {
    "specialRequirements": [],
    "notes": []
  }
}

招标文档:
{documentContent}

输出JSON（确保完整闭合，不要遗漏任何评分项）:
`;

/**
 * 废标风险提取Prompt
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
 * 完整提取Prompt
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
 * 分段提取Prompt - 项目基本信息
 */
export const EXTRACT_PROJECT_INFO_PROMPT = `
从招标文档提取项目基本信息，输出JSON格式:
{"projectName":"项目名称","projectNumber":"项目编号","purchaseUnit":"采购单位","purchaseUnitContact":"联系人","purchaseUnitPhone":"电话","purchaseUnitEmail":"邮箱","purchaseUnitAddress":"地址","projectType":"货物/服务/工程","procurementMethod":"采购方式","projectBudget":"预算","budgetSource":"资金来源","projectCycle":"服务期限","deliveryPeriod":"交付周期","warrantyPeriod":"质保期"}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 分段提取Prompt - 时间节点
 */
export const EXTRACT_TIME_SCHEDULE_PROMPT = `
从招标文档提取时间节点，输出JSON格式:
{"bidPublishDate":"招标公告发布时间","bidDocumentSaleStart":"文件发售开始","bidDocumentSaleEnd":"文件发售结束","questionDeadline":"提问截止","answerPublishDate":"答疑发布","siteVisitDate":"现场踏勘","bidSubmissionDeadline":"投标截止","bidOpeningDate":"开标时间","bidOpeningLocation":"开标地点"}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 分段提取Prompt - 评分标准（优化版）
 * 精准提取评分大类和评分细项
 */
export const EXTRACT_SCORING_PROMPT = `
你是专业的【招标文件评分标准提取专家】。
你的任务只有一个：从给定文本中，100% 忠于原文，提取【详细评审标准/评分标准】，输出严格结构化 JSON，不许编造、不许省略、不许改写。

### 提取规则
1. 拆分结构：
   - 外层数组：每一项是「评分大类」（整体实力、解决方案、项目管理、商务报价等）
   - 每个大类下包含：seq、category、totalScore、categoryType、items[]
2. 细项必须包含：
   - subItem：评分细项名称
   - itemScore：细项分值（数字）
   - rule：评分细则原文（完整保留原文）
   - basis：评分依据原文（如"投标文件中附证书复印件加盖公章"）
   - techDocRef：提取文中引用的"技术需求书x.x.x"条款，没有则为null
3. categoryType 分类：
   - "technical"：技术评分（技术方案、实施方案、团队配置、类似业绩等）
   - "business"：商务评分（商务响应、服务承诺等）
   - "price"：价格评分
4. 分值必须是数字，不要带"分"字。
5. 只输出纯 JSON，不要任何解释、文字、markdown、注释。
6. 严格按下面的 JSON 结构输出。
7. 如果评分标准分散在不同章节，要全部汇总提取。

### 输出 JSON 结构
{
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
          "techDocRef": "技术需求书引用条款或null"
        }
      ]
    }
  ]
}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 评分标准提取专用提示词（单独调用时使用）
 */
export const EVALUATION_CRITERIA_EXTRACTION_PROMPT = `
你是专业的【招标文件评分标准提取专家】。
你的任务只有一个：从给定文本中，100% 忠于原文，提取【详细评审标准/评分标准】，输出严格结构化 JSON，不许编造、不许省略、不许改写。

### 提取规则
1. 拆分结构：
   - 外层数组：每一项是「评分大类」（整体实力、解决方案、项目管理、商务报价等）
   - 每个大类下包含：seq、category、totalScore、categoryType、items[]
2. 细项必须包含：
   - subItem：评分细项名称
   - itemScore：细项分值（数字）
   - rule：评分细则原文（完整保留原文）
   - basis：评分依据原文（如"投标文件中附证书复印件加盖公章"）
   - techDocRef：提取文中引用的"技术需求书x.x.x"条款，没有则为null
3. categoryType 分类：
   - "technical"：技术评分（技术方案、实施方案、团队配置、类似业绩等）
   - "business"：商务评分（商务响应、服务承诺等）
   - "price"：价格评分
4. 分值必须是数字，不要带"分"字。
5. 只输出纯 JSON，不要任何解释、文字、markdown、注释。
6. 严格按下面的 JSON 结构输出。
7. 如果评分标准分散在不同章节，要全部汇总提取。
8. 必须提取所有评分项，不得遗漏任何一项。

### 输出 JSON 结构
{
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
          "techDocRef": "技术需求书引用条款或null"
        }
      ]
    }
  ]
}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 分段提取Prompt - 废标风险
 */
export const EXTRACT_RISKS_PROMPT = `
从招标文档提取废标风险条款，输出JSON格式:
[{"riskType":"风险类型","description":"风险描述","sourceText":"原文","severity":"critical/high/medium/low"}]

招标文档:
{documentContent}

输出JSON数组:
`;

/**
 * 分段提取Prompt - 商务要求
 */
export const EXTRACT_BUSINESS_PROMPT = `
从招标文档提取商务要求，输出JSON格式:
{"bidderQualification":{"basicQualification":["资格要求1","资格要求2"],"requiredCertificates":[{"certificateName":"证书名","isMandatory":true}],"performanceRequirements":{"projectCount":3,"contractAmount":"金额要求"},"personnelRequirements":[{"position":"岗位","count":1,"qualification":["资质"]}]},"serviceLocation":"服务地点","bidSecurity":{"amount":"保证金金额","deadline":"缴纳截止"},"bidValidityPeriod":"投标有效期"}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 分段提取Prompt - 技术需求
 */
export const EXTRACT_TECH_PROMPT = `
从招标文档提取技术需求，输出JSON格式:
{"systemUpgradeDemands":[{"moduleName":"模块名","demandDetails":["需求1","需求2"]}],"technicalParameters":[{"parameterName":"参数名","requiredValue":"要求值","isKeyParameter":true,"deviationAllowed":false}],"professionalTechRequirements":{"requirementDetails":["要求1"]},"performanceRequirements":[{"requirementName":"性能指标","requirementValue":"指标值"}]}

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 分段提取Prompt - 投标文件要求
 */
export const EXTRACT_DOCUMENT_PROMPT = `
从招标文档提取投标文件要求，输出JSON格式:
{"documentStructure":[{"volumeName":"册名","sections":[{"sectionName":"章节名","requiredDocuments":["文件1","文件2"]}]}],"formatRequirements":{"bindingMethod":"装订方式","copiesCount":3,"electronicFormat":"电子版格式"},"sealingRequirements":["密封要求"],"signatureRequirements":["签章要求"]}

招标文档:
{documentContent}

输出JSON:
`;
