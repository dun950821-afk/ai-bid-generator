"""提示词 3.2 草稿创建逻辑测试（DB 层断言脚本产物）。"""

import os
import sys

import pytest

# scripts/ 无 __init__.py（namespace 包），手动注入 backend/ 到 sys.path
sys.path.insert(
    0,
    os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ),
)

from scripts.create_prompt_v3_2_drafts import (  # noqa: E402
    V3_2_INSTRUCTIONS,
    create_v32_drafts,
)

from apps.generation.constants import (  # noqa: E402
    PromptScenario,
    PromptScope,
    PromptVersionStatus,
)
from apps.generation.models import PromptTemplate, PromptVersion  # noqa: E402

SCORING_INSTRUCTION = "评分标准常以表格形式存在"
TECHNICAL_INSTRUCTION = "多文件合并"


@pytest.fixture
def scoring_template_with_31(db):
    """scoring 场景模板 + 已发布 3.1 版本（base）。"""
    template = PromptTemplate.objects.create(
        key="test-v32-scoring",
        name="测试评分模板",
        scenario=PromptScenario.REQUIREMENT_EXTRACTION_SCORING,
        scope=PromptScope.SYSTEM,
    )
    PromptVersion.objects.create(
        template=template,
        version="3.1",
        status=PromptVersionStatus.PUBLISHED,
        system_prompt="基础评分提示词",
        user_prompt="用户提示词",
        output_schema={"type": "object"},
        variable_schema={},
    )
    return template


@pytest.mark.django_db
def test_v3_2_instructions_contain_required_text():
    """V3_2_INSTRUCTIONS 必须包含表格碎片重建与多文件合并说明。"""
    assert SCORING_INSTRUCTION in V3_2_INSTRUCTIONS[
        PromptScenario.REQUIREMENT_EXTRACTION_SCORING
    ]
    assert "不得因表格断裂返回空结果" in V3_2_INSTRUCTIONS[
        PromptScenario.REQUIREMENT_EXTRACTION_SCORING
    ]
    assert TECHNICAL_INSTRUCTION in V3_2_INSTRUCTIONS[
        PromptScenario.REQUIREMENT_EXTRACTION_TECHNICAL
    ]
    assert "需完整提取所有文件中的技术要求" in V3_2_INSTRUCTIONS[
        PromptScenario.REQUIREMENT_EXTRACTION_TECHNICAL
    ]


@pytest.mark.django_db
def test_create_v32_draft_appends_instruction(scoring_template_with_31):
    """3.2 草稿在 3.1 system_prompt 基础上追加场景说明，字段照搬 base。"""
    created, skipped = create_v32_drafts()
    assert PromptScenario.REQUIREMENT_EXTRACTION_SCORING in created
    v32 = PromptVersion.objects.get(
        template=scoring_template_with_31, version="3.2"
    )
    assert v32.status == PromptVersionStatus.DRAFT
    assert v32.system_prompt == (
        "基础评分提示词\n\n"
        + V3_2_INSTRUCTIONS[PromptScenario.REQUIREMENT_EXTRACTION_SCORING]
    )
    assert v32.user_prompt == "用户提示词"
    assert v32.output_schema == {"type": "object"}
    assert v32.changelog.startswith("3.2: ")
    # 3.1 published 未被改动，仍只有一条
    assert (
        PromptVersion.objects.filter(
            template=scoring_template_with_31,
            version="3.1",
            status=PromptVersionStatus.PUBLISHED,
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_second_run_skips_existing_draft(scoring_template_with_31):
    """幂等：3.2 草稿已存在时 SKIP，不重复创建。"""
    create_v32_drafts()
    created, skipped = create_v32_drafts()
    assert PromptScenario.REQUIREMENT_EXTRACTION_SCORING not in created
    assert any("3.2 草稿已存在" in reason for reason in skipped)
    assert (
        PromptVersion.objects.filter(
            template=scoring_template_with_31, version="3.2"
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_force_rebuilds_draft(scoring_template_with_31):
    """--force：删除已有 3.2 草稿后重建为最新 3.1 内容。"""
    create_v32_drafts()
    stale = PromptVersion.objects.get(
        template=scoring_template_with_31, version="3.2"
    )
    stale.system_prompt = "旧内容"
    stale.save()

    created, _ = create_v32_drafts(force=True)
    assert PromptScenario.REQUIREMENT_EXTRACTION_SCORING in created
    v32 = PromptVersion.objects.get(
        template=scoring_template_with_31, version="3.2"
    )
    assert v32.system_prompt == (
        "基础评分提示词\n\n"
        + V3_2_INSTRUCTIONS[PromptScenario.REQUIREMENT_EXTRACTION_SCORING]
    )
    assert PromptVersion.objects.filter(
        template=scoring_template_with_31, version="3.2"
    ).count() == 1


@pytest.mark.django_db
def test_skips_when_no_published_31(db):
    """无已发布 3.1 版本时 SKIP，不创建 3.2。"""
    template = PromptTemplate.objects.create(
        key="test-v32-no-base",
        name="无 base 模板",
        scenario=PromptScenario.REQUIREMENT_EXTRACTION_TECHNICAL,
        scope=PromptScope.SYSTEM,
    )
    created, skipped = create_v32_drafts()
    assert PromptScenario.REQUIREMENT_EXTRACTION_TECHNICAL not in created
    assert any("无已发布 3.1 版本" in reason for reason in skipped)
    assert not PromptVersion.objects.filter(
        template=template, version="3.2"
    ).exists()
