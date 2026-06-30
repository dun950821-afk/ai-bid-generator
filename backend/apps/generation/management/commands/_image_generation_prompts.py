# backend/apps/generation/management/commands/_image_generation_prompts.py
"""AI 生图 prompt 模板（P3 正文增强）。

为章节生成 image_prompt，若配置生图模型则调模型生图，否则只存 prompt。
"""

IMAGE_GENERATION_TEMPLATES = [
    {
        "key": "image_generation.default",
        "name": "AI 生图提示词模板",
        "scenario": "image_generation",
        "description": "为章节生成 AI 生图提示词（image_prompt/style/negative_prompt）",
        "system_prompt": """你是投标技术方案配图提示词助手。请为指定章节生成 AI 生图提示词。

要求：
1. 只返回 JSON {"image_prompt": "", "style": "", "negative_prompt": ""}，不要输出解释或代码块。
2. image_prompt 用英文描述图片内容，详细具体（主体/场景/视角/光线）。
3. style 填画风（如 flat illustration / technical diagram / isometric）。
4. negative_prompt 填要避免的元素。
5. 围绕章节核心内容展开，不出现真实人物/品牌/Logo。
6. 适合技术方案配图风格。""",
        "user_prompt": """## 章节标题
{{ chapter_title }}

## 写作范围
{{ write_scope }}

## 章节摘要
{{ chapter_summary }}

## 配图用途
{{ image_purpose }}

请返回生图提示词 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "image_prompt": {"type": "string", "description": "英文生图提示词"},
                "style": {"type": "string", "description": "画风"},
                "negative_prompt": {"type": "string", "description": "要避免的元素"},
            },
            "required": ["image_prompt", "style", "negative_prompt"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "chapter_title": {"type": "string"},
                "write_scope": {"type": "string"},
                "chapter_summary": {"type": "string"},
                "image_purpose": {"type": "string"},
            },
            "required": ["chapter_title"],
        },
    },
]
