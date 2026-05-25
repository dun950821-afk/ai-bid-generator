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
        ]