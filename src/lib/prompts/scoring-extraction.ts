/**
 * 评分项提取Prompt模板
 */

export const SCORING_EXTRACTION_PROMPT = `
你是专业的招标文档分析专家，精通政府采购和招投标相关法规。请从招标文档中提取评分项和废标风险信息。

## 核心原则

1. **100%覆盖**：必须提取所有评分项和废标风险，不得遗漏
2. **结构化输出**：严格按照JSON Schema输出
3. **原文提取**：评分细则和风险条款必须来自原文，不得修改或概括
4. **分值准确**：分值必须与原文完全一致

## 评分项提取规则

### 1. 评分项分类

- **技术评分(technical)**：技术方案、技术能力、技术创新、项目管理、团队配置、功能设计、性能指标等
- **商务评分(business)**：商务响应、企业资质、业绩案例、服务承诺、培训方案等  
- **价格评分(price)**：价格分值和计算方法

### 2. 识别关键词

技术类：技术方案、技术评分、系统架构、功能设计、性能指标、安全措施
商务类：商务评分、企业资质、业绩经验、团队配置、服务承诺
价格类：价格评分、报价、投标报价

### 3. 提取示例

原文：
"1. 技术评分（40分）：系统功能完整性15分、技术方案合理性15分、性能指标10分"

应提取为：
{
  "itemName": "技术评分",
  "itemType": "technical",
  "maxScore": 40,
  "scoringRules": [
    {"rule": "系统功能完整性", "score": 15},
    {"rule": "技术方案合理性", "score": 15},
    {"rule": "性能指标", "score": 10}
  ]
}

## 废标风险提取规则

### 识别关键词
废标、无效投标、否决、拒绝投标、逾期、密封、资质、保证金、必须具备

### 风险分级
- critical: 直接导致废标的条款
- high: 资格条件、保证金要求
- medium: 格式要求、签字盖章
- low: 提醒性条款

## JSON Schema

严格按照以下格式输出，不要添加任何其他字段：

{
  "scoringItems": [
    {
      "itemName": "评分项名称",
      "itemType": "technical",
      "maxScore": 10,
      "scoringRules": [
        {"rule": "细则内容", "score": 5}
      ]
    }
  ],
  "disqualificationRisks": [
    {
      "riskType": "否决条款",
      "description": "风险项描述",
      "sourceText": "原文内容",
      "severity": "critical"
    }
  ],
  "summary": {
    "totalScore": 100,
    "itemCount": 10,
    "riskCount": 5
  }
}

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
