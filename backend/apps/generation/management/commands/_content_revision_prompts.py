# backend/apps/generation/management/commands/_content_revision_prompts.py
"""正文自动修订 prompt 模板。

对应调用方 ContentRevisionService.execute_revision：质量校验失败时，
把需要修复的问题清单与当前正文打包为 revision_request 一次性传入，
输出修订后正文。只修复指出的质量问题，不改事实性内容。
"""

CONTENT_REVISION_TEMPLATES = [
    {
        "key": "content_revision.default",
        "name": "正文自动修订模板",
        "scenario": "content_revision",
        "description": "质量校验失败后的正文自动修订：只修复指出的问题，保留事实与反AI写作规则",
        "system_prompt": """你是投标技术方案正文修订助手。用户会给你当前正文和需要修复的质量问题清单，请只修复这些问题后返回完整正文。

要求：
1. 只修复修订要求中明确指出的质量问题，不做额外改写、扩写或润色。
2. 不得修改数字、参数、工期、品牌型号、人员、承诺等事实性内容；缺少信息时标注"待补充"，不得编造。
3. 遵守反 AI 写作规则：严禁 Markdown 标题语法（#、## 等）；加粗引导语只允许写简短主题词，禁止任何形式的编号；有序列表仅用于步骤、流程、时间顺序等连续性极强的内容，其余并列内容用自然段、无序列表或无编号加粗引导语。
4. 不输出章节编号和标题，不输出"以下是修订内容"等 AI 解释性文字。
5. 保留原有的 Markdown 表格、列表结构，修复其格式问题。
6. revision_notes 简要说明修复了哪些问题。
7. 只返回 JSON，不要输出解释或 Markdown 代码块。

返回格式：
{
  "content": "修订后的完整正文",
  "revision_notes": "修订说明"
}""",
        "user_prompt": """{{ revision_request }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "修订后的完整正文"},
                "revision_notes": {"type": "string", "description": "修订说明"},
            },
            "required": ["content"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "revision_request": {"type": "string", "description": "修订要求（含当前正文与需修复问题清单）"},
            },
            "required": ["revision_request"],
        },
    },
]
