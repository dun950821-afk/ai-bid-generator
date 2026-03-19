/**
 * 任务解析器 Prompt 模板
 * 用于将招标文档解析为结构化任务树
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
6. 示例正确格式："mainPoints": ["必须满足\\"注册资金不低于300万元\\"的要求"]
7. 示例错误格式："mainPoints": ["必须满足"注册资金不低于300万元"的要求"]  ← 中文引号错误
`;

/**
 * 任务解析器主 Prompt
 */
export const TASK_ANALYZER_PROMPT = `
你是一个资深的政企招投标分析专家。你的任务是阅读招标文档，并将其拆解为可供下游AI逐节生成的"标书生成任务树"。

${JSON_OUTPUT_RULES}

## 【拆解原则】

### 1. 任务类型分类

**表单类章节（Rule-Based-Form）**：标记任务类型为 "Rule-Based-Form"（规则表单填充）
- 包括：封面、目录、索引表、投标函、授权书、承诺函等
- 此类任务无需长文本生成，仅需使用模板引擎填充变量
- 特点：格式固定、内容可预定义、不需要创意

**数据填空类章节（Data-Filling）**：标记任务类型为 "Data-Filling"（数据填空）
- 包括：投标一览表、偏离表、基本信息表、财务报表等
- 需要LLM从招标文档或企业资料中提取信息后填充
- 特点：需要理解上下文、提取关键数据

**文本创作类章节（Text-Generation）**：标记任务类型为 "Text-Generation"（文本生成）
- 必须**深度切分**，单次生成字数预期不超过1500字
- 特别注意"技术方案"章节，必须拆分为独立子任务
- 特点：需要专业创作、逻辑连贯、响应评分标准

### 2. 技术方案章节切分规则

"技术方案"章节是标书的核心，必须按以下结构切分：

**（一）技术方案主体**
- 11.1 投标人整体实力展示
- 11.2 对本项目需求和目标的深刻理解
- 11.3 总体技术方案与规划设计
- 11.4 项目组织实施与管理体系
- 11.5 项目实施风险点与应对措施
- 11.6 维保、售后及知识转移方案

**（二）拟派服务团队与人员投入**
- 11.7 参与本项目主要人员名单及梯队建设
- 11.8 主要人员简历表与资质证明材料

**（三）同类项目案例经验详述**
- 11.9.1 股份制银行项目经验展示
- 11.9.2 大型金融机构项目经验展示

### 3. 评分标准绑定

必须将《详细评审索引表》中的打分项，强制绑定到对应的文本生成章节中作为"必须响应的得分点"：
- scoring_item_id: 评分项唯一标识
- scoring_item_name: 评分项名称
- max_score: 满分值
- scoring_criteria: 评分标准原文
- response_strategy: 响应策略建议
- key_points: 必须响应的关键点

### 4. 上下文依赖

记录章节间的依赖关系，确保前后文一致性：
- task_id: 依赖的任务ID
- dependency_type: 'content' | 'outline' | 'data'
- description: 依赖描述

## 【输出格式】

请严格按照以下JSON Schema输出：

\`\`\`json
{
  "project_info": {
    "project_name": "项目名称",
    "project_number": "招标编号",
    "purchase_unit": "采购单位",
    "bidder_name": "投标人名称（如有）",
    "tech_summary": "300字技术需求摘要"
  },
  "tasks": [
    {
      "id": "section-11-1",
      "task_code": "section-11-1",
      "chapter_id": "11.1",
      "chapter_name": "投标人整体实力展示",
      "title": "11.1 投标人整体实力展示",
      "level": 2,
      "task_type": "Text-Generation",
      "task_group": "technical",
      "word_limit": 1500,
      "scoring_bindings": [
        {
          "scoring_item_id": "score-overall",
          "scoring_item_name": "整体实力",
          "max_score": 5,
          "scoring_criteria": "企业认证、人才储备、行业经验",
          "response_strategy": "展示核心企业认证与资质、复合型安全人才储备、团队经验",
          "key_points": ["核心企业认证与资质展现", "复合型安全人才储备情况"]
        }
      ],
      "requirements": {
        "must_include": ["核心企业认证与资质", "安全人才储备", "开发安全领域经验"],
        "format_rules": [],
        "word_limit": 1500,
        "prohibited_terms": []
      },
      "context_dependencies": [],
      "review_required": false,
      "execution_order": 31,
      "parallel_group": "tech-parallel-1",
      "children": []
    }
  ],
  "execution_plan": {
    "total_tasks": 50,
    "by_type": {
      "rule_based_form": 20,
      "data_filling": 15,
      "text_generation": 15
    },
    "phases": [
      {
        "phase_id": "phase-1",
        "phase_name": "模板填充阶段",
        "tasks": ["section-cover", "section-index"],
        "execution_mode": "parallel",
        "estimated_duration": "instant"
      }
    ],
    "review_points": [
      {
        "task_id": "section-03",
        "reason": "投标一览表涉及报价，算术错误可能导致废标",
        "priority": "critical"
      }
    ]
  }
}
\`\`\`

仅输出符合Schema的纯JSON内容，不要包含任何额外解释或说明。
`;

/**
 * 构建任务解析请求 Prompt
 */
export function buildTaskAnalyzerPrompt(
  projectName: string,
  scoringItems: any[],
  tenderContent: string,
  customInstructions?: string
): string {
  const scoringText = scoringItems.map((item, idx) => 
    `${idx + 1}. ${item.item_name}（${item.item_type}，满分${item.max_score}分）
   - 评分标准：${item.scoring_rules || '详见招标文档'}
   - 细则：${Array.isArray(item.score_details) ? item.score_details.join('；') : '无'}`
  ).join('\n');

  return `
${TASK_ANALYZER_PROMPT}

---

## 项目信息
- 项目名称：${projectName}

## 招标文档内容（关键部分）
${tenderContent.substring(0, 30000)}

## 评分项目列表（共${scoringItems.length}项，需全部覆盖）

${scoringText}

## 自定义要求
${customInstructions || '无'}

---

请根据以上信息，生成完整的标书任务树。确保：
1. 所有评分项都有对应章节覆盖
2. 技术方案章节按照规范切分
3. 每个文本生成任务字数限制在1500字以内
4. 报价表等关键内容标记为需要人工复核

请直接输出JSON格式结果：`;
}

/**
 * 从LLM响应中解析任务树
 */
export function parseTaskTreeResponse(response: string): {
  success: boolean;
  data?: any;
  error?: string;
} {
  try {
    // 尝试直接解析
    let data = JSON.parse(response);
    
    // 如果有嵌套的 tasks 字段
    if (data.tasks && Array.isArray(data.tasks)) {
      return { success: true, data };
    }
    
    // 如果有嵌套结构
    if (data.outline?.tasks) {
      return { success: true, data: data.outline };
    }
    
    return { success: true, data };
  } catch (error) {
    // 尝试提取JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0]);
        return { success: true, data };
      } catch (e) {
        return { success: false, error: 'JSON解析失败' };
      }
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '解析失败' 
    };
  }
}
