/**
 * 招标文档提取Prompt模板（精简版）
 */

export const SCORING_EXTRACTION_PROMPT = `
你是招标文档提取专家。提取以下JSON格式的数据，无信息填null或[]。

{"projectBasicInfo":{"projectName":null,"projectNumber":null,"purchaseUnit":null,"purchaseUnitContact":null,"purchaseUnitPhone":null,"purchaseUnitEmail":null,"purchaseUnitAddress":null,"projectType":null,"procurementMethod":null,"projectBudget":null,"budgetSource":null,"projectCycle":null,"deliveryPeriod":null,"warrantyPeriod":null},"timeSchedule":{"bidPublishDate":null,"bidDocumentSaleStart":null,"bidDocumentSaleEnd":null,"questionDeadline":null,"answerPublishDate":null,"siteVisitDate":null,"bidSubmissionDeadline":null,"bidOpeningDate":null,"bidOpeningLocation":null},"coreTechDemand":{"systemUpgradeDemands":[],"technicalParameters":[],"professionalTechRequirements":{"requirementDetails":[]},"techSolutionRequirements":[],"performanceRequirements":[]},"businessRequirements":{"bidderQualification":{"basicQualification":[],"requiredCertificates":[],"performanceRequirements":null,"personnelRequirements":[]},"serviceLocation":null,"serviceRequirements":[],"winnerCount":null,"winnerSelectionMethod":null,"paymentMethod":null,"paymentTerms":[],"bidSecurity":{"amount":null,"paymentMethod":null,"deadline":null,"returnConditions":[]},"bidValidityPeriod":null},"scoringStandard":{"techScoring":{"totalScore":0,"scoringItems":[]},"businessScoring":{"totalScore":0,"scoringItems":[]},"priceScoring":{"totalScore":0,"scoringMethod":null}},"disqualificationRisks":[],"biddingDocumentRequirements":{"documentStructure":[],"formatRequirements":{"bindingMethod":null,"copiesCount":null,"electronicFormat":null},"sealingRequirements":[],"signatureRequirements":[]},"projectBackground":{"constructionBackground":null,"constructionGoals":[],"constructionScope":null,"currentStatus":null,"businessRequirements":[]},"otherImportantInfo":{"specialRequirements":[],"notes":[],"attachments":[]}}

招标文档:
{documentContent}

输出JSON(确保完整闭合):
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
 * 分段提取Prompt - 评分标准
 */
export const EXTRACT_SCORING_PROMPT = `
从招标文档提取评分标准，输出JSON格式:
{"techScoring":{"totalScore":0,"scoringItems":[{"itemName":"评分项名称","maxScore":10,"scoreDetails":["细则1","细则2"]}]}, "businessScoring":{"totalScore":0,"scoringItems":[]},"priceScoring":{"totalScore":0,"scoringMethod":"评分方法"}}

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
