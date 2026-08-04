# backend/apps/generation/management/commands/_content_matrix_v2_prompts.py
"""内容责任矩阵生成模板 v2（带公司材料边界）。

在 v1 基础上注入公司材料元数据（company_context_block 等），
让矩阵基于公司真实可用材料生成章节边界。
"""

CONTENT_MATRIX_V2_TEMPLATES = [
    {
        "key": "content_matrix_generation_v2.default",
        "name": "内容责任矩阵生成v2（带公司材料边界）",
        "scenario": "content_matrix_generation_v2",
        "description": "在 v1 基础上注入公司材料元数据，让矩阵基于公司真实可用材料生成边界",
        "system_prompt": """你是一位资深投标文件编制专家，擅长根据招标文件目录结构，为每个章节划分写作边界，确保投标文件内容不重复、不遗漏、前后连贯。

你的任务是生成一张"内容责任矩阵"，明确每个章节写什么、不写什么、如何与其他章节衔接，并为后续逐章节生成正文提供边界约束。

核心原则：

1. 父章节只写总述、编制目的、内容范围、结构说明和承接关系，不展开子章节细节。
2. 子章节写具体内容，不重复父章节总述，不提前展开其他兄弟章节内容。
3. 每个内容点只能在一个章节详细展开，其他章节如需提及，只能使用"详见 ×× 章节"的方式简要引用。
4. 资格证明、承诺函、偏离表、报价表、人员简历、证书材料等固定格式内容，应按表格、承诺函、证明材料、附件索引或简历表方式处理，不要写成大段技术方案正文。
5. 技术方案类章节可以详细展开，表达应专业、稳健、可落地。
6. 最终汇总类章节，如评标索引表、目录、响应索引、偏离汇总表等，应以后置汇总和索引为主，不提前生成具体正文内容。
7. 如果某章节依赖其他章节内容，应在 dependency_sections 中明确列出依赖章节。
8. 如果某章节容易与其他章节重复，应在 no_duplicate_sections 中明确列出禁止重复展开的章节。

公司材料边界约束（重要）：

1. required_materials 只能引用当前公司材料包、available_knowledge_bases、available_document_titles 中真实存在的材料；不得编造未提供的资质、业绩、人员、证书、案例。
2. missing_materials 仅作为风险提示。若某章节核心内容依赖缺失材料，应将 section_role 标记为 "attachment"，或在 ai_reasoning_summary 中明确"待补充 XX 材料"。
3. 当材料不足以支撑展开写作时，write_scope 应控制为"概括说明 / 待补充 / 需人工确认"，不得生成超出材料边界的写作范围。
4. 对历史标书、项目案例等材料，只能作为写法和能力参考，不得直接虚构为本项目业绩。

输出要求：

1. 必须严格按照 JSON 格式输出，不要添加任何解释文本、Markdown 标记或额外说明。
2. 每个输入章节都必须出现在输出结果中，不得遗漏。
3. section_id 必须与输入的章节 ID 完全对应，不得自行编造、修改或重排 ID。
4. section_number 和 title 应与输入目录保持一致。
5. section_role、expression_form、writing_depth 必须使用指定枚举值。
6. reference_sections、no_duplicate_sections、dependency_sections、related_requirements 只能输出 ID 数组。
7. generation_priority 必须为 0-100 的整数，数值越大，正文生成越靠前。
8. 父章节的 generation_priority 应低于其子章节；最终汇总类章节的 generation_priority 应最低。
9. ai_reasoning_summary 应简要说明该章节边界划分依据，便于用户后续编辑。
10. 不要输出"作为AI""根据你提供的目录"等非投标文件系统语言。""",
        "user_prompt": """请根据以下投标文件目录结构，生成内容责任矩阵。

## 项目信息
- 项目名称：{{ project_name }}
- 标段名称：{{ lot_name }}

## 完整目录结构

{{ outline_structure }}

{% if requirements_summary %}
## 招标关键条款摘要

{{ requirements_summary }}
{% endif %}

{% if company_context_block %}
## 公司能力边界（生成矩阵时必须遵守）

{{ company_context_block }}
{% endif %}

## 输出格式要求

请输出 JSON 格式，结构如下：

{
  "sections": [
    {
      "section_id": 章节ID（必须与输入一致）,
      "section_number": "章节编号",
      "title": "章节标题",
      "section_role": "章节定位",
      "write_scope": "本章写什么（详细说明写作范围）",
      "exclude_scope": "本章不写什么（明确排除的内容）",
      "reference_sections": [可引用的章节ID数组],
      "no_duplicate_sections": [禁止重复展开的章节ID数组],
      "dependency_sections": [必须先完成的章节ID数组],
      "expression_form": "建议表达形式",
      "writing_depth": "写作深度",
      "related_requirements": [关联的招标条款ID数组],
      "generation_priority": 生成优先级（0-100，数值越大越先生成）,
      "ai_reasoning_summary": "AI划分说明（解释为什么这样划分边界）"
    }
  ]
}

## 枚举值说明

section_role 可选值：
- "qualification"：资格证明
- "technical_solution"：技术方案
- "business_response"：商务响应
- "service_plan"：服务方案
- "team_intro"：团队介绍
- "attachment"：附件材料
- "other"：其他

expression_form 可选值：
- "body_text"：正文
- "table"：表格
- "commitment_letter"：承诺函
- "certificate"：证明材料
- "attachment_index"：附件索引
- "resume_table"：简历表
- "mixed"：混合形式

writing_depth 可选值：
- "overview"：概述（适用于父章节、索引类）
- "moderate"：适度展开
- "detailed"：详细展开（适用于叶子技术章节）""",
        "output_schema": {
            "type": "object",
            "required": ["sections"],
            "properties": {
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["section_id", "title", "write_scope"],
                        "properties": {
                            "section_id": {"type": "integer"},
                            "section_number": {"type": "string"},
                            "title": {"type": "string"},
                            "section_role": {"type": "string"},
                            "write_scope": {"type": "string", "minLength": 1},
                            "exclude_scope": {"type": "string"},
                            "reference_sections": {"type": "array", "items": {"type": "integer"}},
                            "no_duplicate_sections": {"type": "array", "items": {"type": "integer"}},
                            "dependency_sections": {"type": "array", "items": {"type": "integer"}},
                            "expression_form": {"type": "string"},
                            "writing_depth": {"type": "string"},
                            "related_requirements": {"type": "array", "items": {"type": "integer"}},
                            "generation_priority": {"type": "integer", "minimum": 0, "maximum": 100},
                            "ai_reasoning_summary": {"type": "string"},
                        },
                    },
                }
            },
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string"},
                "lot_name": {"type": "string"},
                "outline_structure": {"type": "string"},
                "requirements_summary": {"type": "string"},
                "company_context_block": {"type": "string", "description": "公司能力边界文本块（空字符串表示无公司材料）"},
                "company_snapshot": {"type": "object", "description": "公司信息快照"},
                "available_knowledge_bases": {"type": "array", "description": "可用知识库列表"},
                "available_document_titles": {"type": "array", "description": "可参考文档标题清单"},
                "missing_materials": {"type": "array", "description": "材料包缺失项（风险提示）"},
            },
            "required": ["project_name", "lot_name", "outline_structure"],
        },
    },
]
