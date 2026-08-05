# backend/apps/generation/management/commands/_section_content_antiai_prompts.py
"""正文生成反 AI 味约束 prompt 模板（借鉴 OpenBidKit buildChapterContentMessages）。

严格学习 OpenBidKit 的反 AI 味约束与全局事实强制引用机制。
作为 section_content_generation 的增强版，新增 .antiai 后缀 key，
服务层按需选择，不覆盖现有 section_content_generation.default。
"""

SECTION_CONTENT_ANTIAI_TEMPLATES = [
    {
        "key": "section_content_generation.antiai",
        "name": "正文生成模板（反AI味+全局事实）",
        "scenario": "section_content_generation",
        "description": "增强版正文生成：反 AI 味约束 + 编排决策引用 + 全局事实强制引用",
        "system_prompt": """你是一个专业的标书编写专家，负责为投标文件的技术标部分生成具体内容。

要求：
1. 内容要专业、准确，与章节标题和描述保持一致。
2. 这是技术方案，不是宣传报告，注意朴实无华，不要假大空。
3. 语言要正式、规范，符合标书写作要求，但不要使用奇怪的连接词，不要让人觉得内容像是 AI 生成的。
4. 内容要详细具体，避免空泛的描述。
5. 围绕当前章节标题、描述和正文编排重点展开，保持内容聚焦。
6. {{ table_allowed_instruction }}
7. 正文只生成文字、列表、表格等内容，配图由系统另行处理。
8. 严禁输出 Mermaid、PlantUML、Graphviz、flowchart、graph、sequenceDiagram 等图表代码块、mermaid.ink 链接或图片 Markdown；配图由系统另行处理。
9. {{ table_cell_instruction }}
10. 严禁使用 Markdown 标题语法（#、##、###、####、#####、######），也不要生成与当前章节同级或下级的伪目录标题。
11. 如需在正文中分层表达，只能使用普通段落、列表、表格或加粗引导语，例如 **实施要点：**。
12. 直接返回章节内容，不生成标题，不要任何额外说明。
13. 如果本章节需要使用的全局事实变量中包含相关内容，必须优先使用变量值，不得前后矛盾。
14. 仅使用本章节提供的全局事实变量；未提供时不要主动编造具体人员、周期、质保、品牌、型号等会影响全文一致性的承诺。

## 输出要求

请严格输出 JSON 格式，不要添加任何解释文本：

{
  "content": "Markdown 格式正文（不含标题语法，不含图表代码块）",
  "word_count": 正文字数,
  "used_analysis_point_ids": [已响应的分析点 ID 数组],
  "used_rag_material_ids": [已使用的 RAG 素材 chunk_id 数组],
  "missing_info": [
    {"type": "缺失类型", "message": "缺失描述"}
  ],
  "risk_flags": [
    {"type": "风险类型", "message": "风险描述"}
  ],
  "summary": "200-300 字章节摘要"
}""",
        "user_prompt": """## 一、当前章节

章节编号：{{ current_section.section_number }}
章节标题：{{ current_section.title }}
章节层级：{{ current_section.level }}
章节描述：{{ current_section.description or '' }}

## 二、正文编排决策

{% if content_plan %}
写作重点：{{ content_plan.writing_focus or '' }}

表格规划：{% if content_plan.table and content_plan.table.needed %}需要（{{ content_plan.table.purpose or '' }}）{% else %}不需要{% endif %}

引用知识库条目：{{ content_plan.knowledge.item_ids | join(', ') if content_plan.knowledge and content_plan.knowledge.item_ids else '无' }}

引用全局事实标题：{{ content_plan.facts.titles | join(', ') if content_plan.facts and content_plan.facts.titles else '无' }}
{% else %}
无编排决策，请根据章节内容自行判断。
{% endif %}

## 三、全局事实变量（本章节必须优先引用，不得前后矛盾）

{% if selected_facts %}
{{ selected_facts }}
{% else %}
本章节未提供全局事实变量，不要主动编造具体人员、周期、质保、品牌、型号等会影响全文一致性的承诺。
{% endif %}

## 四、内容责任矩阵

章节定位：{{ content_matrix.section_role or '' }}
表达形式：{{ content_matrix.expression_form or 'body_text' }}
写作范围（应写）：{{ content_matrix.write_scope or '' }}
排除范围（禁写）：{{ content_matrix.exclude_scope or '' }}
人工备注：{{ content_matrix.manual_notes or '' }}

## 五、AI 解析得分点和响应要求

### 必须响应条款（must_respond）
{% for item in (analysis_points.must_respond or []) %}
- [{{ item.requirement_no or '' }}] {{ item.title or '' }}：{{ item.content or '' }}
{% endfor %}

### 评分点（score_points）
{% for item in (analysis_points.score_points or []) %}
- [{{ item.requirement_no or '' }}] {{ item.title or '' }}{% if item.score_info is mapping and item.score_info.get('score') %}（分值：{{ item.score_info.get('score') }}）{% endif %}
{% endfor %}

## 六、RAG 检索素材

{% if knowledge_contents %}
参考正文素材使用规则：以下内容只作为可吸收的技术素材。请改写为当前项目语境下的投标技术方案正文，不要照抄，不要提到"知识库""历史文档""参考资料"或素材来源。

{% for kc in knowledge_contents %}
<knowledge_content>
{{ kc }}
</knowledge_content>

{% endfor %}
{% else %}
无 RAG 素材。
{% endif %}

## 七、项目信息

项目名称：{{ project_info.project_name or '' }}
标段名称：{{ project_info.lot_name or '' }}

{% if user_prompt %}
## 八、用户补充要求

{{ user_prompt }}
{% endif %}

请生成当前章节正文。""",
        "output_schema": {
            "type": "object",
            "required": ["content", "word_count"],
            "properties": {
                "content": {"type": "string", "description": "Markdown 格式正文，不含标题语法"},
                "word_count": {"type": "integer"},
                "used_analysis_point_ids": {"type": "array", "items": {"type": "integer"}},
                "used_rag_material_ids": {"type": "array", "items": {"type": "string"}},
                "missing_info": {"type": "array"},
                "risk_flags": {"type": "array"},
                "summary": {"type": "string"},
            },
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "current_section": {"type": "object"},
                "content_plan": {"type": "object"},
                "selected_facts": {"type": "string"},
                "content_matrix": {"type": "object"},
                "analysis_points": {"type": "object"},
                "knowledge_contents": {"type": "array"},
                "project_info": {"type": "object"},
                "user_prompt": {"type": "string"},
                "table_allowed_instruction": {"type": "string"},
                "table_cell_instruction": {"type": "string"},
            },
            "required": ["current_section", "content_matrix", "table_allowed_instruction", "table_cell_instruction"],
        },
    },
]
