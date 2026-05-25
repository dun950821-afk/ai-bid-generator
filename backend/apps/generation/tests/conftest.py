# backend/apps/generation/tests/conftest.py
"""提示词管理测试 fixtures。"""

import pytest

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
)


@pytest.fixture
def prompt_template(db):
    """创建测试提示词模板。"""
    return PromptTemplate.objects.create(
        key="test_template",
        name="测试模板",
        scenario=PromptScenario.REQUIREMENT_ANALYSIS,
        scope=PromptScope.SYSTEM,
        description="测试用模板",
    )


@pytest.fixture
def prompt_version(db, prompt_template):
    """创建测试提示词版本。"""
    return PromptVersion.objects.create(
        template=prompt_template,
        version="1.0",
        user_prompt="分析以下条款：{{ content }}",
        system_prompt="你是一个分析专家。",
        status=PromptVersionStatus.PUBLISHED,
    )


@pytest.fixture
def model_provider(db):
    """创建测试模型供应商。"""
    return ModelProvider.objects.create(
        key="mock",
        name="Mock Provider",
        provider_type=ProviderType.MOCK,
    )


@pytest.fixture
def model_config(db, model_provider):
    """创建测试模型配置。"""
    return ModelConfig.objects.create(
        provider=model_provider,
        model_name="mock-model",
        model_type=ModelType.CHAT,
        display_name="Mock Chat Model",
        is_default=True,
    )
