# backend/apps/generation/management/commands/seed_prompts.py
"""初始化内置提示词模板。"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.generation.constants import (
    PromptScenario,
    PromptScope,
    PromptVersionStatus,
    ModelType,
    ProviderType,
)
from apps.generation.models import PromptTemplate, PromptVersion, ModelProvider, ModelConfig


# 条款标题规则段 —— 7 个条款抽取模板共用，措辞必须一致
CLAUSE_TITLE_RULES = """**条款标题规则**：
1. title 必须有值，不得为空字符串
2. 优先使用原文中的小节/段落标题（如「资格要求」「付款方式」「投标截止时间」）
3. 原文无明确标题时，由你基于 content 概括生成不超过 10 个字的简短标题
4. 不得直接复制 content 全文作为 title
5. title 应能让评审人快速识别该条款要点，避免「其他」「相关要求」等模糊表述"""

# 解析分块参考段说明 —— 7 个条款抽取模板共用
CHUNK_CONTEXT_PROMPT_SECTION = """**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}"""


class Command(BaseCommand):
    help = "初始化内置提示词模板和模型配置"

    @transaction.atomic
    def handle(self, *args, **options):
        # 1. 创建 Mock Provider
        provider, created = ModelProvider.objects.get_or_create(
            key="mock",
            defaults={
                "name": "Mock Provider",
                "provider_type": ProviderType.MOCK,
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS("创建 Mock Provider"))

        # 2. 创建默认模型配置
        config, created = ModelConfig.objects.get_or_create(
            provider=provider,
            model_name="mock-model",
            defaults={
                "model_type": ModelType.CHAT,
                "display_name": "Mock Chat Model",
                "is_default": True,
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS("创建默认模型配置"))

        # 3. 创建内置模板
        templates = self._get_builtin_templates()
        for template_data in templates:
            template, created = PromptTemplate.objects.get_or_create(
                key=template_data["key"],
                defaults={
                    "name": template_data["name"],
                    "scenario": template_data["scenario"],
                    "scope": PromptScope.SYSTEM,
                    "description": template_data.get("description", ""),
                },
            )
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f"创建模板: {template.key}")
                )

            # 创建版本
            version, created = PromptVersion.objects.get_or_create(
                template=template,
                version="1.0",
                defaults={
                    "system_prompt": template_data["system_prompt"],
                    "user_prompt": template_data["user_prompt"],
                    "output_schema": template_data.get("output_schema", {}),
                    "variable_schema": template_data.get("variable_schema", {}),
                    "status": PromptVersionStatus.PUBLISHED,
                },
            )
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f"创建版本: {template.key}@1.0")
                )

        self.stdout.write(self.style.SUCCESS("初始化完成"))

    def _get_builtin_templates(self) -> list[dict]:
        """获取内置模板定义。"""
        from ._global_fact_prompts import GLOBAL_FACT_TEMPLATES
        from ._outline_review_prompts import OUTLINE_REVIEW_TEMPLATES
        from ._section_plan_prompts import SECTION_PLAN_TEMPLATES
        from ._section_content_antiai_prompts import SECTION_CONTENT_ANTIAI_TEMPLATES  # noqa
        from ._bid_check_prompts import BID_CHECK_TEMPLATES
        from ._consistency_audit_prompts import CONSISTENCY_AUDIT_TEMPLATES
        from ._section_expand_prompts import SECTION_EXPAND_TEMPLATES

        return (
            GLOBAL_FACT_TEMPLATES
            + OUTLINE_REVIEW_TEMPLATES
            + SECTION_PLAN_TEMPLATES
            + SECTION_CONTENT_ANTIAI_TEMPLATES  # noqa
            + BID_CHECK_TEMPLATES
            + CONSISTENCY_AUDIT_TEMPLATES
            + SECTION_EXPAND_TEMPLATES
            + [

            {
                "key": "outline_generation.default",
                "name": "大纲生成模板",
                "scenario": PromptScenario.OUTLINE_GENERATION,
                "description": "根据招标文件生成投标文件大纲",
                "system_prompt": "你是一位专业的标书编写专家，擅长根据招标文件要求设计投标文件结构。",
                "user_prompt": """请根据以下招标文件信息，生成投标文件大纲：

项目名称：{{ project_name }}

招标文件摘要：
{{ tender_summary }}

资格要求：
{{ qualification_requirements }}

评分标准：
{{ scoring_requirements }}

技术要求：
{{ tech_requirements }}

请以 JSON 格式输出大纲结构。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "sections": {"type": "array"},
                    },
                    "required": ["sections"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "project_name": {"type": "string"},
                        "tender_summary": {"type": "string"},
                    },
                    "required": ["project_name"],
                },
            },
            {
                "key": "requirement_analysis.default",
                "name": "条款分析模板",
                "scenario": PromptScenario.REQUIREMENT_ANALYSIS,
                "description": "分析条款风险和响应策略",
                "system_prompt": "你是一位招标文件分析专家，擅长识别条款的强制程度、风险等级和响应策略。",
                "user_prompt": """请分析以下条款：

条款类型：{{ requirement_type }}
强制程度：{{ mandatory_level }}
条款内容：
{{ content }}

请以 JSON 格式输出分析结果。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "risk_level": {"type": "string"},
                        "is_mandatory": {"type": "boolean"},
                    },
                    "required": ["summary"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "requirement_type": {"type": "string"},
                        "mandatory_level": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["content"],
                },
            },
            {
                "key": "section_writing.default",
                "name": "章节撰写模板",
                "scenario": PromptScenario.SECTION_WRITING,
                "description": "撰写技术方案、实施方案等章节",
                "system_prompt": "你是一位专业的标书编写专家，擅长撰写技术方案、项目实施方案等标书内容。",
                "user_prompt": """请撰写以下章节：

章节标题：{{ section_title }}
章节要求：
{{ section_requirements }}

技术参数：
{{ tech_params }}

企业相关案例：
{{ company_cases }}

写作风格：{{ writing_style }}

请撰写完整的章节内容，使用 Markdown 格式。""",
                "output_schema": {},
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "section_title": {"type": "string"},
                        "section_requirements": {"type": "string"},
                    },
                    "required": ["section_title"],
                },
            },
            {
                "key": "requirement_extraction.default",
                "name": "条款抽取模板",
                "scenario": PromptScenario.REQUIREMENT_EXTRACTION,
                "description": "从招标文件分块中抽取结构化条款",
                "system_prompt": """你是一位专业的招标文件条款抽取专家。你的任务是从招标文件分块中提取结构化条款信息。

**关键规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记，不要输出解释文本。
2. 不要编造招标文件中不存在的条款。只抽取原文中明确存在的条款。
3. content 字段必须保留原文含义，不得修改或概括。summary 字段才允许概括。
4. submission（投标递交要求）和 schedule（履约周期）必须严格区分：
   - submission: 投标截止时间、开标时间、保证金缴纳截止、递交地点、密封要求等投标动作相关
   - schedule: 服务期限、交付周期、实施周期、质保期等履约周期相关
5. 评分项必须提取 score_info，包含分值和评分标准。
6. 金额和截止时间必须分别提取到 amount_info 和 deadline_info 字段。
7. 不确定时 mandatory_level 和 risk_level 使用 "unknown"。
8. 每条条款必须保持独立性，不要重复抽取。

**条款类型说明**：
- qualification: 资格要求（企业资质、人员资质、业绩要求等）
- tech_req: 技术要求（技术参数、性能指标、技术标准等）
- scoring: 评分项（评分标准、分值、评分方法等）
- commercial: 商务条款（报价、付款方式、保证金等）
- legal: 合同法律（违约责任、争议解决、合同条款等）
- submission: 投标递交要求（投标截止、开标时间、递交方式等）
- schedule: 履约周期（服务期限、交付周期、质保期等）
- material: 材料要求（需提供的材料、证明文件等）
- format: 文件格式要求（格式规范、模板要求等）
- clarification: 澄清补遗（答疑、更正通知等）
- other: 其他

""" + CLAUSE_TITLE_RULES,
                "user_prompt": """请从以下招标文件分块中抽取条款：

**文件名称**：{{ tender_file_name }}

**分块类型**：{{ chunk_type }}

**章节路径**：{{ section_path }}

**页码范围**：{{ page_start }} - {{ page_end }}

**分块内容**：
{{ chunk_content }}

**可用的条款类型**：
{{ requirement_type_options }}

请抽取该分块中的所有条款，以 JSON 格式输出。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "requirements": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "requirement_no": {"type": "string", "description": "条款编号，如 ★1、2.1.3"},
                                    "requirement_type": {
                                        "type": "string",
                                        "enum": ["qualification", "tech_req", "scoring", "commercial", "legal", "submission", "schedule", "material", "format", "clarification", "other"],
                                    },
                                    "title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
                                    "content": {"type": "string", "description": "条款内容（保留原文）"},
                                    "summary": {"type": "string", "description": "内容摘要（可概括）"},
                                    "mandatory_level": {
                                        "type": "string",
                                        "enum": ["mandatory", "important", "optional", "unknown"],
                                    },
                                    "risk_level": {
                                        "type": "string",
                                        "enum": ["high", "medium", "low", "unknown"],
                                    },
                                    "response_needed": {"type": "boolean"},
                                    "evidence_needed": {"type": "boolean"},
                                    "evidence_types": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "amount_info": {
                                        "type": "object",
                                        "properties": {
                                            "amount": {"type": "number"},
                                            "currency": {"type": "string"},
                                            "description": {"type": "string"},
                                        },
                                    },
                                    "deadline_info": {
                                        "type": "object",
                                        "properties": {
                                            "date": {"type": "string"},
                                            "time": {"type": "string"},
                                            "description": {"type": "string"},
                                        },
                                    },
                                    "score_info": {
                                        "type": "object",
                                        "properties": {
                                            "score": {"type": "number"},
                                            "criteria": {"type": "string"},
                                        },
                                    },
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                                "required": ["requirement_type", "title", "content", "mandatory_level", "risk_level"],
                            },
                        },
                    },
                    "required": ["requirements"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "tender_file_name": {"type": "string"},
                        "chunk_type": {"type": "string"},
                        "section_path": {"type": "string"},
                        "page_start": {"type": "integer"},
                        "page_end": {"type": "integer"},
                        "chunk_content": {"type": "string"},
                        "chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
                        "requirement_type_options": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["chunk_content"],
                },
            },
            # ====================================================================
            # 条款抽取 V2 模板（独立于 TenderChunk）
            # ====================================================================
            {
                "key": "requirement_extraction_scoring.default",
                "name": "评分项抽取模板",
                "scenario": PromptScenario.REQUIREMENT_EXTRACTION_SCORING,
                "description": "从招标文件全文中抽取评分项",
                "system_prompt": """你是一位专业的招标文件分析专家。你的任务是从招标文件全文中抽取所有**评分项**。

**评分项定义**：
- 评分标准、评分方法、评分细则
- 明确的分值（如"5分"、"满分10分"）
- 评分条件和得分规则

**输出规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记
2. 每个评分项必须包含 title、content、score 字段
3. content 必须保留原文含义
4. 如果找不到评分项，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES,
                "user_prompt": """请从以下招标文件中抽取所有评分项：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

""" + CHUNK_CONTEXT_PROMPT_SECTION + """

**抽取类型**：{{ extraction_type_name }}

请抽取所有评分相关条款，以 JSON 格式输出。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
                                    "content": {"type": "string", "description": "条款内容"},
                                    "requirement_type": {"type": "string", "enum": ["scoring"]},
                                    "source_text": {"type": "string", "description": "原文依据"},
                                    "source_section": {"type": "string", "description": "章节位置"},
                                    "source_page": {"type": "integer", "description": "页码"},
                                    "is_mandatory": {"type": "boolean"},
                                    "is_rejection_clause": {"type": "boolean", "description": "是否废标条款"},
                                    "score": {"type": "number", "description": "分值"},
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                                "required": ["title", "content", "requirement_type"],
                            },
                        },
                    },
                    "required": ["items"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "document_text": {"type": "string"},
                        "chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
                        "extraction_type": {"type": "string"},
                        "extraction_type_name": {"type": "string"},
                    },
                    "required": ["document_text"],
                },
            },
            {
                "key": "requirement_extraction_mandatory.default",
                "name": "强制条款抽取模板",
                "scenario": PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY,
                "description": "从招标文件全文中抽取强制条款（废标条款）",
                "system_prompt": """你是一位专业的招标文件分析专家。你的任务是从招标文件全文中抽取所有**强制条款（废标条款）**。

**强制条款特征**：
- 包含"必须"、"不得"、"应当"等强制性词语
- 明确标注★、※、●等符号
- 声明"否则废标"、"不满足即废标"、"实质性要求"等
- 未满足将导致投标无效的条款

**输出规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记
2. 每个强制条款必须标记 is_mandatory=true, is_rejection_clause=true
3. content 必须保留原文含义
4. 如果找不到强制条款，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES,
                "user_prompt": """请从以下招标文件中抽取所有强制条款（废标条款）：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

""" + CHUNK_CONTEXT_PROMPT_SECTION + """

**抽取类型**：{{ extraction_type_name }}

请抽取所有强制条款，以 JSON 格式输出。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
                                    "content": {"type": "string"},
                                    "requirement_type": {"type": "string", "enum": ["legal"]},
                                    "source_text": {"type": "string"},
                                    "source_section": {"type": "string"},
                                    "source_page": {"type": "integer"},
                                    "is_mandatory": {"type": "boolean"},
                                    "is_rejection_clause": {"type": "boolean"},
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                                "required": ["title", "content", "requirement_type", "is_mandatory"],
                            },
                        },
                    },
                    "required": ["items"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "document_text": {"type": "string"},
                        "chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
                        "extraction_type": {"type": "string"},
                        "extraction_type_name": {"type": "string"},
                    },
                    "required": ["document_text"],
                },
            },
            {
                "key": "requirement_extraction_qualification.default",
                "name": "资格要求抽取模板",
                "scenario": PromptScenario.REQUIREMENT_EXTRACTION_QUALIFICATION,
                "description": "从招标文件全文中抽取资格要求",
                "system_prompt": """你是一位专业的招标文件分析专家。你的任务是从招标文件全文中抽取所有**资格要求**。

**资格要求包括**：
- 企业资质要求（营业执照、资质证书等）
- 人员资质要求（项目经理、技术人员等）
- 业绩要求（类似项目业绩）
- 财务要求（审计报告、资金证明等）
- 信誉要求（信用记录、无重大违法记录等）

**输出规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记
2. 区分企业资质、人员资质、业绩等不同类别
3. content 必须保留原文含义
4. 如果找不到资格要求，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES,
                "user_prompt": """请从以下招标文件中抽取所有资格要求：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

""" + CHUNK_CONTEXT_PROMPT_SECTION + """

**抽取类型**：{{ extraction_type_name }}

请抽取所有资格要求，以 JSON 格式输出。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
                                    "content": {"type": "string"},
                                    "requirement_type": {"type": "string", "enum": ["qualification"]},
                                    "source_text": {"type": "string"},
                                    "source_section": {"type": "string"},
                                    "source_page": {"type": "integer"},
                                    "is_mandatory": {"type": "boolean"},
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                                "required": ["title", "content", "requirement_type"],
                            },
                        },
                    },
                    "required": ["items"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "document_text": {"type": "string"},
                        "chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
                        "extraction_type": {"type": "string"},
                        "extraction_type_name": {"type": "string"},
                    },
                    "required": ["document_text"],
                },
            },
            {
                "key": "requirement_extraction_commercial.default",
                "name": "商务条款抽取模板",
                "scenario": PromptScenario.REQUIREMENT_EXTRACTION_COMMERCIAL,
                "description": "从招标文件全文中抽取商务条款",
                "system_prompt": """你是一位专业的招标文件分析专家。你的任务是从招标文件全文中抽取所有**商务条款**。

**商务条款包括**：
- 报价要求、报价方式
- 付款方式、付款条件
- 投标保证金、履约保证金
- 合同价款、结算方式
- 价格调整条款

**输出规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记
2. 金额信息必须准确提取
3. content 必须保留原文含义
4. 如果找不到商务条款，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES,
                "user_prompt": """请从以下招标文件中抽取所有商务条款：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

""" + CHUNK_CONTEXT_PROMPT_SECTION + """

**抽取类型**：{{ extraction_type_name }}

请抽取所有商务条款，以 JSON 格式输出。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
                                    "content": {"type": "string"},
                                    "requirement_type": {"type": "string", "enum": ["commercial"]},
                                    "source_text": {"type": "string"},
                                    "source_section": {"type": "string"},
                                    "source_page": {"type": "integer"},
                                    "is_mandatory": {"type": "boolean"},
                                    "score": {"type": "number"},
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                                "required": ["title", "content", "requirement_type"],
                            },
                        },
                    },
                    "required": ["items"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "document_text": {"type": "string"},
                        "chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
                        "extraction_type": {"type": "string"},
                        "extraction_type_name": {"type": "string"},
                    },
                    "required": ["document_text"],
                },
            },
            {
                "key": "requirement_extraction_technical.default",
                "name": "技术要求抽取模板",
                "scenario": PromptScenario.REQUIREMENT_EXTRACTION_TECHNICAL,
                "description": "从招标文件全文中抽取技术要求",
                "system_prompt": """你是一位专业的招标文件分析专家。你的任务是从招标文件全文中抽取所有**技术要求**。

**技术要求包括**：
- 技术参数、性能指标
- 技术标准、规范要求
- 功能要求、性能要求
- 技术方案要求
- 设备配置要求

**输出规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记
2. 技术参数必须准确记录
3. content 必须保留原文含义
4. 如果找不到技术要求，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES,
                "user_prompt": """请从以下招标文件中抽取所有技术要求：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

""" + CHUNK_CONTEXT_PROMPT_SECTION + """

**抽取类型**：{{ extraction_type_name }}

请抽取所有技术要求，以 JSON 格式输出。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
                                    "content": {"type": "string"},
                                    "requirement_type": {"type": "string", "enum": ["tech_req"]},
                                    "source_text": {"type": "string"},
                                    "source_section": {"type": "string"},
                                    "source_page": {"type": "integer"},
                                    "is_mandatory": {"type": "boolean"},
                                    "score": {"type": "number"},
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                                "required": ["title", "content", "requirement_type"],
                            },
                        },
                    },
                    "required": ["items"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "document_text": {"type": "string"},
                        "chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
                        "extraction_type": {"type": "string"},
                        "extraction_type_name": {"type": "string"},
                    },
                    "required": ["document_text"],
                },
            },
            {
                "key": "requirement_extraction_submission.default",
                "name": "递交要求抽取模板",
                "scenario": PromptScenario.REQUIREMENT_EXTRACTION_SUBMISSION,
                "description": "从招标文件全文中抽取投标递交要求",
                "system_prompt": """你是一位专业的招标文件分析专家。你的任务是从招标文件全文中抽取所有**投标递交要求**。

**投标递交要求包括**：
- 投标截止时间、开标时间
- 递交地点、递交方式
- 投标文件格式、密封要求
- 投标保证金缴纳截止时间
- 电子投标要求

**注意区分**：
- submission: 投标递交相关（投标截止、开标时间、保证金缴纳截止）
- schedule: 履约周期相关（服务期限、交付周期、质保期）

**输出规则**：
1. 只输出 JSON 格式，不要输出 Markdown 代码块标记
2. 截止时间必须准确提取
3. content 必须保留原文含义
4. 如果找不到递交要求，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES,
                "user_prompt": """请从以下招标文件中抽取所有投标递交要求：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

""" + CHUNK_CONTEXT_PROMPT_SECTION + """

**抽取类型**：{{ extraction_type_name }}

请抽取所有投标递交要求，以 JSON 格式输出。""",
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
                                    "content": {"type": "string"},
                                    "requirement_type": {"type": "string", "enum": ["submission"]},
                                    "source_text": {"type": "string"},
                                    "source_section": {"type": "string"},
                                    "source_page": {"type": "integer"},
                                    "is_mandatory": {"type": "boolean"},
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                                "required": ["title", "content", "requirement_type"],
                            },
                        },
                    },
                    "required": ["items"],
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "document_text": {"type": "string"},
                        "chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
                        "extraction_type": {"type": "string"},
                        "extraction_type_name": {"type": "string"},
                    },
                    "required": ["document_text"],
                },
            },
            # ====================================================================
            # 内容责任矩阵生成模板
            # ====================================================================
            {
                "key": "content_matrix_generation.default",
                "name": "内容责任矩阵生成",
                "scenario": PromptScenario.CONTENT_MATRIX_GENERATION,
                "description": "根据招标文件目录结构，为每个章节划分写作边界",
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

{{#if requirements_summary }}
## 招标关键条款摘要

{{ requirements_summary }}
{{/if}}

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
                    },
                    "required": ["project_name", "lot_name", "outline_structure"],
                },
            },
            # ====================================================================
            # 正文生成模板（Phase 3.2）
            # ====================================================================
            {
                "key": "section_content_generation.default",
                "name": "正文生成模板",
                "scenario": PromptScenario.SECTION_CONTENT_GENERATION,
                "description": "根据内容责任矩阵、AI解析得分点、章节模板和RAG素材生成正文",
                "system_prompt": """你是一名资深投标文件编制专家，请根据当前章节信息、内容责任矩阵、AI解析得分点、章节撰写模板、RAG素材和上下文章节信息，生成当前章节正文。

## 一、最高优先级规则

1. 内容责任矩阵是最高写作边界：
   - 只能写 write_scope 中规定的内容；
   - 不能写 exclude_scope 中禁止的内容；
   - no_duplicate_sections 中的章节只能引用，不得展开；
   - manual_notes 是人工补充要求，优先级高于 AI 建议。

2. AI解析得分点是最高响应目标：
   - must_respond 中的内容必须尽量响应；
   - score_points 中的评分点应重点展开；
   - format_requirements 中的格式要求必须遵守。

3. 章节撰写模板是正文结构参考：
   - 生成正文应尽量遵循模板结构；
   - 如模板结构与内容责任矩阵冲突，以内容责任矩阵为准；
   - 如模板要求的内容没有依据，请在 missing_info 中标记。

4. RAG素材是写作材料：
   - 历史标书只可参考结构和表达，不得照搬；
   - 公司信息、人员、证书、业绩必须以RAG素材为准；
   - 未检索到依据的信息不得编造；
   - 不得把历史标书中的其他项目名称、客户、金额、日期带入当前正文。

5. 上下文章节用于连贯和防重复：
   - 父章节只做承接，不得抢写子章节；
   - 子章节要承接父章节，但不得重复父章节总述；
   - 前置兄弟章节已写内容不要重复；
   - 引用其他章节时使用"相关内容详见 ×× 章节"。

6. 输出必须符合正式投标文件语气，不出现"作为AI"、"根据你提供的信息"等表达。

7. 缺少必要事实依据时，请写入 missing_info，不要虚构。

{{ strict_generation_rules }}""",
                "user_prompt": """## 一、当前章节

章节编号：{{ current_section.section_number }}
章节标题：{{ current_section.title }}
章节层级：{{ current_section.level }}

## 二、内容责任矩阵

章节定位：{{ content_matrix.section_role or '' }}
表达形式：{{ content_matrix.expression_form or 'body_text' }}
写作范围（应写）：{{ content_matrix.write_scope or '' }}
排除范围（禁写）：{{ content_matrix.exclude_scope or '' }}
人工备注：{{ content_matrix.manual_notes or '' }}

## 三、AI解析得分点和响应要求

### 必须响应条款（must_respond）
{% for item in (analysis_points.must_respond or []) %}
- [{{ item.requirement_no or '' }}] {{ item.title or '' }}：{{ item.content or '' }}
{% endfor %}

### 评分点（score_points）
{% for item in (analysis_points.score_points or []) %}
- [{{ item.requirement_no or '' }}] {{ item.title or '' }}{% if item.score_info and item.score_info.score %}（分值：{{ item.score_info.score }}）{% endif %}
{% endfor %}

### 格式要求（format_requirements）
{% for item in (analysis_points.format_requirements or []) %}
- {{ item.title or '' }}
{% endfor %}

## 四、章节撰写模板

{% if writing_template %}
模板名称：{{ writing_template.name or '' }}

模板结构：
{{ writing_template.template_content or '' }}

必填槽位：
{% for item in (writing_template.required_slots or []) %}
- {{ item.name or '' }}：{{ item.description or '' }}{% if item.allowed_rag_channels %}（允许RAG通道：{{ item.allowed_rag_channels }}）{% endif %}
{% endfor %}

可选槽位：
{% for item in (writing_template.optional_slots or []) %}
- {{ item.name or '' }}：{{ item.description or '' }}
{% endfor %}
{% else %}
无匹配模板，请根据章节内容自行组织结构。
{% endif %}

## 五、RAG检索素材

### 1. 历史标书参考
{% for item in (rag_materials.historical_bid or []) %}
{{ item.rank }}. {{ item.document_title or '' }} - {{ item.title or '' }}
   内容摘要：{{ item.content_preview or '' }}
{% endfor %}

### 2. 公司信息
{% for item in (rag_materials.company_info or []) %}
{{ item.rank }}. {{ item.title or '' }}
   内容：{{ item.content_preview or '' }}
{% endfor %}

### 3. 人员资料
{% for item in (rag_materials.personnel or []) %}
{{ item.rank }}. {{ item.title or '' }}
   内容：{{ item.content_preview or '' }}
{% endfor %}

### 4. 资质证书
{% for item in (rag_materials.certificate or []) %}
{{ item.rank }}. {{ item.title or '' }}
   内容：{{ item.content_preview or '' }}
{% endfor %}

### 5. 项目业绩
{% for item in (rag_materials.project_case or []) %}
{{ item.rank }}. {{ item.title or '' }}
   内容：{{ item.content_preview or '' }}
{% endfor %}

## 六、上下文章节信息

### 禁止重复章节（只能引用，不得展开）
{% for item in (context_sections.no_duplicate_sections or []) %}
- {{ item.section_number or '' }} {{ item.title or '' }}（摘要：{{ item.summary or '' }}）
{% endfor %}

### 可引用章节
{% for item in (context_sections.reference_sections or []) %}
- {{ item.section_number or '' }} {{ item.title or '' }}
{% endfor %}

### 前置兄弟章节（已写内容）
{% for item in (context_sections.preceding_siblings or []) %}
- {{ item.section_number or '' }} {{ item.title or '' }}（已涵盖：{{ item.summary or '' }}）
{% endfor %}

## 七、整体目录

{{ outline_structure or '' }}

## 八、项目信息

项目名称：{{ project_info.project_name or '' }}
标段名称：{{ project_info.lot_name or '' }}

{% if user_prompt %}
## 九、用户补充要求

{{ user_prompt }}
{% endif %}

## 十、输出要求

请严格输出JSON格式，不要添加任何解释文本：

{
  "content": "Markdown格式正文",
  "word_count": 正文字数,
  "used_analysis_point_ids": [已响应的分析点ID数组],
  "used_rag_material_ids": [已使用的RAG素材chunk_id数组],
  "missing_info": [
    {"type": "缺失类型", "message": "缺失描述"}
  ],
  "risk_flags": [
    {"type": "风险类型", "message": "风险描述"}
  ],
  "summary": "200-300字章节摘要"
}""",
                "output_schema": {
                    "type": "object",
                    "required": ["content", "word_count"],
                    "properties": {
                        "content": {"type": "string", "description": "Markdown格式正文"},
                        "word_count": {"type": "integer", "description": "正文字数"},
                        "used_analysis_point_ids": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "已响应的分析点ID",
                        },
                        "used_rag_material_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "已使用的RAG素材ID",
                        },
                        "missing_info": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "type": {"type": "string"},
                                    "message": {"type": "string"},
                                },
                            },
                            "description": "缺失信息列表",
                        },
                        "risk_flags": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "type": {"type": "string"},
                                    "message": {"type": "string"},
                                },
                            },
                            "description": "风险标记列表",
                        },
                        "summary": {"type": "string", "description": "章节摘要"},
                    },
                },
                "variable_schema": {
                    "type": "object",
                    "properties": {
                        "current_section": {
                            "type": "object",
                            "properties": {
                                "section_number": {"type": "string"},
                                "title": {"type": "string"},
                                "level": {"type": "integer"},
                            },
                        },
                        "content_matrix": {
                            "type": "object",
                            "properties": {
                                "section_role": {"type": "string"},
                                "expression_form": {"type": "string"},
                                "write_scope": {"type": "string"},
                                "exclude_scope": {"type": "string"},
                                "manual_notes": {"type": "string"},
                            },
                        },
                        "generation_mode": {"type": "string"},
                        "strict_generation_rules": {"type": "string"},
                        "analysis_points": {
                            "type": "object",
                            "properties": {
                                "must_respond": {"type": "array"},
                                "score_points": {"type": "array"},
                                "format_requirements": {"type": "array"},
                            },
                        },
                        "writing_template": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "template_content": {"type": "string"},
                                "required_slots": {"type": "array"},
                                "optional_slots": {"type": "array"},
                            },
                        },
                        "rag_materials": {
                            "type": "object",
                            "properties": {
                                "historical_bid": {"type": "array"},
                                "company_info": {"type": "array"},
                                "personnel": {"type": "array"},
                                "certificate": {"type": "array"},
                                "project_case": {"type": "array"},
                            },
                        },
                        "context_sections": {
                            "type": "object",
                            "properties": {
                                "no_duplicate_sections": {"type": "array"},
                                "reference_sections": {"type": "array"},
                                "preceding_siblings": {"type": "array"},
                            },
                        },
                        "outline_structure": {"type": "string"},
                        "project_info": {
                            "type": "object",
                            "properties": {
                                "project_name": {"type": "string"},
                                "lot_name": {"type": "string"},
                            },
                        },
                        "user_prompt": {"type": "string"},
                    },
                    "required": ["current_section", "content_matrix"],
                },
            },
        ]
        )