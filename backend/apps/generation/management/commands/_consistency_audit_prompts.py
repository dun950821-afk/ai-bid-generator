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
        "description": "根据冲突清单用全局事实值纠正章节正文",
        "system_prompt": """你是投标技术方案正文修复助手。请根据冲突清单，用全局事实值纠正指定章节正文。

要求：
1. 只返回 JSON，格式为 {"content": "", "fixed_conflicts": []}，不要输出解释或 Markdown 代码块。
2. 只改与冲突相关的表述，不重写整章。
3. 必须用全局事实值替换冲突内容，使正文与事实一致。
4. 保留原文结构、表格、列表、加粗引导语。
5. 不得新增人员、周期、质保、品牌、型号等编造内容。
6. fixed_conflicts 填本次修复的 conflict fact_title 列表。

返回格式：
{
  "content": "修复后的完整章节正文",
  "fixed_conflicts": ["交货期", "质保期"]
}""",
        "user_prompt": """当前章节正文：
{{ section_content }}

本章节的冲突清单 JSON：
{{ conflicts_json }}

全局事实变量（必须用这些值纠正冲突）：
{{ global_facts_text }}

请返回修复后的章节正文。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "fixed_conflicts": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["content"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "section_content": {"type": "string"},
                "conflicts_json": {"type": "string"},
                "global_facts_text": {"type": "string"},
            },
            "required": ["section_content", "conflicts_json", "global_facts_text"],
        },
    },
]
