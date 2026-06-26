# backend/apps/generation/tests/test_update_requirement_extraction_prompts.py
"""update_requirement_extraction_prompts 命令测试。"""

import pytest
from django.core.management import call_command

from apps.generation.models import PromptTemplate, PromptVersion
from apps.generation.constants import PromptVersionStatus


# 7 个条款抽取模板的 key
TEMPLATE_KEYS = [
    "requirement_extraction.default",
    "requirement_extraction_scoring.default",
    "requirement_extraction_mandatory.default",
    "requirement_extraction_qualification.default",
    "requirement_extraction_commercial.default",
    "requirement_extraction_technical.default",
    "requirement_extraction_submission.default",
]


@pytest.mark.django_db
class TestUpdateRequirementExtractionPrompts:
    """update_requirement_extraction_prompts 命令测试。"""

    def setup_method(self):
        """每个测试前先 seed_prompts 初始化数据。"""
        call_command("seed_prompts")

    def test_command_creates_v2_for_all_seven_templates(self):
        """命令执行后，7 个模板都有 v2.0 published 版本。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.filter(
                template=template, version="2.0"
            ).first()
            assert v2 is not None, f"模板 {key} 没有 v2.0 版本"
            assert v2.status == PromptVersionStatus.PUBLISHED, \
                f"模板 {key} 的 v2.0 未发布"

    def test_command_idempotent(self):
        """命令重复执行幂等，不报错也不产生多个 v2.0。"""
        call_command("update_requirement_extraction_prompts")
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2_count = PromptVersion.objects.filter(
                template=template, version="2.0"
            ).count()
            assert v2_count == 1, f"模板 {key} 有 {v2_count} 个 v2.0 版本（应为 1）"

    def test_v2_system_prompt_contains_title_rules(self):
        """v2.0 的 system_prompt 包含「条款标题规则」段。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            assert "条款标题规则" in v2.system_prompt, \
                f"模板 {key} 的 v2.0 system_prompt 缺少标题规则段"
            assert "不超过 10 个字" in v2.system_prompt, \
                f"模板 {key} 的 v2.0 system_prompt 缺少字数约束"

    def test_v2_output_schema_title_in_required(self):
        """v2.0 的 output_schema 中 title 在 required 列表。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            schema = v2.output_schema or {}
            properties = schema.get("properties", {})
            array_def = properties.get("requirements") or properties.get("items")
            assert array_def is not None, f"模板 {key} 的 schema 缺少数组字段"
            items_def = array_def.get("items", {})
            required = items_def.get("required", [])
            assert "title" in required, \
                f"模板 {key} 的 v2.0 schema required 缺少 title"

    def test_v2_output_schema_title_has_description(self):
        """v2.0 的 output_schema 中 title 字段有 description。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            schema = v2.output_schema or {}
            properties = schema.get("properties", {})
            array_def = properties.get("requirements") or properties.get("items")
            assert array_def is not None, f"模板 {key} 缺少数组字段"
            items_def = array_def.get("items", {})
            item_props = items_def.get("properties", {})
            title_def = item_props.get("title", {})
            assert isinstance(title_def, dict), f"模板 {key} 的 title 不是 dict"
            assert "description" in title_def, \
                f"模板 {key} 的 v2.0 title 字段缺少 description"
            assert "≤10字" in title_def["description"], \
                f"模板 {key} 的 v2.0 title description 不含字数约束"

    def test_v2_user_prompt_contains_chunk_context(self):
        """v2.0 的 user_prompt 含 {{ chunk_context }}（6 个 V2 模板）。"""
        call_command("update_requirement_extraction_prompts")

        v2_keys = [
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in v2_keys:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            assert "{{ chunk_context }}" in v2.user_prompt, \
                f"模板 {key} 的 v2.0 user_prompt 缺少 chunk_context 变量"
            assert "解析分块参考" in v2.user_prompt, \
                f"模板 {key} 的 v2.0 user_prompt 缺少解析分块参考段"

    def test_v2_variable_schema_has_chunk_context(self):
        """v2.0 的 variable_schema 含 chunk_context 属性。"""
        call_command("update_requirement_extraction_prompts")

        clause_keys = [
            "requirement_extraction.default",
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in clause_keys:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            schema = v2.variable_schema or {}
            properties = schema.get("properties", {})
            assert "chunk_context" in properties, \
                f"模板 {key} 的 v2.0 variable_schema 缺少 chunk_context"
