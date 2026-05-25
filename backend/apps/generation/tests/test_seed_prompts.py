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
        assert versions.count() == 3