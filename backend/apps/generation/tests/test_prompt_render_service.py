# backend/apps/generation/tests/test_prompt_render_service.py
"""提示词渲染服务测试。"""

import pytest

from apps.generation.services.prompt_render_service import (
    PromptRenderService,
    VariableValidationError,
    TemplateRenderError,
)


@pytest.mark.django_db
class TestPromptRenderService:
    """PromptRenderService 测试。"""

    def test_render_simple(self, prompt_version):
        """测试简单渲染。"""
        service = PromptRenderService()
        prompt_version.user_prompt = "分析：{{ content }}"
        prompt_version.system_prompt = "你是专家"
        prompt_version.save()

        result = service.render(prompt_version, {"content": "测试条款"})
        assert result.system_prompt == "你是专家"
        assert result.user_prompt == "分析：测试条款"

    def test_render_with_missing_variable(self, prompt_version):
        """测试变量缺失报错。"""
        service = PromptRenderService()
        prompt_version.user_prompt = "分析：{{ content }}"
        prompt_version.save()

        with pytest.raises(TemplateRenderError) as exc_info:
            service.render(prompt_version, {})
        assert "模板渲染失败" in str(exc_info.value)

    def test_render_with_variable_schema(self, prompt_version):
        """测试变量 Schema 校验。"""
        service = PromptRenderService()
        prompt_version.user_prompt = "分析：{{ content }}"
        prompt_version.variable_schema = {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
            },
            "required": ["content"],
        }
        prompt_version.save()

        # 符合 Schema
        result = service.render(prompt_version, {"content": "测试"})
        assert "测试" in result.user_prompt

        # 不符合 Schema
        with pytest.raises(VariableValidationError):
            service.render(prompt_version, {})

    def test_render_with_nested_variables(self, prompt_version):
        """测试嵌套变量。"""
        service = PromptRenderService()
        prompt_version.user_prompt = "项目：{{ project.name }}，版本：{{ project.version }}"
        prompt_version.save()

        result = service.render(
            prompt_version,
            {"project": {"name": "测试项目", "version": "1.0"}},
        )
        assert "测试项目" in result.user_prompt
        assert "1.0" in result.user_prompt

    def test_render_empty_system_prompt(self, prompt_version):
        """测试空系统提示词。"""
        service = PromptRenderService()
        prompt_version.user_prompt = "用户提示"
        prompt_version.system_prompt = ""
        prompt_version.save()

        result = service.render(prompt_version, {})
        assert result.system_prompt == ""
        assert result.user_prompt == "用户提示"

    def test_sandbox_security(self, prompt_version):
        """测试沙箱安全性。"""
        service = PromptRenderService()
        # 尝试访问危险属性
        prompt_version.user_prompt = "{{ content.__class__ }}"
        prompt_version.save()

        with pytest.raises(TemplateRenderError):
            service.render(prompt_version, {"content": "test"})