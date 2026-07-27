# backend/apps/generation/tests/test_seed_prompts.py
"""seed_prompts 命令测试。"""

import pytest
from django.core.management import call_command

from apps.generation.models import PromptTemplate, PromptVersion, ModelProvider, ModelConfig
from apps.generation.constants import PromptVersionStatus


@pytest.mark.django_db
class TestSeedPrompts:
    """seed_prompts 命令测试。"""

    def test_seed_prompts_creates_data(self):
        """测试创建数据。"""
        call_command("seed_prompts")

        # 验证 Provider
        assert ModelProvider.objects.filter(key="mock").exists()

        # 验证 ModelConfig
        assert ModelConfig.objects.filter(is_default=True).exists()

        # 验证模板
        assert PromptTemplate.objects.filter(key="outline_generation.default").exists()
        assert PromptTemplate.objects.filter(key="requirement_analysis.default").exists()
        assert PromptTemplate.objects.filter(key="section_writing.default").exists()

    def test_seed_prompts_idempotent(self):
        """测试幂等性。"""
        call_command("seed_prompts")
        count = PromptTemplate.objects.count()

        call_command("seed_prompts")
        assert PromptTemplate.objects.count() == count

    def test_seed_prompts_published_versions(self):
        """测试版本已发布。"""
        call_command("seed_prompts")

        versions = PromptVersion.objects.filter(status=PromptVersionStatus.PUBLISHED)
        # 当前 seed_prompts 创建 32 个模板：3 基础 + 7 条款抽取 + 4 全局事实 + 4 废标检查
        # + 3 一致性审计 + 1 表格清理 + 1 大纲扩展 + 1 章节扩展 + 1 mermaid + 1 图片生成
        # + 3 大纲相关 + 2 章节内容 + 1 内容矩阵
        assert versions.count() == 32

    def test_seed_prompts_clause_title_rules_in_system_prompt(self):
        """7 个条款抽取模板的 system_prompt 都包含「条款标题规则」段。"""
        call_command("seed_prompts")

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
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            assert published is not None, f"模板 {key} 无 published 版本"
            assert "条款标题规则" in published.system_prompt, \
                f"模板 {key} 的 system_prompt 缺少标题规则段"
            assert "不超过 10 个字" in published.system_prompt, \
                f"模板 {key} 的 system_prompt 缺少字数约束"

    def test_seed_prompts_default_title_in_required(self):
        """requirement_extraction.default 的 output_schema required 包含 title。"""
        call_command("seed_prompts")

        template = PromptTemplate.objects.get(key="requirement_extraction.default")
        published = PromptVersion.objects.filter(
            template=template, status=PromptVersionStatus.PUBLISHED
        ).first()
        schema = published.output_schema or {}
        array_def = schema.get("properties", {}).get("requirements", {})
        items_def = array_def.get("items", {})
        required = items_def.get("required", [])
        assert "title" in required, "requirement_extraction.default 的 required 缺少 title"

    def test_seed_prompts_clause_title_has_description(self):
        """7 个条款抽取模板的 title 字段都有 description。"""
        call_command("seed_prompts")

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
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            schema = published.output_schema or {}
            properties = schema.get("properties", {})
            array_def = properties.get("requirements") or properties.get("items")
            assert array_def is not None, f"模板 {key} 缺少数组字段"
            items_def = array_def.get("items", {})
            item_props = items_def.get("properties", {})
            title_def = item_props.get("title", {})
            assert isinstance(title_def, dict), f"模板 {key} 的 title 不是 dict"
            assert "description" in title_def, f"模板 {key} 的 title 缺少 description"
            assert "≤10字" in title_def["description"], \
                f"模板 {key} 的 title description 不含字数约束"

    def test_seed_prompts_clause_user_prompt_has_chunk_context(self):
        """6 个 V2 条款抽取模板的 user_prompt 含 {{ chunk_context }}。"""
        call_command("seed_prompts")

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
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            assert "{{ chunk_context }}" in published.user_prompt, \
                f"模板 {key} 的 user_prompt 缺少 chunk_context 变量"
            assert "解析分块参考" in published.user_prompt, \
                f"模板 {key} 的 user_prompt 缺少解析分块参考段"

    def test_seed_prompts_clause_variable_schema_has_chunk_context(self):
        """7 个条款抽取模板的 variable_schema 含 chunk_context 属性。"""
        call_command("seed_prompts")

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
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            schema = published.variable_schema or {}
            properties = schema.get("properties", {})
            assert "chunk_context" in properties, \
                f"模板 {key} 的 variable_schema 缺少 chunk_context 属性"