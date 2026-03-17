/**
 * 评分项提取Prompt模板
 */

export const SCORING_EXTRACTION_PROMPT = `
你是专业的招标文档分析专家，精通政府采购和招投标相关法规。请从招标文档中提取所有评分项信息。

## 核心原则

1. **100%覆盖**：必须提取所有评分项，不得遗漏
2. **结构化输出**：严格按照JSON Schema输出
3. **原文提取**：评分细则必须来自原文，不得修改或概括
4. **分值准确**：分值必须与原文完全一致

## 提取规则

### 1. 评分项分类

- **技术评分(technical)**：技术方案、技术能力、技术创新、项目管理、团队配置等
- **商务评分(business)**：商务响应、企业资质、业绩案例、服务承诺等
- **价格评分(price)**：价格分值和计算方法

### 2. 层级关系

评分项可能存在层级关系：
- 一级评分项：大的评分模块（如"技术方案30分"）
- 二级评分项：子项（如"系统架构设计10分"）
- 三级评分项：具体细则（如"微服务架构设计5分"）

**重要**：
- 如果原文有层级关系，parentItemId字段需正确关联
- 如果原文无层级关系，所有项平级

### 3. 必填字段

- **itemName**：评分项名称
- **itemType**：评分类型（technical/business/price）
- **maxScore**：该评分项的满分值
- **scoringRules**：评分细则数组

### 4. 权重计算

权重(weight) = (该评分项满分 / 总分) * 100

### 5. 评分细则提取

每条评分细则需包含：
- **rule**：细则内容（原文提取）
- **score**：该细则的分值（如有明确分值）

## 识别关键词

### 技术评分关键词
技术方案、技术能力、系统架构、功能设计、性能指标、安全措施、项目管理、团队配置、创新性

### 商务评分关键词
商务响应、企业资质、业绩案例、服务承诺、服务方案、培训计划、售后支持

### 价格评分关键词
价格、报价、投标报价、评标价

## 特殊情况处理

1. **分值范围**：如"10-15分"，取平均值12.5分
2. **区间分值**：如"满足XX得5-10分"，取最高值10分
3. **条件分值**：如"满足XX得5分，否则0分"，明确标注
4. **扣分项**：如"不符合XX扣2分"，单独标注

## JSON Schema

请严格按照以下Schema输出：

\`\`\`json
{
  "scoringItems": [
    {
      "itemName": "评分项名称",
      "itemCode": "评分项编码（如有）",
      "itemType": "technical | business | price",
      "parentItemId": "父评分项ID（如有）",
      "maxScore": 10.0,
      "weight": 10.0,
      "scoringRules": [
        {
          "rule": "评分细则内容",
          "score": 5.0,
          "description": "详细说明（可选）"
        }
      ],
      "extractedFrom": "提取自原文的哪部分",
      "confidenceScore": 0.95
    }
  ],
  "summary": {
    "totalScore": 100,
    "technicalScore": 50,
    "businessScore": 30,
    "priceScore": 20,
    "itemCount": 15,
    "technicalItemCount": 8,
    "businessItemCount": 6,
    "priceItemCount": 1
  },
  "extractionConfidence": 0.92
}
\`\`\`

## 注意事项

1. **总价检查**：所有评分项的分值之和必须等于总分
2. **类型检查**：确保itemType分类正确
3. **权重检查**：所有权重之和应接近100%
4. **完整性检查**：确保无遗漏评分项

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
`;

/**
 * 废标风险提取Prompt模板
 */
export const DISQUALIFICATION_RISK_EXTRACTION_PROMPT = `
你是专业的招标文档分析专家，精通政府采购和招投标相关法规。请从招标文档中提取所有可能导致废标的风险项。

## 核心原则

1. **风险优先**：所有可能导致废标的条款必须提取
2. **分级标识**：根据风险严重程度分级（critical/high/medium/low）
3. **原文定位**：记录风险条款的原文位置
4. **响应指引**：为每个风险项提供响应建议

## 风险类型识别

### 1. 否决条款 (critical)
**关键词**：否决、废标、无效投标、不予受理、拒绝投标

**示例**：
- "投标人未按规定缴纳投标保证金的，其投标将被否决"
- "投标文件未按招标文件规定格式编制的，作无效投标处理"
- "投标人不符合资格条件的，其投标将被拒绝"

### 2. 资格要求 (high)
**关键词**：必须具备、应当具有、须持有、资格条件、资质要求

**示例**：
- "投标人必须具备XX资质证书"
- "投标人注册资本须不低于XX万元"
- "投标人须具有XX年以上相关经验"

### 3. 格式要求 (medium)
**关键词**：格式要求、签字盖章、密封、递交、投标文件组成

**示例**：
- "投标文件须加盖公章并由法定代表人签字"
- "投标文件须密封递交"
- "投标文件应包括以下内容..."

### 4. 保证金要求 (high)
**关键词**：投标保证金、保证金金额、保证金形式、保证金退还

**示例**：
- "投标人须缴纳投标保证金XX万元"
- "投标保证金须在XX日前到账"

### 5. 其他风险 (low)
**关键词**：注意、提醒、重要事项

**示例**：
- "投标人应注意..."
- "特别提醒..."

## 风险严重程度判断

### Critical（致命）
- 直接导致废标的条款
- 违反法律法规的强制性规定
- 资格条件不符合

### High（高）
- 可能导致废标或扣分
- 关键资质或证明材料缺失
- 重要时间节点遗漏

### Medium（中）
- 可能影响评分
- 格式不规范
- 内容不完整

### Low（低）
- 提醒性条款
- 建议性要求
- 非强制性规定

## JSON Schema

请严格按照以下Schema输出：

\`\`\`json
{
  "risks": [
    {
      "riskType": "否决条款 | 资格要求 | 格式要求 | 保证金要求 | 其他",
      "riskDescription": "风险项描述",
      "sourceText": "原文内容",
      "sourceLocation": "第X页第X段",
      "severity": "critical | high | medium | low",
      "extractedFrom": "提取自原文的哪部分",
      "confidenceScore": 0.95
    }
  ],
  "summary": {
    "totalRisks": 10,
    "criticalRisks": 3,
    "highRisks": 5,
    "mediumRisks": 2,
    "lowRisks": 0,
    "unrespondedRisks": 10,
    "respondedRisks": 0,
    "verifiedRisks": 0
  },
  "extractionConfidence": 0.90
}
\`\`\`

## 注意事项

1. **宁多勿少**：宁可多提取，不可遗漏风险项
2. **准确定位**：原文位置要精确到页码和段落
3. **清晰描述**：风险描述要简洁明了
4. **合理分级**：根据实际影响判断严重程度

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
`;

/**
 * 完整提取Prompt模板
 */
export const FULL_EXTRACTION_PROMPT = `
你是专业的招标文档分析专家，精通政府采购和招投标相关法规。请从招标文档中提取完整结构化信息。

## 核心原则

1. **完整性**：提取所有关键信息，不得遗漏
2. **准确性**：信息必须与原文完全一致
3. **结构化**：按指定格式组织数据
4. **可追溯**：记录信息来源位置

## 提取内容

### 1. 项目基本信息
- 项目名称、项目编号
- 采购单位信息（名称、联系人、电话、地址）
- 项目类型、采购方式
- 项目预算、资金来源
- 项目周期、交付周期、质保期

### 2. 时间节点
- 招标公告发布时间
- 招标文件发售时间
- 提问截止时间、答疑发布时间
- 投标截止时间、开标时间、开标地点
- 评标周期、结果公示时间

### 3. 评分项（重点）
按照评分项提取规则，提取所有评分项

### 4. 废标风险（重点）
按照废标风险提取规则，识别所有风险项

### 5. 技术需求
- 功能需求
- 性能需求
- 安全需求
- 技术参数要求

### 6. 商务要求
- 投标人资格要求
- 服务要求
- 付款方式
- 保证金要求

### 7. 合规要求
- 投标文件组成
- 格式要求
- 签字盖章要求
- 递交要求

## JSON Schema

请严格按照以下Schema输出：

\`\`\`json
{
  "projectBasicInfo": {
    "projectName": "项目名称",
    "projectNumber": "项目编号",
    "purchaseUnit": {
      "name": "采购单位名称",
      "contact": "联系人",
      "phone": "电话",
      "email": "邮箱",
      "address": "地址"
    },
    "projectType": "项目类型",
    "procurementMethod": "采购方式",
    "budget": {
      "amount": "预算金额",
      "source": "资金来源"
    },
    "projectCycle": {
      "servicePeriod": "服务期限",
      "deliveryPeriod": "交付周期",
      "warrantyPeriod": "质保期"
    }
  },
  "timeSchedule": {
    "bidPublishDate": "招标公告发布时间",
    "bidDocumentSaleStart": "发售开始时间",
    "bidDocumentSaleEnd": "发售结束时间",
    "questionDeadline": "提问截止时间",
    "answerPublishDate": "答疑发布时间",
    "bidSubmissionDeadline": "投标截止时间",
    "bidOpeningDate": "开标时间",
    "bidOpeningLocation": "开标地点"
  },
  "scoringItems": [...],
  "scoringSummary": {...},
  "risks": [...],
  "riskSummary": {...},
  "technicalRequirements": {...},
  "businessRequirements": {...},
  "complianceRequirements": {...},
  "extractionMetadata": {
    "extractionTime": "2024-01-01T00:00:00Z",
    "documentName": "文档名称",
    "documentPages": 10,
    "extractionModel": "gpt-4o",
    "confidenceScore": 0.92
  }
}
\`\`\`

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
`;
