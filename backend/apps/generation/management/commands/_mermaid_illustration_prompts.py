# backend/apps/generation/management/commands/_mermaid_illustration_prompts.py
"""Mermaid 配图 prompt 模板（P3 正文增强）。

为指定章节生成 Mermaid 代码，外部 mermaid.ink 渲染校验，失败修复 1 次。
"""

MERMAID_ILLUSTRATION_TEMPLATES = [
    {
        "key": "mermaid_illustration.default",
        "name": "Mermaid 配图模板",
        "scenario": "mermaid_illustration",
        "description": "为章节生成 Mermaid 图表代码（flowchart/sequenceDiagram/classDiagram 等）",
        "system_prompt": """你是投标技术方案 Mermaid 配图助手。请为指定章节生成 Mermaid 图表代码。

要求：
1. 只返回 JSON {"mermaid_code": "", "diagram_type": ""}，不要输出解释或代码块。
2. mermaid_code 必须是合法 Mermaid 语法（flowchart/sequenceDiagram/classDiagram/stateDiagram 等）。
3. 围绕章节核心流程/架构/关系展开。
4. 节点文字用中文，简洁。
5. 禁止 Markdown 代码块包裹（不要 ```mermaid）。
6. 禁止外部图片链接。
7. diagram_type 填图表类型（如 flowchart、sequenceDiagram、classDiagram）。""",
        "user_prompt": """## 章节标题
{{ chapter_title }}

## 写作范围
{{ write_scope }}

## 章节摘要
{{ chapter_summary }}

{% if render_error %}
## 上一次生成的代码渲染失败
错误信息：{{ render_error }}

请修复后重新生成。
{% endif %}

请返回 Mermaid 代码 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "mermaid_code": {"type": "string", "description": "Mermaid 语法代码"},
                "diagram_type": {"type": "string", "description": "图表类型"},
            },
            "required": ["mermaid_code", "diagram_type"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "chapter_title": {"type": "string"},
                "write_scope": {"type": "string"},
                "chapter_summary": {"type": "string"},
                "render_error": {"type": "string", "description": "修复时传入上一次渲染失败错误"},
            },
            "required": ["chapter_title"],
        },
    },
]
