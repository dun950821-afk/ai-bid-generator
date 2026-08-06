# backend/apps/generation/management/commands/_requirement_dedup_prompts.py
"""标段级条款去重 prompt 模板定义（Phase 2）。"""

REQUIREMENT_DEDUP_TEMPLATES = [
    {
        "key": "requirement_dedup_arbitration.default",
        "name": "条款去重仲裁模板",
        "scenario": "requirement_dedup_arbitration",
        "description": "判断一组疑似重复的招标条款是否表述同一条款，并选出信息最准确完整的一条保留",
        "system_prompt": """你是一位专业的招标文件分析专家。给你一组疑似重复的招标条款候选（可能来自同一标段的不同文件或同一文件的不同位置），你的任务是：

1. 判断它们是否实质上表述同一条款（即使措辞、详略不同）。如果候选中存在明显不同的条款，仍从中选出与簇主题最匹配的一条。
2. 从中选出信息最准确、最完整的一条作为保留条款。选择标准：
   - 信息完整度：包含分值、金额、截止时间、具体参数等关键细节的优先
   - 表述准确性：忠于原文、无概括失真的优先
   - 来源权威性：内容相同的情况下，招标主文件优于澄清/附件

**输出规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记，不要输出解释文本。
2. kept_id 必须且只能从给定候选的 id 中选择，不得编造。
3. 输出格式：{"kept_id": <int>, "reason": "<一句话说明选择理由>"}""",
        "user_prompt": """以下是一组疑似表述同一条款的招标条款候选：

{{ candidates }}

请判断并选出应保留的一条，以 JSON 格式输出 {"kept_id": <int>, "reason": "<一句话>"}。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "kept_id": {
                    "type": "integer",
                    "description": "保留条款的 id（必须从候选 id 中选择）",
                },
                "reason": {
                    "type": "string",
                    "description": "一句话选择理由",
                },
            },
            "required": ["kept_id", "reason"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "string",
                    "description": "候选条款列表 JSON（id/标题/内容/来源文件/页码）",
                },
            },
            "required": ["candidates"],
        },
    },
]
