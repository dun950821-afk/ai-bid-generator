/**
 * 标书大纲生成Prompt模板
 */

/**
 * JSON输出约束（通用）
 */
const JSON_OUTPUT_RULES = `
【JSON输出规范 - 必须严格遵守】
1. 所有字符串值必须使用英文双引号 "" 包围
2. 字符串内如果有引号，必须转义为 \\"
3. 禁止使用中文引号 "" 和 '' 
4. 确保JSON格式完整，对象以 } 结束，数组以 ] 结束
5. 不要在JSON外添加任何解释或markdown标记
6. 示例正确格式："mainPoints": ["必须满足\"注册资金不低于300万元\"的要求"]
7. 示例错误格式："mainPoints": ["必须满足"注册资金不低于300万元"的要求"]  ← 中文引号错误
`;

/**
 * 章节编号规范
 */
const SECTION_NUMBERING_RULES = `
【章节编号规范 - 必须严格遵守】

## 编号格式要求

### 一级章节（level=1）
- 使用中文数字编号，格式为：一、二、三、四、五、六、七、八、九、十...
- 标题格式示例：
  - 一、投标函
  - 二、法定代表人授权书
  - 三、技术方案
  - 四、商务部分
  - 五、报价部分

### 二级章节（level=2）
- 使用阿拉伯数字编号，格式为：父章节序号.子章节序号
- **父章节序号规则**："一"对应1，"二"对应2，"三"对应3，以此类推
- 标题格式示例：
  - 1.1 投标函（属于"一、投标函"的子章节）
  - 1.2 投标函附录（属于"一、投标函"的子章节）
  - 2.1 法定代表人授权书正文（属于"二、法定代表人授权书"的子章节）
  - 3.1 项目理解（属于"三、技术方案"的子章节）
  - 3.2 技术方案
  - 3.3 实施方案

### 三级章节（level=3）
- 使用阿拉伯数字编号，格式为：父章节号.子章节号.孙章节号
- 标题格式示例：
  - 3.1.1 项目背景
  - 3.1.2 需求分析
  - 3.2.1 总体架构
  - 3.2.2 技术选型

## title字段格式要求

在输出的JSON中，title字段必须包含完整编号：
- 一级章节："一、投标函"（不是"投标函"）
- 二级章节："1.1 投标函"（不是"投标函"）
- 三级章节："3.1.1 项目背景"（不是"项目背景"）

## 完整示例

正确示例：
\`\`\`json
{
  "sections": [
    {
      "id": "section-001",
      "title": "一、投标函",
      "level": 1,
      "order": 1,
      "children": [
        {
          "id": "section-001-01",
          "title": "1.1 投标函",
          "level": 2,
          "order": 1
        },
        {
          "id": "section-001-02",
          "title": "1.2 投标函附录",
          "level": 2,
          "order": 2
        }
      ]
    },
    {
      "id": "section-002",
      "title": "二、法定代表人授权书",
      "level": 1,
      "order": 2
    },
    {
      "id": "section-003",
      "title": "三、技术方案",
      "level": 1,
      "order": 3,
      "children": [
        {
          "id": "section-003-01",
          "title": "3.1 项目理解",
          "level": 2,
          "order": 1
        },
        {
          "id": "section-003-02",
          "title": "3.2 技术方案",
          "level": 2,
          "order": 2
        },
        {
          "id": "section-003-03",
          "title": "3.3 实施方案",
          "level": 2,
          "order": 3
        },
        {
          "id": "section-003-04",
          "title": "3.4 质量保证",
          "level": 2,
          "order": 4
        }
      ]
    },
    {
      "id": "section-004",
      "title": "四、商务部分",
      "level": 1,
      "order": 4,
      "children": [
        {
          "id": "section-004-01",
          "title": "4.1 公司资质",
          "level": 2,
          "order": 1
        },
        {
          "id": "section-004-02",
          "title": "4.2 业绩案例",
          "level": 2,
          "order": 2
        },
        {
          "id": "section-004-03",
          "title": "4.3 项目团队",
          "level": 2,
          "order": 3
        }
      ]
    },
    {
      "id": "section-005",
      "title": "五、报价部分",
      "level": 1,
      "order": 5,
      "children": [
        {
          "id": "section-005-01",
          "title": "5.1 报价汇总表",
          "level": 2,
          "order": 1
        },
        {
          "id": "section-005-02",
          "title": "5.2 报价明细表",
          "level": 2,
          "order": 2
        }
      ]
    }
  ]
}
\`\`\`

错误示例（不要这样写）：
\`\`\`json
{
  "sections": [
    {
      "title": "投标函",  // ❌ 缺少编号
      "level": 1
    },
    {
      "title": "技术方案",  // ❌ 缺少编号
      "level": 1,
      "children": [
        {
          "title": "项目理解",  // ❌ 缺少编号
          "level": 2
        }
      ]
    }
  ]
}
\`\`\`
`;

export const OUTLINE_GENERATION_PROMPT = `
你是专业的标书编制专家，精通政府采购和招投标相关法规。请根据招标文档的评分项和废标风险，生成标书大纲。

${JSON_OUTPUT_RULES}

${SECTION_NUMBERING_RULES}

## 核心原则

1. **评分驱动**：标书结构必须100%覆盖所有评分项
2. **风险规避**：废标风险项必须有对应章节进行响应
3. **结构清晰**：层级分明，逻辑严密
4. **内容指引**：为每个章节提供内容要点和素材建议
5. **编号规范**：严格遵守章节编号规范，一级用中文数字，二级用阿拉伯数字

## 大纲结构要求

### 1. 基础章节（必须包含）
- 一、投标函
- 二、投标人资格声明
- 三、法定代表人授权书
- 四、投标保证金缴纳凭证

### 2. 技术部分（根据技术评分项生成）
根据提取的技术评分项，设计对应章节结构：
- 五、技术方案
  - 5.1 系统架构设计
  - 5.2 功能模块设计
  - 5.3 技术实现方案
  - 5.4 性能优化方案
  - 5.5 安全保障方案
- 六、项目实施方案
  - 6.1 实施计划
  - 6.2 进度安排
  - 6.3 资源配置
  - 6.4 质量保障
- 七、售后服务方案
  - 7.1 服务承诺
  - 7.2 培训计划
  - 7.3 运维保障

### 3. 商务部分（根据商务评分项生成）
根据提取的商务评分项，设计对应章节结构：
- 八、企业资质
- 九、业绩案例
- 十、团队配置
- 十一、服务承诺

### 4. 报价部分
- 十二、投标报价明细表
  - 12.1 报价汇总表
  - 12.2 报价明细表
  - 12.3 成本分析

## 映射矩阵要求

为每个评分项建立到章节的映射：
- 评分项ID
- 对应章节ID
- 响应策略
- 素材来源（知识库引用）

## 废标风险响应要求

为每个废标风险项设计响应方案：
- 风险项ID
- 对应章节位置
- 响应内容要点
- 所需证明材料

## JSON Schema

请严格按照以下Schema输出：

\`\`\`json
{
  "outline": {
    "title": "标书标题",
    "totalScore": 100,
    "sections": [
      {
        "id": "section-001",
        "title": "一、投标函",
        "level": 1,
        "order": 1,
        "isRequired": true,
        "sectionType": "basic",
        "scoringItemIds": [],
        "riskIds": [],
        "contentGuide": {
          "mainPoints": ["要点1", "要点2"],
          "materialSuggestions": ["建议素材1"],
          "knowledgeBaseQueries": ["查询关键词1"]
        },
        "children": [
          {
            "id": "section-001-01",
            "title": "1.1 投标函正文",
            "level": 2,
            "order": 1,
            "isRequired": true,
            "scoringItemIds": ["item-id-1"],
            "contentGuide": {
              "mainPoints": ["子要点1"],
              "materialSuggestions": [],
              "knowledgeBaseQueries": []
            }
          }
        ]
      }
    ]
  },
  "mappingMatrix": {
    "scoringItemMappings": [
      {
        "scoringItemId": "item-id-1",
        "scoringItemName": "评分项名称",
        "maxScore": 10,
        "sectionId": "section-001",
        "sectionTitle": "对应章节",
        "responseStrategy": "响应策略描述",
        "coverageScore": 100
      }
    ],
    "riskMappings": [
      {
        "riskId": "risk-id-1",
        "riskDescription": "风险描述",
        "severity": "critical",
        "sectionId": "section-001",
        "sectionTitle": "对应章节",
        "responseContent": "响应内容要点",
        "requiredMaterials": ["材料1", "材料2"]
      }
    ]
  },
  "coverageReport": {
    "totalScoringItems": 15,
    "coveredScoringItems": 15,
    "coverageRate": 100,
    "totalRisks": 10,
    "respondedRisks": 10,
    "riskResponseRate": 100,
    "uncoveredItems": [],
    "unrespondedRisks": []
  }
}
\`\`\`

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
`;
