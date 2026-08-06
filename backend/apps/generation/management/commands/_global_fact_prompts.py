# backend/apps/generation/management/commands/_global_fact_prompts.py
"""全局事实变量 prompt 模板定义（借鉴 OpenBidKit globalFactsTask.cjs）。

严格学习 OpenBidKit 的五轮流程与 prompt 约束，改写为 Jinja2 语法
接入本项目 PromptTemplate+Version 体系。
"""

GLOBAL_FACT_TEMPLATES = [
    # ====================================================================
    # 1. 招标文件分段提取候选事实变量
    # ====================================================================
    {
        "key": "global_fact_extract.default",
        "name": "全局事实提取模板",
        "scenario": "global_fact_extract",
        "description": "从招标文件分段中提取会影响全文一致性的候选事实变量",
        "system_prompt": """你是专业的投标技术方案事实变量整理助手。请严格基于用户提供的上下文整理后续正文需要保持一致的事实变量。

概念界定：
全局事实不是招标要求摘录，而是本方案确定采用、全文必须保持一致的方案事实/承诺口径。

要求：
1. 只提取会影响全文一致性的变量：项目名称、项目编号、项目地址、工期/实施周期、交付地点、验收要求、质保期、售后响应时限、培训要求、关键人员、关键设备型号、技术标准、付款节点、履约保证金等。
2. 不要提取商务报价金额、资质条款等不影响技术方案一致性的内容。
3. 同类变量合并为一条，content 写完整事实，不要拆分。
4. key 用英文蛇形（如 project_name/delivery_period/warranty_period），title 用中文（如"项目名称""交货期"）。
5. content 必须保留原文关键信息，不得自行概括或编造。
6. 遇到要求句（如"不得大于 X""应在 X 内完成"）时，转写为"本方案采用/具备 X"的确定性事实表达；只转写原文已有的值，不得编造原文没有的数值。
7. 原文未提及的变量不要编造，不要输出空值变量。
8. 只返回 JSON，格式为 {"groups":[{"key":"","title":"","content":""}]}，不要输出 Markdown 代码块、解释或其他内容。""",
        "user_prompt": """招标文件分段 {{ segment_index }}/{{ segment_total }}：

{{ segment_content }}

请提取本分段中所有会影响全文一致性的候选事实变量。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "groups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string", "description": "英文蛇形键，如 project_name"},
                            "title": {"type": "string", "description": "中文标题，如'项目名称'"},
                            "content": {"type": "string", "description": "完整事实正文"},
                        },
                        "required": ["key", "title", "content"],
                    },
                },
            },
            "required": ["groups"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "segment_index": {"type": "integer"},
                "segment_total": {"type": "integer"},
                "segment_content": {"type": "string"},
            },
            "required": ["segment_index", "segment_total", "segment_content"],
        },
    },
    # ====================================================================
    # 2. 多段候选合并去重
    # ====================================================================
    {
        "key": "global_fact_merge.default",
        "name": "全局事实合并模板",
        "scenario": "global_fact_merge",
        "description": "将多段提取的候选事实变量按 key 合并去重",
        "system_prompt": """你是严格的全局事实变量合并助手。请将新提取的候选事实变量与已有事实变量按 key 合并去重。

合并规则：
1. 相同 key 的变量合并为一条，content 取信息更完整、表述更准确的版本；若两者互补，合并为一条完整 content。
2. 不同 key 的变量都保留，不要丢弃已有变量。
3. 不要新增原文未提及的变量。
4. title 优先使用已有版本；若已有版本为空，使用新提取版本。
5. 只返回 JSON，格式为 {"groups":[{"key":"","title":"","content":""}]}，不要输出 Markdown 代码块或解释。""",
        "user_prompt": """已有事实变量 JSON：
{{ existing_groups_json }}

本批新提取候选变量 JSON：
{{ candidate_groups_json }}

请合并去重后返回完整事实变量列表。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "groups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string"},
                            "title": {"type": "string"},
                            "content": {"type": "string"},
                        },
                        "required": ["key", "title", "content"],
                    },
                },
            },
            "required": ["groups"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "existing_groups_json": {"type": "string"},
                "candidate_groups_json": {"type": "string"},
            },
            "required": ["existing_groups_json", "candidate_groups_json"],
        },
    },
    # ====================================================================
    # 3. 知识库/原方案分段补充
    # ====================================================================
    {
        "key": "global_fact_supplement.default",
        "name": "全局事实补充模板",
        "scenario": "global_fact_supplement",
        "description": "从知识库或原方案分段中补充已有事实变量或新增缺失变量",
        "system_prompt": """你是严格的全局事实变量补充助手。请基于补充材料对已有事实变量进行补全或新增。

概念界定：
全局事实不是招标要求摘录，而是本方案确定采用、全文必须保持一致的方案事实/承诺口径。

补充规则：
1. 只补充新变量，或补全已有变量的缺失字段（如已有 project_name 但 content 不完整，补全 content）。
2. 不重写已有变量的完整 content，只追加缺失信息。
3. 新增变量必须基于补充材料明确提及，不得编造。
4. 遇到要求句（如"不得大于 X""应在 X 内完成"）时，转写为"本方案采用/具备 X"的确定性事实表达；只转写原文已有的值，不得编造原文没有的数值。
5. 已有变量若补充材料中有更准确信息，更新 content 为更完整版本。
6. 不要删除已有变量。
7. 只返回 JSON，格式为 {"groups":[{"key":"","title":"","content":""}]}，不要输出 Markdown 代码块或解释。""",
        "user_prompt": """当前已有事实变量 JSON：
{{ current_groups_json }}

补充材料（{{ source_label }}分段 {{ segment_index }}/{{ segment_total }}）：
{{ supplement_content }}

请返回补充后的完整事实变量列表。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "groups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string"},
                            "title": {"type": "string"},
                            "content": {"type": "string"},
                        },
                        "required": ["key", "title", "content"],
                    },
                },
            },
            "required": ["groups"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "current_groups_json": {"type": "string"},
                "supplement_content": {"type": "string"},
                "source_label": {"type": "string"},
                "segment_index": {"type": "integer"},
                "segment_total": {"type": "integer"},
            },
            "required": ["current_groups_json", "supplement_content"],
        },
    },
    # ====================================================================
    # 4. 最终整理
    # ====================================================================
    {
        "key": "global_fact_finalize.default",
        "name": "全局事实定稿模板",
        "scenario": "global_fact_finalize",
        "description": "对全局事实变量最终整理：去重、排序、删除矛盾项",
        "system_prompt": """你是严格的全局事实变量最终整理助手。请对合并后的全局事实变量进行最终整理。

概念界定：
全局事实不是招标要求摘录，而是本方案确定采用、全文必须保持一致的方案事实/承诺口径。

整理规则：
1. 去除完全重复的变量（key 相同且 content 高度相似）。
2. 检测矛盾项：若同一含义的变量有相互矛盾的 content（如工期不一致），保留更权威来源（招标文件 > 知识库 > 原方案），删除矛盾项。
3. 按重要性排序：项目名称、编号、工期、地址、验收、质保、售后、人员、设备、其他。
4. title 统一为简洁中文（≤20 字）。
5. content 保持完整事实，去除冗余表述；要求句（如"不得大于 X""应在 X 内完成"）统一转写为"本方案采用/具备 X"的确定性事实表达，只转写原文已有的值。
6. 最终列表必须至少包含一项时间类事实（工期/实施周期/交货时间/运维期）；若缺失，从已有材料中补齐。
7. 不要新增原文未提及的变量。
8. 只返回 JSON，格式为 {"groups":[{"key":"","title":"","content":""}]}，不要输出 Markdown 代码块或解释。""",
        "user_prompt": """待最终整理的全局事实变量 JSON：
{{ groups_json }}

请返回最终整理后的全局事实变量列表。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "groups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string"},
                            "title": {"type": "string"},
                            "content": {"type": "string"},
                        },
                        "required": ["key", "title", "content"],
                    },
                },
            },
            "required": ["groups"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "groups_json": {"type": "string"},
            },
            "required": ["groups_json"],
        },
    },
]
