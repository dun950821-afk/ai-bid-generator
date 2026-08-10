# backend/apps/generation/tests/test_align_mainline_prompts.py
"""align_mainline_prompts 命令测试（幂等性 + 状态正确性）。"""

import pytest
from django.core.management import call_command

from apps.generation.models import PromptTemplate, PromptVersion
from apps.generation.constants import PromptScope, PromptVersionStatus
from apps.generation.management.commands.align_mainline_prompts import (
    MAINLINE_KEYS,
    LEGACY_KEYS,
    SCORING_RULE_MARKER,
)


@pytest.mark.django_db
class TestAlignMainlinePrompts:
    """align_mainline_prompts 命令测试。"""

    def _prepare(self):
        """seed 1.0 + 构造 antiai 双模板与 scoring 3.2 draft 的线上现状。"""
        call_command("seed_prompts")

        # 构造 antiai 变体（线上遗留：双 published 模板）
        antiai = PromptTemplate.objects.create(
            key="section_content_generation.antiai",
            name="正文生成模板（反AI味）",
            scenario="section_content_generation",
            scope=PromptScope.SYSTEM,
        )
        PromptVersion.objects.create(
            template=antiai,
            version="1.0",
            user_prompt="antiai 正文生成",
            status=PromptVersionStatus.PUBLISHED,
        )

        # 构造 scoring 3.2 draft（线上现状：3.1 published / 3.2 draft）
        scoring = PromptTemplate.objects.get(key="requirement_extraction_scoring.default")
        PromptVersion.objects.create(
            template=scoring,
            version="3.2",
            system_prompt="评分项抽取系统提示词（含表格断裂重建规则）",
            user_prompt="评分项抽取用户提示词",
            status=PromptVersionStatus.DRAFT,
        )

    def test_align_creates_v2_and_publishes(self):
        """11 个主链路模板建版本并发布，1.0 归档（正文生成模板为 v3.0，其余 v2.0）。"""
        self._prepare()
        call_command("align_mainline_prompts")

        for key in MAINLINE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            expected = "3.0" if key == "section_content_generation.default" else "2.0"
            v2 = PromptVersion.objects.get(template=template, version=expected)
            assert v2.status == PromptVersionStatus.PUBLISHED, f"{key} v{expected} 未发布"
            v1 = PromptVersion.objects.get(template=template, version="1.0")
            assert v1.status == PromptVersionStatus.ARCHIVED, f"{key} 1.0 未归档"

    def test_align_idempotent(self):
        """重复执行不重复建版本、状态保持正确。"""
        self._prepare()
        call_command("align_mainline_prompts")
        version_count = PromptVersion.objects.count()

        call_command("align_mainline_prompts")
        assert PromptVersion.objects.count() == version_count

        # 每个主链路模板仍只有一个 published
        for key in MAINLINE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            )
            assert published.count() == 1
            expected = "3.0" if key == "section_content_generation.default" else "2.0"
            assert published.first().version == expected

        # scoring 规则未重复追加
        scoring = PromptTemplate.objects.get(key="requirement_extraction_scoring.default")
        v32 = PromptVersion.objects.get(template=scoring, version="3.2")
        assert v32.system_prompt.count(SCORING_RULE_MARKER) == 1

    def test_align_retires_antiai(self):
        """antiai 模板停用且版本归档，scenario 解析唯一落到 .default。"""
        self._prepare()
        call_command("align_mainline_prompts")

        antiai = PromptTemplate.objects.get(key="section_content_generation.antiai")
        assert antiai.is_active is False
        assert not PromptVersion.objects.filter(
            template=antiai, status=PromptVersionStatus.PUBLISHED
        ).exists()

        default = PromptTemplate.objects.get(key="section_content_generation.default")
        assert default.is_active is True
        published = PromptVersion.objects.get(
            template=default, status=PromptVersionStatus.PUBLISHED
        )
        assert published.version == "3.0"

    def test_align_publishes_scoring_32(self):
        """scoring 3.2 追加评分要求规则并发布，旧版归档。"""
        self._prepare()
        call_command("align_mainline_prompts")

        scoring = PromptTemplate.objects.get(key="requirement_extraction_scoring.default")
        v32 = PromptVersion.objects.get(template=scoring, version="3.2")
        assert v32.status == PromptVersionStatus.PUBLISHED
        assert SCORING_RULE_MARKER in v32.system_prompt

        published = PromptVersion.objects.filter(
            template=scoring, status=PromptVersionStatus.PUBLISHED
        )
        assert published.count() == 1

    def test_align_deactivates_legacy(self):
        """遗留模板停用（不删数据），content_matrix v1 保留。"""
        self._prepare()
        call_command("align_mainline_prompts")

        for key in LEGACY_KEYS:
            template = PromptTemplate.objects.get(key=key)
            assert template.is_active is False, f"遗留模板 {key} 未停用"
            # 数据未删除
            assert PromptVersion.objects.filter(template=template).exists()

        matrix_v1 = PromptTemplate.objects.get(key="content_matrix_generation.default")
        assert matrix_v1.is_active is True

    def test_align_scoring_without_32_skips(self):
        """无 3.2 版本时跳过 scoring 更新，不影响其他模板。"""
        call_command("seed_prompts")
        call_command("align_mainline_prompts")

        scoring = PromptTemplate.objects.get(key="requirement_extraction_scoring.default")
        assert not PromptVersion.objects.filter(
            template=scoring, version="3.2"
        ).exists()
        # 其他主链路模板正常建版本（正文生成为 v3.0）
        default = PromptTemplate.objects.get(key="section_content_generation.default")
        assert PromptVersion.objects.filter(template=default, version="3.0").exists()
