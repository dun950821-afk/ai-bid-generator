# backend/apps/generation/management/commands/_section_expand_prompts.py
"""字数不足扩写 prompt 模板（借鉴 OpenBidKit buildContentExpansionMessages）。

严格学习 OpenBidKit 的扩写约束：局部 insert/replace 操作，不重写整章。
"""

SECTION_EXPAND_TEMPLATES = [
    {
        "key": "section_expand.default",
        "name": "字数不足扩写模板",
        "scenario": "section_expand",
        "description": "对字数不足的章节做局部 insert/replace 扩写",
        "system_prompt": """你是投标技术方案正文扩写助手。请只针对指定章节进行扩写，避免与其他章节重复。

要求：
1. 只返回 JSON，不要输出解释或 Markdown 代码块。
2. 只返回一次局部扩写操作。
3. operation 只能 insert 或 replace。
4. insert 的 anchor 填插入位置或 end。
5. replace 的 anchor 必须填要替换的原段落关键摘录。
6. content 只写新增/替换片段，不含标题。
7. 禁止图片/Mermaid/代码块。
8. 严禁 Markdown 标题语法（#、## 等）。
9. 扩写优先使用全局事实变量值，不得新增前后不一致的承诺。

返回格式：
{"operation": "", "anchor": "", "content": ""}""",
        "user_prompt": """## 项目概述
{{ project_overview }}

## 完整目录结构
{{ outline_structure }}

## 全局事实变量（必须优先使用，保持前后一致）
{{ selected_facts }}

## 当前章节路径
{{ chapter_path }}

## 当前章节描述
{{ chapter_description }}

## 同级章节（避免重复）
{{ sibling_chapters }}

## 当前正文（字数 {{ current_words }}，目标 {{ target_words }}）
{{ current_content }}

请返回一次局部扩写操作 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "operation": {"type": "string", "enum": ["insert", "replace"]},
                "anchor": {"type": "string", "description": "insert: end 或段落摘录；replace: 必填要替换的段落摘录"},
                "content": {"type": "string", "description": "新增/替换片段正文，不含标题"},
            },
            "required": ["operation", "anchor", "content"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "project_overview": {"type": "string"},
                "outline_structure": {"type": "string"},
                "selected_facts": {"type": "string"},
                "chapter_path": {"type": "string"},
                "chapter_description": {"type": "string"},
                "sibling_chapters": {"type": "string"},
                "current_content": {"type": "string"},
                "current_words": {"type": "integer"},
                "target_words": {"type": "integer"},
            },
            "required": ["current_content", "current_words", "target_words"],
        },
    },
]
