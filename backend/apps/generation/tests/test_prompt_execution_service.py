# backend/apps/generation/tests/test_prompt_execution_service.py
"""提示词执行服务测试。"""

import pytest

from apps.generation.constants import (
    PromptScenario,
    PromptScope,
    PromptVersionStatus,
    ModelType,
    ProviderType,
    PromptRunStatus,
)
from apps.generation.models import PromptTemplate, PromptVersion, ModelProvider, ModelConfig
from apps.generation.services.prompt_execution_service import (
    PromptExecutionService,
    OutputValidationError,
)
from apps.generation.services.prompt_render_service import TemplateRenderError


@pytest.fixture
def execution_setup(db):
    """创建执行测试所需数据。"""
    provider = ModelProvider.objects.create(
        key="mock_exec",
        name="Mock Provider",
        provider_type=ProviderType.MOCK,
    )
    model_config = ModelConfig.objects.create(
        provider=provider,
        model_name="mock-model",
        model_type=ModelType.CHAT,
        is_default=True,
        is_active=True,
    )
    template = PromptTemplate.objects.create(
        key="exec_test",
        name="执行测试模板",
        scenario=PromptScenario.REQUIREMENT_ANALYSIS,
        scope=PromptScope.SYSTEM,
    )
    version = PromptVersion.objects.create(
        template=template,
        version="1.0",
        user_prompt="分析：{{ content }}",
        system_prompt="你是分析专家",
        status=PromptVersionStatus.PUBLISHED,
    )
    return {
        "provider": provider,
        "model_config": model_config,
        "template": template,
        "version": version,
    }


@pytest.mark.django_db
class TestPromptExecutionService:
    """PromptExecutionService 测试。"""

    def test_execute_success(self, execution_setup):
        """测试成功执行。"""
        service = PromptExecutionService()
        run = service.execute(
            template_key="exec_test",
            variables={"content": "测试条款"},
        )

        assert run.status == PromptRunStatus.SUCCEEDED
        assert run.scenario == PromptScenario.REQUIREMENT_ANALYSIS
        assert "测试条款" in run.rendered_user_prompt
        assert run.total_tokens > 0

    def test_execute_with_output_schema(self, execution_setup):
        """测试带输出 Schema 执行。"""
        version = execution_setup["version"]
        version.output_schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
            },
            "required": ["summary"],
        }
        version.save()

        service = PromptExecutionService()
        run = service.execute(
            template_key="exec_test",
            variables={"content": "测试"},
        )

        assert run.status == PromptRunStatus.SUCCEEDED
        assert "summary" in run.output_json

    def test_execute_with_context(self, execution_setup):
        """测试带业务上下文执行。"""
        service = PromptExecutionService()
        run = service.execute(
            template_key="exec_test",
            variables={"content": "测试"},
            context={"is_sensitive": True},
        )

        assert run.is_sensitive is True

    def test_execute_template_not_found(self, execution_setup):
        """测试模板未找到。"""
        service = PromptExecutionService()
        with pytest.raises(PromptTemplate.DoesNotExist):
            service.execute(
                template_key="nonexistent",
                variables={},
            )

    def test_execute_variable_missing(self, execution_setup):
        """测试变量缺失。"""
        service = PromptExecutionService()
        with pytest.raises(TemplateRenderError):
            service.execute(
                template_key="exec_test",
                variables={},  # 缺少 content
            )

    def test_execute_with_custom_model(self, execution_setup):
        """测试自定义模型配置。"""
        provider = execution_setup["provider"]
        custom_config = ModelConfig.objects.create(
            provider=provider,
            model_name="custom-model",
            model_type=ModelType.CHAT,
            is_default=False,
            is_active=True,
        )

        service = PromptExecutionService()
        run = service.execute(
            template_key="exec_test",
            variables={"content": "测试"},
            model_config=custom_config,
        )

        assert run.model_config == custom_config