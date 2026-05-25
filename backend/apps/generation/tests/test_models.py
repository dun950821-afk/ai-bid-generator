# backend/apps/generation/tests/test_models.py
"""提示词管理模型测试。"""

import pytest
from django.db import IntegrityError

from apps.generation.constants import (
    PromptScenario,
    PromptScope,
    PromptVersionStatus,
    ModelType,
    ProviderType,
)
from apps.generation.models import (
    PromptTemplate,
    PromptVersion,
    ModelProvider,
    ModelConfig,
    PromptRun,
)


@pytest.mark.django_db
class TestPromptTemplate:
    """PromptTemplate 模型测试。"""

    def test_create_prompt_template(self):
        """测试创建提示词模板。"""
        template = PromptTemplate.objects.create(
            key="outline_generation.default",
            name="大纲生成模板",
            scenario=PromptScenario.OUTLINE_GENERATION,
            scope=PromptScope.SYSTEM,
            description="用于生成投标文件大纲",
        )
        assert template.id is not None
        assert template.key == "outline_generation.default"
        assert template.is_active is True

    def test_unique_key_per_scope(self):
        """测试同一作用域下 key 唯一。"""
        PromptTemplate.objects.create(
            key="test.unique",
            name="模板1",
            scenario=PromptScenario.OUTLINE_GENERATION,
            scope=PromptScope.SYSTEM,
        )
        with pytest.raises(IntegrityError):
            PromptTemplate.objects.create(
                key="test.unique",
                name="模板2",
                scenario=PromptScenario.SECTION_WRITING,
                scope=PromptScope.SYSTEM,
            )

    def test_str_representation(self, prompt_template):
        """测试字符串表示。"""
        assert str(prompt_template) == "test_template (requirement_analysis)"


@pytest.mark.django_db
class TestPromptVersion:
    """PromptVersion 模型测试。"""

    def test_create_prompt_version(self, prompt_template):
        """测试创建提示词版本。"""
        version = PromptVersion.objects.create(
            template=prompt_template,
            version="1.0",
            user_prompt="测试提示词 {{ variable }}",
            system_prompt="系统提示",
        )
        assert version.id is not None
        assert version.status == PromptVersionStatus.DRAFT

    def test_unique_version_per_template(self, prompt_template):
        """测试同一模板下版本号唯一。"""
        PromptVersion.objects.create(
            template=prompt_template,
            version="1.0",
            user_prompt="v1",
        )
        with pytest.raises(IntegrityError):
            PromptVersion.objects.create(
                template=prompt_template,
                version="1.0",
                user_prompt="v1 duplicate",
            )

    def test_only_one_published_per_template(self, prompt_template):
        """测试同一模板只能有一个 published 版本。"""
        PromptVersion.objects.create(
            template=prompt_template,
            version="1.0",
            user_prompt="v1",
            status=PromptVersionStatus.PUBLISHED,
        )
        # 创建第二个 published 应该失败
        with pytest.raises(IntegrityError):
            PromptVersion.objects.create(
                template=prompt_template,
                version="2.0",
                user_prompt="v2",
                status=PromptVersionStatus.PUBLISHED,
            )

    def test_publish_version(self, prompt_template):
        """测试发布版本。"""
        v1 = PromptVersion.objects.create(
            template=prompt_template,
            version="1.0",
            user_prompt="v1",
            status=PromptVersionStatus.PUBLISHED,
        )
        v2 = PromptVersion.objects.create(
            template=prompt_template,
            version="2.0",
            user_prompt="v2",
            status=PromptVersionStatus.DRAFT,
        )

        # 发布 v2
        v2.publish()

        v1.refresh_from_db()
        v2.refresh_from_db()
        assert v1.status == PromptVersionStatus.ARCHIVED
        assert v2.status == PromptVersionStatus.PUBLISHED

    def test_str_representation(self, prompt_version):
        """测试字符串表示。"""
        assert "test_template@1.0" in str(prompt_version)


@pytest.mark.django_db
class TestModelProvider:
    """ModelProvider 模型测试。"""

    def test_create_model_provider(self):
        """测试创建模型供应商。"""
        provider = ModelProvider.objects.create(
            key="dashscope",
            name="阿里百炼",
            provider_type="dashscope",
            base_url="https://dashscope.aliyuncs.com/api/v1",
            api_key_env="DASHSCOPE_API_KEY",
        )
        assert provider.id is not None
        assert provider.is_active is True

    def test_unique_key(self):
        """测试 key 唯一。"""
        ModelProvider.objects.create(
            key="test_provider",
            name="测试供应商",
            provider_type="mock",
        )
        with pytest.raises(IntegrityError):
            ModelProvider.objects.create(
                key="test_provider",
                name="重复供应商",
                provider_type="mock",
            )

    def test_str_representation(self, model_provider):
        """测试字符串表示。"""
        assert str(model_provider) == "Mock Provider"


@pytest.mark.django_db
class TestModelConfig:
    """ModelConfig 模型测试。"""

    def test_create_model_config(self, model_provider):
        """测试创建模型配置。"""
        config = ModelConfig.objects.create(
            provider=model_provider,
            model_name="qwen-max",
            model_type=ModelType.CHAT,
            display_name="通义千问 Max",
            temperature=0.3,
            max_tokens=8192,
        )
        assert config.id is not None
        assert config.temperature == 0.3

    def test_only_one_default_per_type(self, model_provider):
        """测试同一类型只能有一个默认模型。"""
        ModelConfig.objects.create(
            provider=model_provider,
            model_name="model1",
            model_type=ModelType.CHAT,
            is_default=True,
            is_active=True,
        )
        # 创建第二个默认应该失败
        with pytest.raises(IntegrityError):
            ModelConfig.objects.create(
                provider=model_provider,
                model_name="model2",
                model_type=ModelType.CHAT,
                is_default=True,
                is_active=True,
            )

    def test_inactive_default_allowed(self, model_provider):
        """测试非 active 的默认可以存在。"""
        ModelConfig.objects.create(
            provider=model_provider,
            model_name="model1",
            model_type=ModelType.CHAT,
            is_default=True,
            is_active=True,
        )
        # is_active=False 的默认可以创建
        config = ModelConfig.objects.create(
            provider=model_provider,
            model_name="model2",
            model_type=ModelType.CHAT,
            is_default=True,
            is_active=False,
        )
        assert config.is_default is True

    def test_str_representation(self, model_config, model_provider):
        """测试字符串表示。"""
        assert str(model_config) == f"{model_provider.name}/{model_config.model_name}"


@pytest.mark.django_db
class TestPromptRun:
    """PromptRun 模型测试。"""

    def test_create_prompt_run(self, prompt_template, prompt_version, model_config):
        """测试创建运行记录。"""
        run = PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.REQUIREMENT_ANALYSIS,
            input_variables={"content": "测试条款"},
            rendered_user_prompt="分析以下条款：测试条款",
            status="running",
        )
        assert run.id is not None
        assert run.status == "running"

    def test_record_success(self, prompt_template, prompt_version, model_config):
        """测试记录成功结果。"""
        run = PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.REQUIREMENT_ANALYSIS,
            input_variables={},
            rendered_user_prompt="test",
            status="running",
        )
        run.output_text = '{"summary": "测试"}'
        run.output_json = {"summary": "测试"}
        run.prompt_tokens = 100
        run.completion_tokens = 50
        run.total_tokens = 150
        run.latency_ms = 500
        run.status = "succeeded"
        run.save()

        run.refresh_from_db()
        assert run.status == "succeeded"
        assert run.total_tokens == 150

    def test_record_failure(self, prompt_template, prompt_version, model_config):
        """测试记录失败结果。"""
        run = PromptRun.objects.create(
            prompt_template=prompt_template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=PromptScenario.REQUIREMENT_ANALYSIS,
            input_variables={},
            rendered_user_prompt="test",
            status="running",
        )
        run.status = "failed"
        run.error_message = "API 调用失败"
        run.latency_ms = 100
        run.save()

        run.refresh_from_db()
        assert run.status == "failed"
        assert run.error_message == "API 调用失败"

    def test_str_representation(self, prompt_template):
        """测试字符串表示。"""
        run = PromptRun.objects.create(
            prompt_template=prompt_template,
            scenario=PromptScenario.REQUIREMENT_ANALYSIS,
            input_variables={},
            rendered_user_prompt="test",
        )
        assert f"PromptRun#{run.id}" in str(run)
