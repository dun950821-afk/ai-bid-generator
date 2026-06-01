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
        return [
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
- other: 其他""",
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
                                    "title": {"type": "string", "description": "条款标题"},
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
                                "required": ["requirement_type", "content", "mandatory_level", "risk_level"],
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
                        "requirement_type_options": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["chunk_content"],
                },
            },
        ]