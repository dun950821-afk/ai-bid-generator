# backend/apps/generation/tests/test_playground_api.py
"""Playground API 测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.generation.models import PromptTemplate, PromptVersion, ModelConfig, ModelProvider, PromptRun
from apps.generation.constants import PromptScenario, PromptScope, ModelType, PromptRunStatus

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_superuser(username="testuser", password="testpass", email="testuser@example.com")


@pytest.fixture
def prompt_template():
    return PromptTemplate.objects.create(
        key="test_template",
        name="测试模板",
        scenario=PromptScenario.SECTION_WRITING,
        scope=PromptScope.SYSTEM,
    )


@pytest.fixture
def prompt_version(prompt_template):
    return PromptVersion.objects.create(
        template=prompt_template,
        version="1.0.0",
        system_prompt="你是一个助手。",
        user_prompt="请帮我写关于 {{ topic }} 的内容。",
        variable_schema={
            "type": "object",
            "required": ["topic"],
        },
    )


@pytest.fixture
def model_provider():
    return ModelProvider.objects.create(
        name="Mock Provider",
        provider_type="mock",
        is_active=True,
    )


@pytest.fixture
def model_config(model_provider):
    return ModelConfig.objects.create(
        provider=model_provider,
        model_name="mock-model",
        display_name="Mock Model",
        model_type=ModelType.CHAT,
        is_default=True,
        is_active=True,
    )


@pytest.mark.django_db
class TestPlaygroundRender:
    """测试 render 接口。"""

    def test_render_success(self, api_client, user, prompt_version):
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
        }, format="json")
        assert response.status_code == 200
        assert "system_prompt" in response.data
        assert "user_prompt" in response.data
        assert response.data["missing_variables"] == []

    def test_render_missing_variables(self, api_client, user, prompt_version):
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": prompt_version.id,
            "variables": {},
        }, format="json")
        # variable_schema 校验失败（topic required）→ 400
        assert response.status_code == 400

    def test_render_unauthorized(self, api_client, prompt_version):
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": prompt_version.id,
            "variables": {},
        }, format="json")
        assert response.status_code == 401

    def test_render_version_not_found(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": 99999,
            "variables": {},
        }, format="json")
        assert response.status_code == 404


@pytest.mark.django_db
class TestPlaygroundRun:
    """测试 run 接口。"""

    def test_run_missing_variables_returns_error(self, api_client, user, prompt_version, model_config):
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "variables": {},  # 缺少必填变量 topic
        }, format="json")
        # 渲染失败会返回错误
        assert response.status_code in [400, 500]

    def test_run_creates_prompt_run(self, api_client, user, prompt_version, model_config):
        initial_count = PromptRun.objects.count()

        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
        }, format="json")

        # 检查创建了 PromptRun
        assert PromptRun.objects.count() == initial_count + 1

        run = PromptRun.objects.last()
        assert run.created_by == user
        assert run.prompt_version == prompt_version

    def test_run_with_custom_model(self, api_client, user, prompt_version, model_config):
        # 创建另一个模型
        other_config = ModelConfig.objects.create(
            provider=model_config.provider,
            model_name="other-model",
            display_name="Other Model",
            model_type=ModelType.CHAT,
            is_active=True,
        )

        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "model_config_id": other_config.id,
            "variables": {"topic": "测试主题"},
        }, format="json")

        # 检查使用了指定的模型
        run = PromptRun.objects.last()
        assert run.model_config == other_config


@pytest.mark.django_db
class TestPromptRunList:
    """测试 PromptRun 列表接口。"""

    def test_list_requires_auth(self, api_client):
        response = api_client.get("/api/generation/prompt-runs/")
        assert response.status_code == 401

    def test_list_returns_runs(self, api_client, user, prompt_template, prompt_version, model_config):
        # 创建几个运行记录
        PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.SECTION_WRITING,
            input_variables={"topic": "test"},
            rendered_user_prompt="test",
            status=PromptRunStatus.SUCCEEDED,
            created_by=user,
        )

        api_client.force_authenticate(user=user)
        response = api_client.get("/api/generation/prompt-runs/")

        assert response.status_code == 200
        assert isinstance(response.data, list)
        assert len(response.data) >= 1

    def test_list_filter_by_status(self, api_client, user, prompt_template, prompt_version, model_config):
        # 创建不同状态的运行记录
        PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.SECTION_WRITING,
            input_variables={"topic": "test"},
            rendered_user_prompt="test",
            status=PromptRunStatus.SUCCEEDED,
            created_by=user,
        )
        PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.SECTION_WRITING,
            input_variables={"topic": "test2"},
            rendered_user_prompt="test2",
            status=PromptRunStatus.FAILED,
            created_by=user,
        )

        api_client.force_authenticate(user=user)
        response = api_client.get("/api/generation/prompt-runs/?status=succeeded")

        assert response.status_code == 200
        for run in response.data:
            assert run["status"] == "succeeded"


@pytest.mark.django_db
class TestPromptRunDetail:
    """测试 PromptRun 详情接口。"""

    def test_detail_requires_auth(self, api_client, prompt_template, prompt_version, model_config, user):
        run = PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.SECTION_WRITING,
            input_variables={"topic": "test"},
            rendered_user_prompt="test",
            status=PromptRunStatus.SUCCEEDED,
            created_by=user,
        )

        response = api_client.get(f"/api/generation/prompt-runs/{run.id}/")
        assert response.status_code == 401

    def test_detail_returns_run(self, api_client, user, prompt_template, prompt_version, model_config):
        run = PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.SECTION_WRITING,
            input_variables={"topic": "test"},
            rendered_system_prompt="system",
            rendered_user_prompt="user prompt",
            status=PromptRunStatus.SUCCEEDED,
            created_by=user,
        )

        api_client.force_authenticate(user=user)
        response = api_client.get(f"/api/generation/prompt-runs/{run.id}/")

        assert response.status_code == 200
        assert response.data["id"] == run.id
        assert "rendered_system_prompt" in response.data
        assert "rag_info" in response.data

    def test_detail_not_found(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.get("/api/generation/prompt-runs/99999/")
        assert response.status_code == 404
