# backend/apps/generation/management/commands/_section_needs_analysis_prompts.py
"""章节需求分析 prompt 模板。

对应调用方 SectionGenerationService.analyze_section_needs：
输入章节标题/层级/大纲名称/标段名称，输出该章节的分析要点 JSON，
字段与 _get_default_analysis 回退结构保持一致。
"""

SECTION_NEEDS_ANALYSIS_TEMPLATES = [
    {
        "key": "section_needs_analysis.default",
        "name": "章节需求分析模板",
        "scenario": "section_needs_analysis",
        "description": "分析章节生成需求：检索关键词、知识类型、条款类型、背景说明与建议提示词",
        "system_prompt": """你是投标技术方案章节需求分析助手。请根据章节信息分析生成该章节正文需要哪些素材与条款支撑。

要求：
1. keywords 给出 3-8 个检索关键词，用于在知识库中检索该章节可用素材，关键词要具体、贴合章节主题。
2. knowledge_types 给出需要参考的知识类型，如 company_qualification（公司资质）、past_cases（历史业绩）、technical_doc（技术文档）等；不需要时返回空数组。
3. requirement_types 给出该章节需要响应的招标条款类型，如 qualification（资格要求）、scoring（评分项）、tech_req（技术要求）等；不需要时返回空数组。
4. background 用 1-2 句话说明该章节的写作背景与目的。
5. suggested_prompt 给出一段可直接使用的写作提示，指导正文生成的重点与注意事项；无特殊要求时留空字符串。
6. 不要编造具体的人员、周期、品牌、型号等事实性内容。
7. 只返回 JSON，不要输出解释或 Markdown 代码块。

返回格式：
{
  "keywords": ["检索关键词"],
  "knowledge_types": ["知识类型"],
  "requirement_types": ["条款类型"],
  "background": "章节写作背景说明",
  "suggested_prompt": "建议的写作提示词"
}""",
        "user_prompt": """章节标题：{{ section_title }}
章节层级：{{ section_level }}
所属大纲：{{ outline_name }}
标段名称：{{ lot_name }}

请分析该章节的生成需求，返回 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "keywords": {"type": "array", "items": {"type": "string"}},
                "knowledge_types": {"type": "array", "items": {"type": "string"}},
                "requirement_types": {"type": "array", "items": {"type": "string"}},
                "background": {"type": "string"},
                "suggested_prompt": {"type": "string"},
            },
            "required": ["keywords", "knowledge_types", "requirement_types", "background", "suggested_prompt"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "section_title": {"type": "string"},
                "section_level": {"type": "integer"},
                "outline_name": {"type": "string"},
                "lot_name": {"type": "string"},
            },
            "required": ["section_title", "section_level", "outline_name", "lot_name"],
        },
    },
]
