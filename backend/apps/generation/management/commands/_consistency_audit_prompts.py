# backend/apps/generation/management/commands/_consistency_audit_prompts.py
"""一致性审计 prompt 模板（借鉴 OpenBidKit buildConsistencyAuditMessages）。

严格学习 OpenBidKit 的审计与修复 prompt 约束。
"""

CONSISTENCY_AUDIT_TEMPLATES = [
    {
        "key": "consistency_audit.default",
        "name": "一致性审计模板",
        "scenario": "consistency_audit",
        "description": "按一级目录分组审计正文与全局事实的冲突",
        "system_prompt": """你是投标技术方案全文一致性审计助手。请审计本组正文是否与给定事实冲突。

要求：
1. 只返回 JSON，不要输出解释、总结或 Markdown 代码块。
2. 只找正文中已经明确写出、且与事实相违背的内容。
3. 正文没有涉及某条事实时，不要报告缺失，不要建议补充。
4. 不报告文风、质量、重复、篇幅、表达优化等问题。
5. section_id 必须来自允许的目录编号清单，禁止编造编号。
6. 只筛选冲突目录编号和冲突证据，不要重写正文。

返回格式：
{
  "conflicts": [
    {
      "section_id": "1.2.3",
      "fact_title": "相关事实变量标题",
      "evidence": "正文中的冲突原文摘录",
      "reason": "为什么与事实冲突",
      "severity": "high"
    }
  ]
}""",
        "user_prompt": """Step04 全局事实变量：
{{ global_facts_text }}

招标文件关键信息（项目信息、甲方信息、交货和服务要求）：
{{ bid_key_info }}

允许返回的目录编号清单：
{{ allowed_section_ids }}

待审计正文分组：
{{ group_content }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "conflicts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "section_id": {"type": "string"},
                            "fact_title": {"type": "string"},
                            "evidence": {"type": "string"},
                            "reason": {"type": "string"},
                            "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                        },
                        "required": ["section_id", "fact_title", "evidence", "reason", "severity"],
                    },
                },
            },
            "required": ["conflicts"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "global_facts_text": {"type": "string"},
                "bid_key_info": {"type": "string"},
                "allowed_section_ids": {"type": "string"},
                "group_content": {"type": "string"},
            },
            "required": ["global_facts_text", "allowed_section_ids", "group_content"],
        },
    },
    {
        "key": "consistency_repair.default",
        "name": "一致性修复模板",
        "scenario": "consistency_repair",
        "description": "根据冲突清单用全局事实值生成局部 patch 纠正章节正文",
        "system_prompt": """你是投标技术方案正文一致性修复助手。请只针对当前小节返回局部精确替换 patch。

要求：
1. 只返回 JSON，不要输出解释、总结或 Markdown 代码围栏。
2. 不要返回完整正文，只返回需要局部替换的 patches。
3. 事实输入比当前小节实际需要的更多；正文没有涉及的事实必须忽略。
4. 目标只修正正文中与事实冲突的内容，不要参照事实重写或扩充正文。
5. 不要优化文风，不要新增无关事实，不要新增新的承诺。
6. old_text 必须是当前小节正文中逐字存在的原文块，建议包含足够前后上下文，确保只出现一次。
7. 如果修改表格，old_text 必须包含完整表格行或完整表格块，不要只返回单元格碎片。
8. new_text 是替换后的正文块，不要包含章节标题，不要包含行号。
9. 保留 Markdown 表格、列表、代码块、图片和 Mermaid 块结构。
10. start_line/end_line 使用下方带行号正文中的 1-based 行号；如果不确定也必须提供可唯一匹配的 old_text。

返回格式：
{
  "patches": [
    {
      "section_id": "当前小节编号",
      "start_line": 2,
      "end_line": 4,
      "old_text": "当前正文中逐字存在且唯一的原文块，不包含行号",
      "new_text": "替换后的正文块，不包含行号",
      "reason": "修复了哪个事实冲突"
    }
  ]
}""",
        "user_prompt": """全局事实变量（必须用这些值纠正冲突）：
{{ global_facts_text }}

当前小节编号：{{ section_id }}

本章节的冲突清单 JSON：
{{ conflicts_json }}

当前小节正文（带行号；patch 的 old_text/new_text 不要包含这些行号）：
{{ section_content_with_line_numbers }}

{% if previous_attempt_errors %}上次返回的以下 patch 无法在正文中唯一匹配：{{ previous_attempt_errors }}，请修正 old_text 后重新返回。{% endif %}

patches[*].section_id 必须是 {{ section_id }}。请只返回 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "patches": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "section_id": {"type": "string"},
                            "start_line": {"type": "integer"},
                            "end_line": {"type": "integer"},
                            "old_text": {"type": "string"},
                            "new_text": {"type": "string"},
                            "reason": {"type": "string"},
                        },
                        "required": ["section_id", "old_text", "new_text"],
                    },
                },
            },
            "required": ["patches"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "section_id": {"type": "string"},
                "section_content": {"type": "string"},
                "section_content_with_line_numbers": {"type": "string"},
                "conflicts_json": {"type": "string"},
                "global_facts_text": {"type": "string"},
                "previous_attempt_errors": {"type": "string", "description": "上次无法唯一匹配的 patch 及原因（可选）"},
            },
            "required": ["section_id", "section_content", "section_content_with_line_numbers", "conflicts_json", "global_facts_text"],
        },
    },
]
