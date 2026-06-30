# backend/apps/generation/management/commands/_section_plan_prompts.py
"""正文编排决策 prompt 模板（借鉴 OpenBidKit buildChapterContentPlanMessages）。

严格学习 OpenBidKit 的编排决策机制：正文生成前先让 AI 对每章节返回
编排 JSON（writing_focus/knowledge/facts/table/mermaid/image），
表格/配图先规划后执行，全局择优。
"""

SECTION_PLAN_TEMPLATES = [
    {
        "key": "section_content_plan.default",
        "name": "正文编排决策模板",
        "scenario": "section_content_plan",
        "description": "正文生成前对章节做编排决策：表格/Mermaid/配图/知识引用/事实引用",
        "system_prompt": """你是投标技术方案正文编排助手。请根据章节上下文判断本小节最适合的表达方式。

要求：
1. 只返回 JSON，不要输出解释、总结或 Markdown。
2. {{ table_instruction }}
3. {{ table_limit_instruction }}
4. 表格仅在能明显提升表达清晰度时使用，例如归纳职责、步骤、参数、风险、措施、成果等。
{% if mermaid_generation_available %}
5. 可以自行判断是否需要 Mermaid 图；Mermaid 只适合简单、抽象、文本节点型关系图，例如少量节点的流程、层级、时间线或职责关系，不用于复杂工程场景或实物示意。{% else %}
5. 当前未启用 Mermaid 图，mermaid.needed 必须为 false。{% endif %}
{% if image_generation_available %}
6. 可以自行判断是否需要 AI 生图；AI 生图适合设备、现场、机柜、系统架构、部署拓扑、施工/运维场景、工程空间关系、实物示意等更具象的图。{% else %}
6. 当前未启用或不可用 AI 生图，image.needed 必须为 false。{% endif %}
7. Mermaid 图和 AI 生图都只是候选判断，可以同时为 true；系统会在配图阶段保证同一个章节最终只执行一种配图。
8. {{ image_limit_instruction }}
{% if image_generation_available %}
9. 不要求用满 AI 生图上限；但遇到具象工程对象或现场场景时，不要过度保守，可以适度提名候选。没有具象对象、空间关系或实物场景时仍不要硬插。{% else %}
9. 不要为了满足格式而编造 AI 生图需求。{% endif %}
10. priority 含义：3 表示有价值候选，4 表示推荐，5 表示强推荐；只有达到 3 才将 image.needed 设为 true。
11. knowledge.item_ids 只能从参考知识库轻量条目的 id 中选择；可以多选，可以为空数组；不要编造 id，不要输出 reason。
12. facts.titles 只能从全局事实变量标题清单中选择；请选择编写本章节正文时会用到的变量组标题，可以多选，可以为空数组；不要编造标题，不要输出具体变量内容。
13. writing_focus 用 1-2 句话概括本节正文重点，只围绕当前章节标题和描述，不展开成正文，不编造具体承诺、参数、周期、品牌或型号。
14. 编排判断必须结合招标文件关键信息和全局事实变量标题，不要规划会造成时间、地点、人员、设备、标准或服务承诺前后不一致的表达。""",
        "user_prompt": """参考知识库轻量条目（只包含 id、标题和简介，不包含正文；如无合适条目，knowledge.item_ids 返回空数组）：
{{ knowledge_items_json }}

招标文件关键信息（用于判断正文需要引用哪些事实）：
{{ bid_key_info }}

{% if global_fact_titles %}
Step04 全局事实变量标题清单（编排时只能选择标题，不要输出具体变量内容）：
{{ global_fact_titles }}
{% endif %}
{% if parent_chapters %}
上级章节信息：
{{ parent_chapters }}
{% endif %}
{% if sibling_chapters %}
同级章节信息（避免重复）：
{{ sibling_chapters }}
{% endif %}
{% if regenerate_requirement %}
用户对本次重新生成的额外要求：
{{ regenerate_requirement }}
{% endif %}

请为以下章节返回正文编排 JSON：

章节ID: {{ chapter_id }}
章节标题: {{ chapter_title }}
章节描述: {{ chapter_description }}

JSON 格式：
{
  "writing_focus": "1-2 句话说明本节正文重点展开什么，只聚焦当前章节，不写成正文",
  "knowledge": {
    "item_ids": ["从参考知识库轻量条目中选择的 id；没有合适条目时返回空数组"]
  },
  "facts": {
    "titles": ["从全局事实变量标题清单中选择正文会用到的变量组标题；没有需要引用的变量时返回空数组"]
  },
  "table": {
    "needed": true,
    "purpose": "说明表格在本小节中要表达什么；不需要表格时留空"
  },
  "mermaid": {
    "needed": false,
    "title": "Mermaid 图标题；不需要时留空",
    "code": "合法 Mermaid 代码，不包含 Markdown 代码围栏；不需要时留空",
    "priority": 3,
    "reason": "为什么适合或不适合 Mermaid 图"
  },
  "image": {
    "needed": false,
    "style": "engineering_diagram 或 realistic_photo；不需要配图时留空",
    "title": "图片标题；不需要配图时留空",
    "prompt": "用于生图模型的中文提示词；不需要配图时留空",
    "priority": 3,
    "reason": "为什么适合或不适合 AI 生图"
  }
}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "writing_focus": {"type": "string"},
                "knowledge": {
                    "type": "object",
                    "properties": {"item_ids": {"type": "array", "items": {"type": "string"}}},
                },
                "facts": {
                    "type": "object",
                    "properties": {"titles": {"type": "array", "items": {"type": "string"}}},
                },
                "table": {
                    "type": "object",
                    "properties": {
                        "needed": {"type": "boolean"},
                        "purpose": {"type": "string"},
                    },
                },
                "mermaid": {
                    "type": "object",
                    "properties": {
                        "needed": {"type": "boolean"},
                        "title": {"type": "string"},
                        "code": {"type": "string"},
                        "priority": {"type": "integer"},
                        "reason": {"type": "string"},
                    },
                },
                "image": {
                    "type": "object",
                    "properties": {
                        "needed": {"type": "boolean"},
                        "style": {"type": "string"},
                        "title": {"type": "string"},
                        "prompt": {"type": "string"},
                        "priority": {"type": "integer"},
                        "reason": {"type": "string"},
                    },
                },
            },
            "required": ["writing_focus", "knowledge", "facts", "table", "mermaid", "image"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "chapter_id": {"type": "string"},
                "chapter_title": {"type": "string"},
                "chapter_description": {"type": "string"},
                "knowledge_items_json": {"type": "string"},
                "bid_key_info": {"type": "string"},
                "global_fact_titles": {"type": "string"},
                "parent_chapters": {"type": "string"},
                "sibling_chapters": {"type": "string"},
                "regenerate_requirement": {"type": "string"},
                "table_instruction": {"type": "string"},
                "table_limit_instruction": {"type": "string"},
                "mermaid_generation_available": {"type": "boolean"},
                "image_generation_available": {"type": "boolean"},
                "image_limit_instruction": {"type": "string"},
            },
            "required": ["chapter_id", "chapter_title", "chapter_description", "knowledge_items_json", "bid_key_info", "table_instruction", "table_limit_instruction", "mermaid_generation_available", "image_generation_available", "image_limit_instruction"],
        },
    },
]
