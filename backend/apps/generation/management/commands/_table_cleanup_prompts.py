# backend/apps/generation/management/commands/_table_cleanup_prompts.py
"""表格清理 prompt 模板（P3 正文增强）。

逐表判断 keep/convert，convert 时用 AI 生成的文字描述替换原表格。
"""

TABLE_CLEANUP_TEMPLATES = [
    {
        "key": "table_cleanup.default",
        "name": "表格清理模板",
        "scenario": "table_cleanup",
        "description": "逐表判断保留或转文字，转文字的生成纯文字描述替换原表格",
        "system_prompt": """你是投标技术方案表格清理助手。判断每个表格是否适合用表格表达。

要求：
1. 参数表/报价表/规格表/对比表保留（keep=true）。
2. 只有 1-2 行数据的表格转文字（keep=false）。
3. 表头为空或单元格是长句的表格转文字。
4. 单列表格转文字。
5. keep=true 时 text_alternative 留空字符串。
6. keep=false 时 text_alternative 写纯文字描述，不含 Markdown 表格语法。
7. 转换后的文字必须完整保留表格中全部数字、参数、规格值，不得遗漏；表格为空或不完整时也必须输出概括其表达意图的文字，text_alternative 不得为空字符串。
8. 严禁 Markdown 标题语法（#、## 等）。
9. 只返回 JSON，不要输出解释或代码块。

返回格式：
{"keep": true/false, "reason": "", "text_alternative": ""}""",
        "user_prompt": """## 章节标题
{{ chapter_title }}

## 写作范围
{{ write_scope }}

## 待判断表格（Markdown）
{{ table_markdown }}

请判断该表格保留还是转文字，返回 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "keep": {"type": "boolean", "description": "true 保留原表格，false 转文字"},
                "reason": {"type": "string", "description": "判断依据"},
                "text_alternative": {
                    "type": "string",
                    "description": "keep=false 时的纯文字描述，keep=true 时留空",
                },
            },
            "required": ["keep", "reason", "text_alternative"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "chapter_title": {"type": "string"},
                "write_scope": {"type": "string"},
                "table_markdown": {"type": "string"},
            },
            "required": ["chapter_title", "table_markdown"],
        },
    },
]
