# backend/apps/generation/management/commands/_outline_review_prompts.py
"""目录审核闭环 prompt 模板（借鉴 OpenBidKit outlinePrompts.ts）。

严格学习 OpenBidKit 的三步流程：
1. 提取评分大类（buildRequirementGroupsMessages）
2. 逐大类生成二三级子目录（buildAlignedChildrenOutlineMessages）
3. 审核目录与评分大类一一对应（buildAlignedOutlineReviewMessages）
"""

OUTLINE_REVIEW_TEMPLATES = [
    # ====================================================================
    # 1. 提取技术评分大类
    # ====================================================================
    {
        "key": "outline_requirement_groups.default",
        "name": "目录评分大类提取模板",
        "scenario": "outline_requirement_groups",
        "description": "从技术评分要求中提取适合作为技术标一级目录的评分大类",
        "system_prompt": """你是一个专业的招标文件分析专家。请从技术评分要求中提取适合作为技术标一级目录的评分大类。

概念区分（必须先理解再提取）：
1. 技术评分项：需要投标方一一响应、展开编写的具体评分内容（如"项目实施方案""售后服务方案"及其分值细项），这类内容才提取为评分大类。
2. 技术评分要求：评审办法、计分规则、计分公式推导、否决条件等约束性规则文字，只作为评分细项的约束内容参考，不得提取为评分大类，不得作为一级目录标题；可在对应大类的 description 或 detail_points 中作为响应注意点体现。

要求：
1. 只提取技术评分大类，不要提取商务、报价、资质等非技术类条目。
2. 每个大类都必须适合作为技术标一级目录标题，标题要专业、简洁、完整。
3. 同一大类下的细项、子项、分值说明、评分标准要归入 detail_points，不要拆成多个一级目录。
4. description 用 1-2 句话概括该大类的评价重点。
5. detail_points 逐条保留原文评分细项与分值，不得概括合并、不得遗漏分值。
6. requirement_id 必须唯一，使用 R1、R2、R3 这种格式。
7. 只返回 JSON，格式必须为 {"groups": [...]}，不要输出其他内容。

JSON 格式要求：
{ "groups": [{ "requirement_id": "R1", "title": "", "description": "", "detail_points": ["", ""] }] }""",
        "user_prompt": """项目概述：
{{ project_overview }}

技术评分要求：
{{ requirements_text }}

请提取所有适合作为技术标一级目录的技术评分大类，保持顺序稳定，并把每个大类下的评分细项归入 detail_points。{{ suggestions_block }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "groups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "requirement_id": {"type": "string", "description": "R1/R2 格式"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "detail_points": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["requirement_id", "title"],
                    },
                },
            },
            "required": ["groups"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "project_overview": {"type": "string"},
                "requirements_text": {"type": "string"},
                "suggestions_block": {"type": "string"},
            },
            "required": ["requirements_text"],
        },
    },
    # ====================================================================
    # 2. 逐大类生成二三级子目录
    # ====================================================================
    {
        "key": "outline_children.default",
        "name": "目录子项生成模板",
        "scenario": "outline_children",
        "description": "为固定的一级评分大类生成二级和三级目录",
        "system_prompt": """你是一个专业的标书编写专家。请围绕指定的技术评分大类，为已经固定好的一级目录生成二级和三级目录。

要求：
1. 一级目录标题和顺序已经固定，不能修改、重命名、合并或删除一级目录。
2. 只输出当前一级目录下的二级和三级目录，不要重复输出一级目录本身。
3. 二级和三级目录要覆盖当前技术评分大类及其细项，不能越界写入其他评分大类内容。
4. 返回标准 JSON，格式为 {"children": [...]}，每个节点必须包含 id、title、description。
5. 只返回 JSON，不要输出其他内容。

结构要求：
1. 顶层 children 只能放当前一级目录的直接子目录，也就是二级目录。
2. 每个二级目录都必须包含非空 children 数组，children 内是三级目录。
3. 每个二级目录下必须包含至少 2 个三级目录；任何父目录下的最终叶子目录不得只有 1 个，若只能形成 1 个，应合并层级或调整归属。
4. 不要把评分细项直接作为没有子节点的二级目录；应先归纳二级主题，再在其下展开三级响应要点、实施措施、证明材料或验收标准。
5. 三级目录只包含 id、title、description，不要继续包含 children。
6. 评分要求（评审办法、计分规则等约束性规则）仅作约束参考，不得偏离当前大类主题，不得为其单独生成分支。
7. 编号必须以当前一级目录编号 {{ parent_id }} 为前缀，例如二级 {{ parent_id }}.1，三级 {{ parent_id }}.1.1。

返回示例：
{
  "children": [
    {
      "id": "{{ parent_id }}.1",
      "title": "二级目录标题",
      "description": "二级目录说明",
      "children": [
        { "id": "{{ parent_id }}.1.1", "title": "三级目录标题", "description": "三级目录说明" },
        { "id": "{{ parent_id }}.1.2", "title": "三级目录标题", "description": "三级目录说明" }
      ]
    }
  ]
}""",
        "user_prompt": """项目概述：
{{ project_overview }}

技术评分要求原文：
{{ requirements_text }}

{% if old_outline %}
用户自己编写的目录参考：
{{ old_outline }}
{% endif %}

当前固定一级目录：
编号：{{ parent_id }}
标题：{{ parent_title }}
描述：{{ parent_description }}

当前对应的技术评分大类：
requirement_id：{{ requirement_id }}
标题：{{ requirement_title }}
描述：{{ requirement_description }}
细项：
{{ detail_points_text or '- 未提供明确细项，请根据评分大类描述合理展开' }}

请仅生成该一级目录下的二级、三级目录；每个二级目录必须包含三级目录，一级目录标题必须保持为当前给定标题，返回格式必须是 {"children": [...]}。{{ suggestions_block }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "children": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "children": {"type": "array"},
                        },
                        "required": ["id", "title"],
                    },
                },
            },
            "required": ["children"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "project_overview": {"type": "string"},
                "requirements_text": {"type": "string"},
                "old_outline": {"type": "string"},
                "parent_id": {"type": "string"},
                "parent_title": {"type": "string"},
                "parent_description": {"type": "string"},
                "requirement_id": {"type": "string"},
                "requirement_title": {"type": "string"},
                "requirement_description": {"type": "string"},
                "detail_points_text": {"type": "string"},
                "suggestions_block": {"type": "string"},
            },
            "required": ["project_overview", "requirements_text", "parent_id", "parent_title"],
        },
    },
    # ====================================================================
    # 3. 目录审核
    # ====================================================================
    {
        "key": "outline_review.default",
        "name": "目录审核模板",
        "scenario": "outline_review",
        "description": "审核目录是否与技术评分大类一一对应",
        "system_prompt": """你是一个严格的招标文件目录审核专家。请审核目录是否与技术评分大类一一对应，并判断二三级目录是否覆盖各评分大类的细项。

要求：
1. 一级目录必须与提供的技术评分大类一一对应，数量一致、顺序一致、标题必须完全一致。
2. 不允许缺失技术评分大类，也不允许新增、合并、改写一级目录。
3. 二级和三级目录要围绕各自对应的技术评分大类与细项展开。
4. 任何父目录下的最终叶子目录不得只有 1 个；发现单叶子分支时 passed=false，并建议合并层级或调整归属。
5. 一级目录混入评分要求（评审办法、计分规则、否决条件等约束性规则，而非需要展开编写的评分项）时 passed=false，并建议改名或删除。
6. 每条修改建议必须包含目标章节编号和具体动作（删除/合并/改名/补充），不得空泛。
7. 只返回 JSON，格式为：{"passed": true, "suggestions": []}。""",
        "user_prompt": """项目概述：
{{ overview }}

技术评分要求：
{{ requirements }}

技术评分大类 JSON：
{{ groups_json }}

待审核目录 JSON：
{{ outline_json }}

请判断该目录是否满足一一对应要求。若满足则返回 passed=true；若不满足则返回 passed=false，并给出具体修改建议。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "passed": {"type": "boolean"},
                "suggestions": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["passed"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "overview": {"type": "string"},
                "requirements": {"type": "string"},
                "groups_json": {"type": "string"},
                "outline_json": {"type": "string"},
            },
            "required": ["overview", "requirements", "groups_json", "outline_json"],
        },
    },
]
