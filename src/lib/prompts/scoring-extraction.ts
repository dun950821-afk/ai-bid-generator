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
你是专业的招标文件评分标准提取专家。

## 任务说明
从招标文档中提取完整的评分标准表格。评分标准通常以表格形式呈现，包含以下列：
- 序号/编号：评分大类的编号
- 评分项/评审项目：评分大类名称（如"整体实力"、"解决方案"等），通常带总分
- 评分细项：具体评分项名称
- 细项分值/分值：该细项的分值（数字）
- 评分细则/评分标准：详细的评分规则说明
- 评分依据/证明材料：需要提供的证明材料

## 提取规则
1. **评分大类识别**：
   - 相同序号的行属于同一个评分大类
   - 评分大类名称通常带括号标注总分，如"整体实力（5）"
   - 提取时去除括号中的分数，单独存入totalScore

2. **categoryType分类**：
   - "technical"：技术/方案/人员相关（整体实力、解决方案、项目管理、人员投入、案例经验等）
   - "business"：商务相关（商务响应、服务承诺等）
   - "price"：价格相关（投标价格、报价等）

3. **分值处理**：
   - 分值必须是纯数字，不带"分"字
   - 如果评分细则中有分数范围（如"6-7分"），取中间值或最高值

4. **原文保留**：
   - rule字段完整保留评分细则原文
   - basis字段完整保留评分依据原文

5. **技术需求书引用**：
   - 如果细则中引用了"技术需求书x.x.x"，提取到techDocRef字段

## 输出JSON格式
{
  "evaluationCriteria": [
    {
      "seq": 1,
      "category": "整体实力",
      "totalScore": 5,
      "categoryType": "technical",
      "items": [
        {
          "subItem": "企业认证",
          "itemScore": 1,
          "rule": "投标人通过ISO9001、CMMI能力成熟度3级（含）以上认证，全部满足得1分，否则不得分。",
          "basis": "投标文件中附证书复印件加盖公章",
          "techDocRef": null
        }
      ]
    }
  ]
}

## 注意事项
- 必须提取所有评分项，不得遗漏
- 即使评分标准分散在不同章节，也要全部汇总
- 只输出JSON，不要任何解释或markdown标记

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 评分标准提取专用提示词（单独调用时使用）
 */
export const EVALUATION_CRITERIA_EXTRACTION_PROMPT = `
你是专业的招标文件评分标准提取专家。

## 任务说明
从招标文档中提取完整的评分标准表格。评分标准通常以表格形式呈现，包含以下列：
- 序号/编号：评分大类的编号
- 评分项/评审项目：评分大类名称（如"整体实力"、"解决方案"等），通常带总分
- 评分细项：具体评分项名称
- 细项分值/分值：该细项的分值（数字）
- 评分细则/评分标准：详细的评分规则说明
- 评分依据/证明材料：需要提供的证明材料

## 提取规则
1. **评分大类识别**：
   - 相同序号的行属于同一个评分大类
   - 评分大类名称通常带括号标注总分，如"整体实力（5）"
   - 提取时去除括号中的分数，单独存入totalScore

2. **categoryType分类**：
   - "technical"：技术/方案/人员相关（整体实力、解决方案、项目管理、人员投入、案例经验等）
   - "business"：商务相关（商务响应、服务承诺等）
   - "price"：价格相关（投标价格、报价等）

3. **分值处理**：
   - 分值必须是纯数字，不带"分"字
   - 如果评分细则中有分数范围（如"6-7分"），取中间值或最高值

4. **原文保留**：
   - rule字段完整保留评分细则原文
   - basis字段完整保留评分依据原文

5. **技术需求书引用**：
   - 如果细则中引用了"技术需求书x.x.x"，提取到techDocRef字段

## 输出JSON格式
{
  "evaluationCriteria": [
    {
      "seq": 1,
      "category": "整体实力",
      "totalScore": 5,
      "categoryType": "technical",
      "items": [
        {
          "subItem": "企业认证",
          "itemScore": 1,
          "rule": "投标人通过ISO9001、CMMI能力成熟度3级（含）以上认证，全部满足得1分，否则不得分。",
          "basis": "投标文件中附证书复印件加盖公章",
          "techDocRef": null
        }
      ]
    }
  ]
}

## 注意事项
- 必须提取所有评分项，不得遗漏
- 即使评分标准分散在不同章节，也要全部汇总
- 只输出JSON，不要任何解释或markdown标记

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
