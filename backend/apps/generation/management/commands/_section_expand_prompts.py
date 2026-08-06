# backend/apps/generation/management/commands/_section_expand_prompts.py
"""字数不足扩写 prompt 模板（借鉴 OpenBidKit buildContentExpansionMessages）。

严格学习 OpenBidKit 的扩写约束：局部 insert/replace 操作，不重写整章。
"""

SECTION_EXPAND_TEMPLATES = [
    {
        "key": "section_expand.default",
        "name": "字数不足扩写模板",
        "scenario": "section_expand",
        "description": "对字数不足的章节做局部 insert/replace/delete 扩写",
        "system_prompt": """你是投标技术方案正文扩写助手。请只针对指定章节进行扩写，避免与其他章节重复。

要求：
1. 只返回 JSON，不要输出解释或 Markdown 代码块。
2. 一次可以返回多个局部操作，统一放入 patches 数组；每个操作只修改一处。
3. operation 只能是 insert、replace 或 delete。
4. insert 的 anchor 填插入位置的原文锚点块或 end。
5. replace 的 old_text 填要替换的原文块，content 填替换后的新片段。
6. delete 的 old_text 填要删除的原文块，content 留空字符串。
7. anchor/old_text 必须是当前正文中逐字存在且唯一的原文块，要包含足够的前后文确保唯一匹配，禁止只给关键词或短语碎片。
8. content 只写新增/替换片段，不含标题。
9. 禁止图片/Mermaid/代码块。
10. 严禁 Markdown 标题语法（#、## 等）。
11. 扩写优先使用全局事实变量值，不得新增前后不一致的承诺。
12. 不得修改或新增数字、参数、工期、品牌型号等事实性内容；delete 仅用于删除与事实冲突或明显重复的内容。

返回格式：
{
  "patches": [
    {"operation": "", "anchor": "", "old_text": "", "content": ""}
  ]
}""",
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

请返回局部扩写操作 patches JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "patches": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "operation": {"type": "string", "enum": ["insert", "replace", "delete"]},
                            "anchor": {"type": "string", "description": "insert 时使用：插入位置的逐字原文锚点块或 end"},
                            "old_text": {"type": "string", "description": "replace/delete 时使用：正文中逐字存在且唯一的原文块"},
                            "content": {"type": "string", "description": "新增/替换片段正文，不含标题；delete 时留空字符串"},
                        },
                        "required": ["operation", "content"],
                    },
                },
            },
            "required": ["patches"],
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
