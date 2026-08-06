# backend/apps/generation/tests/test_playground_api.py
"""Playground API 测试。"""

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
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

    def test_render_with_text_override(self, api_client, user, prompt_version):
        """调试覆盖 system_prompt/user_prompt：返回覆盖文本渲染结果。"""
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
            "system_prompt": "调试版系统提示词",
            "user_prompt": "调试版用户提示词 {{ topic }}",
        }, format="json")
        assert response.status_code == 200
        assert response.data["system_prompt"] == "调试版系统提示词"
        assert response.data["user_prompt"] == "调试版用户提示词 测试主题"


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
            "save_run": True,
        }, format="json")

        # 检查创建了 PromptRun
        assert PromptRun.objects.count() == initial_count + 1

        run = PromptRun.objects.last()
        assert run.created_by == user
        assert run.prompt_version == prompt_version

    def test_run_default_does_not_save(self, api_client, user, prompt_version, model_config):
        """默认（save_run=False）纯调试：不创建 PromptRun，run_id 为 null。"""
        initial_count = PromptRun.objects.count()

        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
        }, format="json")

        assert response.status_code == 200
        assert PromptRun.objects.count() == initial_count
        assert response.data["run_id"] is None

    def test_run_debug_with_text_override(self, api_client, user, prompt_version, model_config):
        """调试覆盖 system_prompt/user_prompt：渲染与运行都用覆盖文本。"""
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
            "system_prompt": "调试版系统提示词",
            "user_prompt": "调试版用户提示词 {{ topic }}",
        }, format="json")

        assert response.status_code == 200
        assert response.data["run_id"] is None
        assert response.data["rendered_prompt"]["system_prompt"] == "调试版系统提示词"
        assert response.data["rendered_prompt"]["user_prompt"] == "调试版用户提示词 测试主题"

    def test_run_save_with_text_override(self, api_client, user, prompt_version, model_config):
        """save_run=True 且带覆盖：运行记录保存的是覆盖后的渲染文本。"""
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
            "save_run": True,
            "system_prompt": "调试版系统提示词",
        }, format="json")

        assert response.status_code == 200
        assert response.data["run_id"] is not None
        run = PromptRun.objects.get(pk=response.data["run_id"])
        assert run.rendered_system_prompt == "调试版系统提示词"

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
            "save_run": True,
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


@pytest.mark.django_db
class TestPlaygroundParseDocument:
    """测试 parse-document 接口（纯解析不落库）。"""

    URL = "/api/generation/playground/parse-document/"

    def test_parse_requires_auth(self, api_client):
        response = api_client.post(self.URL, {}, format="multipart")
        assert response.status_code == 401

    def test_parse_missing_file(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(self.URL, {}, format="multipart")
        assert response.status_code == 400

    def test_parse_unsupported_extension(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.URL,
            {"file": SimpleUploadedFile("test.exe", b"data")},
            format="multipart",
        )
        assert response.status_code == 400
        assert "不支持的文件格式" in response.data["detail"]

    @override_settings(PLAYGROUND_MAX_DOCUMENT_SIZE=1024)
    def test_parse_oversize(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.URL,
            {"file": SimpleUploadedFile("big.txt", b"x" * 2048)},
            format="multipart",
        )
        assert response.status_code == 400
        assert "文件大小超过" in response.data["detail"]

    @override_settings(PARSER_ENGINE="mock")
    def test_parse_success(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.URL,
            {"file": SimpleUploadedFile("test.txt", "招标文件内容".encode("utf-8"), content_type="text/plain")},
            format="multipart",
        )
        assert response.status_code == 200
        assert response.data["text"]
        assert response.data["filename"] == "test.txt"
        assert response.data["parse_engine"] == "mock"

    def test_parse_internal_error_mapped(self, api_client, user, monkeypatch):
        """解析器抛未预期异常 → 400 通用提示（不外泄 traceback）。"""
        from apps.tender.services import parse_service as parse_service_module

        def boom(self, content, filename):
            raise RuntimeError("boom")

        monkeypatch.setattr(parse_service_module.ParseService, "parse_content", boom)

        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.URL,
            {"file": SimpleUploadedFile("test.txt", b"data")},
            format="multipart",
        )
        assert response.status_code == 400
        assert "文档解析失败" in response.data["detail"]
