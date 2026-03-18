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
 * 分段提取Prompt - 评分标准（V4 - 强化版）
 * 重点：章节定位、表格识别、分值提取
 */
export const EXTRACT_SCORING_PROMPT = `
你是招标文件评分标准提取专家。请仔细阅读招标文档，提取所有评分项。

## ⚠️ 重要：评分标准在哪里？

请重点查找以下章节（按优先级排序）：
1. **"评标办法"** 章节 - 通常包含评分标准和评分方法
2. **"评分标准"** 或 **"评审标准"** 章节
3. **"技术评分表"** 或 **"商务评分表"**
4. **"综合评分法"** 相关内容
5. 查找包含 **"评分项"、"分值"、"得分"、"满分"** 的表格

## ⚠️ 注意：不要提取以下内容（这些不是评分标准）

- ❌ 中标候选人推荐原则（这是评标流程，不是评分标准）
- ❌ 评标委员会组成（这是组织架构）
- ❌ 废标条款（这是资格条件，单独提取）
- ❌ 投标文件格式要求（这是格式规范）

## 评分标准的典型格式

**格式1：文字描述**
\`\`\`
技术评分（60分）：
1. 技术方案（30分）
   - 方案完整可行，得25-30分
   - 方案基本可行，得15-24分
2. 项目团队（20分）
   - 项目经理有PMP证书，得5分
\`\`\`

**格式2：表格形式（最常见）**
\`\`\`
| 评分项 | 分值 | 评分标准 |
|--------|------|----------|
| 技术方案 | 30 | 完整可行得25-30分 |
| 项目团队 | 20 | 有PMP证书得5分 |
\`\`\`

**格式3：嵌套结构**
\`\`\`
一、技术部分（60分）
  1. 技术方案（30分）
     1.1 整体架构（10分）
     1.2 功能设计（10分）
     1.3 技术选型（10分）
\`\`\`

## 提取规则

1. **分值必须提取**：找到所有带"分"的数字，如"30分"、"(10分)"、"满分20分"
2. **总分要累加**：大类总分 = 所有子项分值之和
3. **保留原文**：评分细则（rule字段）必须完整保留原文
4. **区分类型**：
   - technical（技术）：方案、技术、功能、性能、人员、实施
   - business（商务）：资质、认证、业绩、服务、承诺
   - price（价格）：报价、价格

## 输出格式

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
          "rule": "技术方案完整、可行、有创新，得25-30分；方案较完整、可行，得15-24分",
          "basis": null,
          "techDocRef": null
        }
      ]
    }
  ]
}

## 完整示例

**招标文档内容**：
\`\`\`
第五章 评标办法

一、评标方法
本项目采用综合评分法，满分100分。

二、评分标准

（一）技术评分（60分）

| 序号 | 评分项 | 分值 | 评分标准 |
|------|--------|------|----------|
| 1 | 技术方案 | 30 | 技术方案完整、可行、有创新，得25-30分；较完整可行得15-24分 |
| 2 | 项目团队 | 20 | 项目经理有PMP证书得5分；团队成员有相关认证每人2分最高10分 |
| 3 | 实施方案 | 10 | 实施方案合理可行得8-10分 |

（二）商务评分（30分）

| 序号 | 评分项 | 分值 | 评分标准 |
|------|--------|------|----------|
| 1 | 企业资质 | 15 | ISO9001认证得5分；CMMI3级得10分 |
| 2 | 项目业绩 | 15 | 每个类似项目业绩得3分，最高15分 |

（三）价格评分（10分）
采用低价优先法计算价格得分。
\`\`\`

**提取结果**：
{
  "evaluationCriteria": [
    {
      "seq": 1,
      "category": "技术评分",
      "totalScore": 60,
      "categoryType": "technical",
      "items": [
        {"subItem": "技术方案", "itemScore": 30, "rule": "技术方案完整、可行、有创新，得25-30分；较完整可行得15-24分"},
        {"subItem": "项目团队", "itemScore": 20, "rule": "项目经理有PMP证书得5分；团队成员有相关认证每人2分最高10分"},
        {"subItem": "实施方案", "itemScore": 10, "rule": "实施方案合理可行得8-10分"}
      ]
    },
    {
      "seq": 2,
      "category": "商务评分",
      "totalScore": 30,
      "categoryType": "business",
      "items": [
        {"subItem": "企业资质", "itemScore": 15, "rule": "ISO9001认证得5分；CMMI3级得10分"},
        {"subItem": "项目业绩", "itemScore": 15, "rule": "每个类似项目业绩得3分，最高15分"}
      ]
    },
    {
      "seq": 3,
      "category": "价格评分",
      "totalScore": 10,
      "categoryType": "price",
      "items": [
        {"subItem": "价格得分", "itemScore": 10, "rule": "采用低价优先法计算价格得分"}
      ]
    }
  ]
}

## ⚠️ 最后检查

在输出前请确认：
1. ✅ 每个itemScore都有具体的数字分值，不能是0（除非原文就是0分）
2. ✅ totalScore是大类下所有itemScore的总和
3. ✅ 提取的是评分标准，不是评标流程或中标规则
4. ✅ 如果真的找不到评分标准，返回空数组：{"evaluationCriteria": []}

请从上传的招标文档中提取评分标准，直接输出JSON：
`;

/**
 * 分段提取Prompt - 废标风险（简化版V3）
 * 宽松原则：宁可多提取，不要遗漏
 */
export const EXTRACT_RISKS_PROMPT = `
你是招标文件废标风险提取专家。从文档中提取所有可能导致投标失败的风险条款。

## 核心原则（3条）

1. **关键词触发**：看到以下关键词就尝试提取风险条款
   - "废标"、"无效"、"否决"、"拒绝"、"不予受理"
   - "不得"、"禁止"、"必须"、"应当"、"需要"
   - "作废"、"取消资格"、"不予评审"
   - "★"、"关键参数"、"实质性要求"

2. **宽松提取**：
   - 宁可多提取，不要遗漏
   - 不确定是否会导致废标？先提取出来
   - 严重程度不确定？默认填"high"

3. **保留原文**：
   - sourceText必须完整保留原文
   - 不要概括、不要改写、不要编造

## 要找的内容

**关键位置**：
- 投标人须知、废标条款、资格审查
- 投标文件要求、密封签章要求
- ★号条款、实质性条款

**风险类型**：
- 资格性：资质不够、证书缺失、业绩不足
- 符合性：格式错误、签章缺失、逾期递交
- 技术性：不满足关键技术参数、技术偏离
- 商务性：报价超限、保证金未缴
- 程序性：程序违规、文件缺失

**严重程度**：
- critical：明确写"废标"、"无效"、"否决"
- high：可能导致废标的重要条款
- medium：影响评分的条款
- low：其他注意事项

## 输出格式

[
  {
    "riskType": "资格性|符合性|技术性|商务性|程序性",
    "description": "简洁描述风险内容",
    "sourceText": "原文完整条款",
    "severity": "critical|high|medium|low"
  }
]

## 提取示例

**输入**：
"五、废标条款
有下列情形之一的，其投标将被否决：
1. 投标文件未按招标文件规定密封的；
2. 投标文件逾期送达的；
3. 投标人未按要求提交投标保证金的。

技术需求书中标有★的条款为关键参数，必须满足，否则投标无效。"

**输出**：
[
  {
    "riskType": "符合性",
    "description": "投标文件未按招标文件规定密封",
    "sourceText": "投标文件未按招标文件规定密封的，其投标将被否决。",
    "severity": "critical"
  },
  {
    "riskType": "程序性",
    "description": "投标文件逾期送达",
    "sourceText": "投标文件逾期送达的，其投标将被否决。",
    "severity": "critical"
  },
  {
    "riskType": "商务性",
    "description": "未按要求提交投标保证金",
    "sourceText": "投标人未按要求提交投标保证金的，其投标将被否决。",
    "severity": "critical"
  },
  {
    "riskType": "技术性",
    "description": "不满足标有★的关键技术参数",
    "sourceText": "技术需求书中标有★的条款为关键参数，必须满足，否则投标无效。",
    "severity": "critical"
  }
]

## 重要提示

1. **找不到废标条款？** 返回空数组：[]
2. **只输出JSON数组**，不要markdown标记，不要解释
3. **原文优先**：sourceText必须完整保留原文
4. **不确定时先提取**，宁可多不要漏

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
