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
 * 分段提取Prompt - 评分标准（优化版V2）
 * 精准提取评分大类和评分细项
 */
export const EXTRACT_SCORING_PROMPT = `
你是专业的招标文件评分标准提取专家。你的任务是从招标文档中提取**所有**评分项，不得遗漏任何一项。

## 评分标准的常见位置
评分标准通常出现在以下章节：
1. "评分标准"、"评审标准"、"评标办法"、"评标方法"
2. "综合评分法"、"评分细则"、"评分表"
3. 可能在"投标人须知"、"评标办法"、"评审程序"等章节中

## 评分标准表格的常见格式

### 格式1：标准表格（最常见）
| 序号 | 评分项 | 评分细则 | 分值 |
|------|--------|----------|------|
| 1    | 整体实力（5分） | ... | |
| 1.1  | 企业认证 | 投标人通过ISO9001...得1分 | 1 |
| 1.2  | 企业资质 | 投标人具有CMMI3级...得2分 | 2 |

### 格式2：层级表格
| 序号 | 评审项目 | 评分标准 | 分值 |
|------|----------|----------|------|
| 一 | 技术评分（60分） | | 60 |
| 1 | 解决方案 | ... | 30 |
| 2 | 项目管理 | ... | 20 |
| 3 | 人员配置 | ... | 10 |

### 格式3：带评分依据的表格
| 序号 | 评分项 | 分值 | 评分细则 | 评分依据 |
|------|--------|------|----------|----------|
| 1 | 企业认证 | 1 | 通过ISO9001认证得1分 | 提供证书复印件 |

### 格式4：文字描述形式
"技术评分（60分）：
1. 解决方案（30分）：根据投标人提供的技术方案...
2. 项目管理（20分）：项目实施方案完整、可行..."

## 提取规则

### 规则1：识别评分大类
- 大类通常带总分，如"技术评分（60分）"、"商务部分（30分）"
- 相同序号前缀的行属于同一个大类（如1.1、1.2属于大类1）
- 大类名称中的分数提取到totalScore字段

### 规则2：识别评分细项
- 每个可独立得分的项目是一个细项
- 细项的分值提取到itemScore字段（必须是纯数字）
- 如果细则中有分数范围（如"得3-5分"），取最高值

### 规则3：分类评分类型
- **technical（技术）**：解决方案、技术方案、项目管理、人员配置、案例经验、整体实力、技术响应等
- **business（商务）**：商务响应、服务承诺、价格响应、资质证书、业绩等
- **price（价格）**：价格分、报价评分、投标报价等

### 规则4：保留原文
- rule字段：完整保留评分细则原文，不要概括或改写
- basis字段：完整保留评分依据原文

### 规则5：处理特殊标记
- 带"★"或"必须满足"的参数是关键参数
- 引用"技术需求书x.x.x"的内容提取到techDocRef字段

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
          "rule": "投标人通过ISO9001质量管理体系认证，得1分。",
          "basis": "投标文件中提供证书复印件加盖公章",
          "techDocRef": null
        },
        {
          "subItem": "企业资质",
          "itemScore": 2,
          "rule": "投标人具有CMMI能力成熟度3级（含）以上认证，得2分。",
          "basis": "投标文件中提供证书复印件加盖公章",
          "techDocRef": null
        }
      ]
    },
    {
      "seq": 2,
      "category": "解决方案",
      "totalScore": 30,
      "categoryType": "technical",
      "items": [
        {
          "subItem": "方案完整性",
          "itemScore": 10,
          "rule": "技术方案完整、详细、可行，得8-10分；方案较完整、可行，得5-7分；方案一般或有缺陷，得0-4分。",
          "basis": "根据投标文件技术部分评审",
          "techDocRef": null
        }
      ]
    }
  ]
}

## 重要提示
1. **必须提取所有评分项**：遗漏评分项会导致投标人无法准确响应
2. **即使评分标准分散在不同章节，也要全部汇总**
3. **如果文档中没有评分标准**，返回空数组：{"evaluationCriteria": []}
4. **只输出JSON**，不要任何解释、markdown标记或额外说明

招标文档:
{documentContent}

输出JSON:
`;

/**
 * 分段提取Prompt - 废标风险（优化版V2）
 * 包含废标条款、重大偏离、投标限制、诚信要求、法律合规
 */
export const EXTRACT_RISKS_PROMPT = `
你是专业的招标文档废标风险分析专家。你的任务是从招标文档中提取**所有**可能导致废标或投标失败的风险条款。

## 废标条款的常见位置
废标条款通常出现在以下章节：
1. "废标条款"、"废标情形"、"无效投标"、"否决投标"
2. "投标人须知"、"投标须知前附表"
3. "资格性检查"、"符合性检查"、"资格审查"
4. "投标文件的编制"、"投标文件的递交"
5. "评标办法"、"评标程序"、"评标标准"

## 需要提取的风险类型

### 1. 资格性风险（riskType: "资格性"）
- 投标人不具备规定的资格条件
- 未提供营业执照、资质证书等证明文件
- 资质等级不符合要求
- 注册资金、成立时间不符合要求
- 业绩要求不满足

### 2. 符合性风险（riskType: "符合性"）
- 投标文件未按格式要求编制
- 投标文件缺少必要的签字盖章
- 投标文件密封不符合要求
- 投标文件递交时间逾期
- 投标文件内容不完整

### 3. 技术性风险（riskType: "技术性"）
- 不满足关键技术参数（带★或"必须满足"的参数）
- 技术方案存在重大偏离
- 技术响应不符合招标要求

### 4. 商务性风险（riskType: "商务性"）
- 投标报价超过预算
- 投标保证金未按时缴纳
- 投标有效期不符合要求
- 服务期、质保期不符合要求

### 5. 程序性风险（riskType: "程序性"）
- 未按时递交投标文件
- 未按规定方式递交
- 未参加开标会议

## 常见的废标表述关键词
- "废标"、"无效投标"、"否决投标"、"不予受理"
- "投标文件有下列情形之一的，将被拒绝/否决/视为无效"
- "出现以下情形之一的，其投标将被否决"
- "有下列情形之一的，评标委员会应当否决其投标"
- "资格性检查不合格"、"符合性检查不合格"
- "不予评审"、"不予进入详细评审"
- "按无效标处理"、"作废标处理"
- "不得进入下一阶段评审"

## 严重程度判断标准
- **critical**：直接导致废标，无协商余地
- **high**：极有可能导致废标，需特别注意
- **medium**：可能影响评分或导致扣分
- **low**：轻微问题，影响较小

## 输出JSON格式
[
  {
    "riskType": "资格性",
    "description": "投标人未提供有效的营业执照副本复印件",
    "sourceText": "未提供有效的营业执照副本复印件的，其投标将被否决。",
    "severity": "critical"
  },
  {
    "riskType": "符合性",
    "description": "投标文件未按招标文件规定密封",
    "sourceText": "投标文件未按招标文件规定密封的，评标委员会应当否决其投标。",
    "severity": "critical"
  },
  {
    "riskType": "技术性",
    "description": "不满足技术需求书中标注★的关键技术参数",
    "sourceText": "凡标有★的技术条款必须满足，否则将导致废标。",
    "severity": "critical"
  }
]

## 提取规则
1. **逐条提取**：每个独立的废标情形单独一条
2. **保留原文**：sourceText字段必须完整保留原文表述
3. **简洁描述**：description字段用简洁语言概括风险内容
4. **准确分类**：根据风险性质选择正确的riskType
5. **评估严重程度**：根据是否直接导致废标判断severity

## 重要提示
1. **必须提取所有废标条款**：遗漏可能导致投标失败
2. **即使条款分散在多处，也要全部提取**
3. **如果文档中没有明确的废标条款**，返回空数组：[]
4. **只输出JSON数组**，不要任何解释或markdown标记

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
