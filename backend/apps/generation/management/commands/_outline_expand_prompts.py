# backend/apps/generation/management/commands/_outline_expand_prompts.py
"""字数补目录 prompt 模板（P3 正文增强）。

大纲级字数不达标时，AI 补充二三四级子目录扩展生成空间。
"""

OUTLINE_EXPAND_TEMPLATES = [
    {
        "key": "outline_expand.default",
        "name": "字数补目录模板",
        "scenario": "outline_expand",
        "description": "大纲级字数不达标时补充二三四级子目录扩展生成空间",
        "system_prompt": """你是投标技术方案目录扩展助手。当前正文总字数不达标，请补充子目录扩展生成空间。

要求：
1. 只补充二三四级子目录，不删现有目录。
2. 新增子目录须挂在现有叶子章节下，level 递增（不超过 5 级）。
3. 不得修改一级目录标题与顺序。
4. 每个新增子目录 write_scope 须明确写作范围，避免与兄弟章节重复。
5. 围绕招标评分大类与细项展开，不越界。
6. 只返回 JSON，不要输出解释或代码块。

返回格式：
{"added_sections": [{"parent_section_id": int, "title": "", "level": int, "write_scope": ""}]}""",
        "user_prompt": """## 项目概述
{{ project_overview }}

## 当前目录结构
{{ outline_structure }}

## 当前字数统计
{{ current_word_stats }}

## 目标总字数
{{ target_total_words }}

## 评分大类
{{ requirement_groups }}

请返回新增子目录 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "added_sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "parent_section_id": {"type": "integer", "description": "挂载的父章节 ID"},
                            "title": {"type": "string", "description": "新子目录标题"},
                            "level": {"type": "integer", "description": "层级（=parent.level+1，≤5）"},
                            "write_scope": {"type": "string", "description": "写作范围"},
                        },
                        "required": ["parent_section_id", "title", "level", "write_scope"],
                    },
                },
            },
            "required": ["added_sections"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "project_overview": {"type": "string"},
                "outline_structure": {"type": "string"},
                "current_word_stats": {"type": "string"},
                "target_total_words": {"type": "integer"},
                "requirement_groups": {"type": "string"},
            },
            "required": ["outline_structure", "target_total_words"],
        },
    },
]
