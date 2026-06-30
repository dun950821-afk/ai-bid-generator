# backend/apps/generation/management/commands/_bid_check_prompts.py
"""废标检查 prompt 模板（借鉴 OpenBidKit rejectionPrompts.ts）。

严格学习 OpenBidKit 的三轮流程与证据约束：
1. 提取废标项清单（buildInvalidBidAndRejectionItemsPrompt）
2. 第一轮分析（buildRejectionCheckAnalysisMessages）
3. 第二轮检查（buildRejectionCheckInspectionMessages）
4. 第三轮定稿（buildRejectionCheckFinalMessages）
"""

BID_CHECK_TEMPLATES = [
    # ====================================================================
    # 1. 提取无效投标与废标项清单
    # ====================================================================
    {
        "key": "bid_invalid_items_extract.default",
        "name": "废标项清单提取模板",
        "scenario": "bid_invalid_items_extract",
        "description": "从招标文件提取无效投标和废标项清单",
        "system_prompt": """任务：提取并分析招标文件中的"无效投标"和"废标项"。

概念边界：
1. "无效投标"指投标人、投标文件、签章密封、递交时间、报价、保证金、资格条件、实质性响应等原因导致投标被认定为无效、否决、不予受理或按无效响应处理的情形。
2. "废标项"指可能导致项目废标、采购失败、重新招标、终止评审、有效投标人不足或实质性响应不足的条款或风险项。
3. 原文使用"否决投标""投标无效""不予受理""无效响应""重大偏差""实质性偏离""废标情形"等同义表达时，也要按上述边界归类。

输出要求：
1. 必须明确区分"无效投标"和"废标项"。
2. "原文中明确提到的"只能提取招标文件原文中明确出现或同义表达的内容，尽量保留原文关键句；如果没有提及，写"- 原文未提及"。
3. "此类标书还可能涉及的"只补充原文未明确提及、但结合本招标文件类型和招投标经验判断非常重要的高风险遗漏项。
4. 不要罗列所有常见可能项，不要输出泛泛的通用清单；每个小节最多输出 3-5 条。
5. 如果没有明显需要补充的关键项，写"- 暂未发现必须补充的高风险项"。
6. 经验补充项每条前缀使用"重点补充："，并用一句话说明为什么需要关注。
7. 不要使用表格，使用 Markdown 列表。
8. 仅输出下方格式，不要输出解释、过程或额外段落。
9. 不要输出三重引号、代码块标记或其他格式包裹符。

输出格式：
# 原文中明确提到的

## 无效投标
- ...

## 废标项
- ...

# 此类标书还可能涉及的

## 无效投标
- 重点补充：...

## 废标项
- 重点补充：...""",
        "user_prompt": """招标文件原文：

{{ tender_markdown }}""",
        "output_schema": {},
        "variable_schema": {
            "type": "object",
            "properties": {
                "tender_markdown": {"type": "string"},
            },
            "required": ["tender_markdown"],
        },
    },
    # ====================================================================
    # 2. 第一轮：分析
    # ====================================================================
    {
        "key": "bid_check_analysis.default",
        "name": "废标检查分析模板",
        "scenario": "bid_check_analysis",
        "description": "第一轮：分析检查范围，排除纸质事项，梳理重点核查章节",
        "system_prompt": """【废标项检查任务 v1｜第一轮：分析】
请先分析检查范围，不要输出最终风险列表。

分析要求：
1. 梳理"无效投标"和"废标项"中哪些能通过电子投标文件内容判断。
2. 明确排除签字、盖章、密封、纸质正副本、现场递交、开标现场授权到场、纸质文件封装等纸质或线下事项。
3. 结合投标文件目录和正文结构，指出重点核查章节、附件、报价、资格材料、技术/商务响应位置。
4. 判断材料是否缺失时，先识别章节标题、目录项、附件标题、材料清单项、表格条目、页码线索、图片占位线索等结构性文本线索；只要存在这类线索，就不能因为图片或扫描件正文不可见而判定缺失。
5. 如果某项检查需要外部事实、现场行为或纸质原件才能判断，标记为"不纳入电子文件检查"。
6. 仅输出分析结论，使用简体中文。""",
        "user_prompt": """【废标项检查输入 v1｜检查项】
以下内容来自招标文件"无效投标"和"废标项"解析结果。后续任务必须优先基于这些检查口径，不要自行扩大到无法从电子投标文件判断的事项。

{{ invalid_bid_items }}

{% if custom_check_items %}
【废标项检查输入 v1｜自定义检查项】
以下是用户补充的电子投标文件检查关注点。仅在能从电子投标文件正文、目录、附件文本或材料内容中判断时使用；如果涉及签字、盖章、密封、现场递交、纸质正副本等纸质或线下事项，必须忽略。

{{ custom_check_items }}
{% endif %}

【废标项检查输入 v1｜投标文件原文】
以下是完整投标文件 Markdown 原文。后续检查只能引用这份电子投标文件中可见的内容作为证据。

重要限制：当前原文由文本解析得到，图片、扫描件、截图、附件页等非文本内容可能已被过滤或无法完整呈现。检查材料缺失时，不得要求必须看到图片内容、扫描件正文或附件正文；如果投标文件中已经出现某项材料的章节标题、目录项、附件标题、材料清单项、表格条目、页码线索、图片占位线索或其他可表明该材料已插入/已提交的结构性文本线索，应视为该材料至少存在提交线索。

{{ bid_content }}""",
        "output_schema": {},
        "variable_schema": {
            "type": "object",
            "properties": {
                "invalid_bid_items": {"type": "string"},
                "custom_check_items": {"type": "string"},
                "bid_content": {"type": "string"},
            },
            "required": ["invalid_bid_items", "bid_content"],
        },
    },
    # ====================================================================
    # 3. 第二轮：检查
    # ====================================================================
    {
        "key": "bid_check_inspection.default",
        "name": "废标检查检查模板",
        "scenario": "bid_check_inspection",
        "description": "第二轮：逐项检查投标文件，输出初步风险列表",
        "system_prompt": """【废标项检查任务 v1｜第二轮：检查】
请基于第一轮分析逐项检查电子投标文件，输出初步风险列表。

检查要求：
1. 每条风险必须有投标文件中的明确证据；证据不足不要输出。
2. 不检查签字、盖章、密封、纸质正副本、现场递交、纸质原件等事项。
3. 重点关注实质性条款未响应、必要章节或附件缺失、资格材料明显缺失/过期、报价或关键承诺前后矛盾、技术/商务偏离未说明等电子正文可判断风险。
4. 判断"材料缺失"时，只有在目录、章节标题、附件标题、材料清单、正文、表格和其他结构性线索中均找不到对应材料痕迹，才可以输出疑似缺失；不得仅因图片内容、扫描件正文或附件正文不可见而输出缺失风险。
5. 如果投标文件中已有对应材料的结构性文本线索，应视为至少有提交线索，可提示人工复核内容完整性，但不要判定为缺失。
6. 区分风险类型：无效标使用 invalidBid，废标项使用 rejectionItem。
7. 暂不要求 JSON，可用结构化 Markdown 输出初步结果。""",
        "user_prompt": """【废标项检查输入 v1｜检查项】
{{ invalid_bid_items }}

{% if custom_check_items %}
【废标项检查输入 v1｜自定义检查项】
{{ custom_check_items }}
{% endif %}

【废标项检查输入 v1｜投标文件原文】
{{ bid_content }}

【废标项检查任务 v1｜第一轮分析结果】
{{ analysis_result }}""",
        "output_schema": {},
        "variable_schema": {
            "type": "object",
            "properties": {
                "invalid_bid_items": {"type": "string"},
                "custom_check_items": {"type": "string"},
                "bid_content": {"type": "string"},
                "analysis_result": {"type": "string"},
            },
            "required": ["invalid_bid_items", "bid_content", "analysis_result"],
        },
    },
    # ====================================================================
    # 4. 第三轮：定稿
    # ====================================================================
    {
        "key": "bid_check_final.default",
        "name": "废标检查定稿模板",
        "scenario": "bid_check_final",
        "description": "第三轮：去重合并补漏，输出最终 JSON findings",
        "system_prompt": """【废标项检查任务 v1｜第三轮：补充与定稿】
请对第二轮结果去重、合并、补漏，并删除不符合要求的条目，最终只输出 JSON。

定稿规则：
1. 只保留能从电子投标文件原文判断且有明确证据的风险。
2. 删除签字、盖章、密封、纸质正副本、现场递交、纸质原件、开标现场行为等纸质或线下事项。
3. 删除只有猜测、没有投标文件证据、或仅凭常识无法确认的条目。
4. 删除仅因图片内容、扫描件正文或附件正文不可见而产生的材料缺失条目；如果投标文件中存在对应材料的章节标题、目录项、附件标题、材料清单项、表格条目、页码线索、图片占位线索或其他结构性文本线索，不得将该材料定稿为缺失。
5. 同一问题合并为一条，标题简短明确。
6. severity 只能是 high、medium、low；type 只能是 invalidBid 或 rejectionItem。
7. 如果没有符合条件的风险，返回 {"findings":[]}。

JSON 格式：
{
  "findings": [
    {
      "type": "invalidBid",
      "severity": "high",
      "title": "不超过 28 个中文字符的风险标题",
      "summary": "一句话概括风险",
      "requirement": "对应检查依据或招标要求，尽量引用原检查项",
      "bidEvidence": "投标文件中的明确证据、章节、原文摘录或缺失位置说明",
      "riskReason": "为什么该证据可能构成无效标或废标项风险",
      "suggestion": "建议用户如何处理或复核"
    }
  ]
}

仅输出 JSON，不要输出 Markdown、代码块或解释。""",
        "user_prompt": """【废标项检查输入 v1｜检查项】
{{ invalid_bid_items }}

{% if custom_check_items %}
【废标项检查输入 v1｜自定义检查项】
{{ custom_check_items }}
{% endif %}

【废标项检查输入 v1｜投标文件原文】
{{ bid_content }}

【废标项检查任务 v1｜第一轮分析结果】
{{ analysis_result }}

【废标项检查任务 v1｜第二轮初步检查结果】
{{ draft_findings }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "findings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": ["invalidBid", "rejectionItem"]},
                            "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                            "title": {"type": "string"},
                            "summary": {"type": "string"},
                            "requirement": {"type": "string"},
                            "bidEvidence": {"type": "string"},
                            "riskReason": {"type": "string"},
                            "suggestion": {"type": "string"},
                        },
                        "required": ["type", "severity", "title", "summary"],
                    },
                },
            },
            "required": ["findings"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "invalid_bid_items": {"type": "string"},
                "custom_check_items": {"type": "string"},
                "bid_content": {"type": "string"},
                "analysis_result": {"type": "string"},
                "draft_findings": {"type": "string"},
            },
            "required": ["invalid_bid_items", "bid_content", "analysis_result", "draft_findings"],
        },
    },
]
