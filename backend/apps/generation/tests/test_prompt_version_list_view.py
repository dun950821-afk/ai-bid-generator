# backend/apps/generation/tests/test_prompt_version_list_view.py
"""按场景查询提示词版本列表：多场景筛选支持。"""

import pytest
from rest_framework.test import APIClient

from apps.generation.constants import (
    PromptScenario,
    PromptScope,
    PromptVersionStatus,
)
from apps.generation.models import PromptTemplate, PromptVersion


def _make_template(scenario: str) -> PromptTemplate:
    return PromptTemplate.objects.create(
        key=f"tpl_{scenario}",
        name=f"模板-{scenario}",
        scenario=scenario,
        scope=PromptScope.SYSTEM,
        description="测试用模板",
    )


def _publish(template: PromptTemplate) -> PromptVersion:
    return PromptVersion.objects.create(
        template=template,
        version="2.0",
        system_prompt="抽取提示词",
        status=PromptVersionStatus.PUBLISHED,
    )


@pytest.fixture
def api_client():
    return APIClient()


class TestMultiScenarioFilter:
    @pytest.mark.django_db
    def test_multiple_scenario_params(self, api_client, admin_user):
        scoring = _make_template(PromptScenario.REQUIREMENT_EXTRACTION_SCORING)
        mandatory = _make_template(PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY)
        analysis = _make_template(PromptScenario.REQUIREMENT_ANALYSIS)
        _publish(scoring)
        _publish(mandatory)
        _publish(analysis)

        api_client.force_authenticate(user=admin_user)
        response = api_client.get(
            "/api/generation/prompt-versions/",
            {"scenario": [PromptScenario.REQUIREMENT_EXTRACTION_SCORING,
                          PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY]},
        )

        assert response.status_code == 200
        scenarios = {item["template_scenario"] for item in response.data}
        assert scenarios == {
            PromptScenario.REQUIREMENT_EXTRACTION_SCORING,
            PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY,
        }

    @pytest.mark.django_db
    def test_axios_bracket_params(self, api_client, admin_user):
        """axios 数组参数序列化为 scenario[]=a&scenario[]=b，需兼容。"""
        scoring = _make_template(PromptScenario.REQUIREMENT_EXTRACTION_SCORING)
        mandatory = _make_template(PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY)
        analysis = _make_template(PromptScenario.REQUIREMENT_ANALYSIS)
        _publish(scoring)
        _publish(mandatory)
        _publish(analysis)

        api_client.force_authenticate(user=admin_user)
        response = api_client.get(
            "/api/generation/prompt-versions/",
            {"scenario[]": [PromptScenario.REQUIREMENT_EXTRACTION_SCORING,
                            PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY]},
        )

        assert response.status_code == 200
        assert len(response.data) == 2
        scenarios = {item["template_scenario"] for item in response.data}
        assert scenarios == {
            PromptScenario.REQUIREMENT_EXTRACTION_SCORING,
            PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY,
        }

    @pytest.mark.django_db
    def test_single_scenario_still_works(self, api_client, admin_user):
        scoring = _make_template(PromptScenario.REQUIREMENT_EXTRACTION_SCORING)
        mandatory = _make_template(PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY)
        _publish(scoring)
        _publish(mandatory)

        api_client.force_authenticate(user=admin_user)
        response = api_client.get(
            "/api/generation/prompt-versions/",
            {"scenario": PromptScenario.REQUIREMENT_EXTRACTION_SCORING},
        )

        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["template_scenario"] == PromptScenario.REQUIREMENT_EXTRACTION_SCORING
