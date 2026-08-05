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

    def test_render_dict_missing_key_is_lenient(self, prompt_version):
        """dict 可选键缺键：宽容渲染为空，不阻断模板。

        回归：score_info 无 score 键、rag_materials 无 historical_bid 通道时，
        带 and/ or [] 守卫的模板必须正常渲染（此前 StrictUndefined 直接抛错）。
        """
        service = PromptRenderService()
        prompt_version.user_prompt = (
            "{% for item in (analysis_points.score_points or []) %}"
            "- {{ item.title }}{% if item.score_info and item.score_info.score %}（{{ item.score_info.score }}）{% endif %}\n"
            "{% endfor %}"
            "{% for item in (rag_materials.historical_bid or []) %}"
            "{{ item.rank }}. {{ item.title }}\n"
            "{% endfor %}"
        )
        prompt_version.save()

        result = service.render(prompt_version, {
            "analysis_points": {
                "score_points": [
                    {"title": "评分A", "score_info": {"score_basis": "not_applicable"}},
                    {"title": "评分B", "score_info": {"score": 5}},
                ],
            },
            "rag_materials": {},
        })

        assert "评分A" in result.user_prompt
        assert "（5）" in result.user_prompt
        assert "评分B" in result.user_prompt
        # 无 historical_bid 通道：循环为空，不报错
        assert "." not in result.user_prompt.split("评分B")[1]

    def test_render_dict_method_call_works(self, prompt_version):
        """dict 方法调用（.get/.items）在宽容环境下仍可用。"""
        service = PromptRenderService()
        prompt_version.user_prompt = "{{ rag.get('historical_bid') or '无历史标书' }}"
        prompt_version.save()

        result = service.render(prompt_version, {"rag": {"historical_bid": [{"title": "x"}]}})
        assert "无历史标书" not in result.user_prompt

        result = service.render(prompt_version, {"rag": {}})
        assert "无历史标书" in result.user_prompt

    def test_sandbox_security_dict(self, prompt_version):
        """dict 危险属性访问：渲染为空，不暴露不报错。"""
        service = PromptRenderService()
        prompt_version.user_prompt = "[{{ content.__class__ }}]"
        prompt_version.save()

        result = service.render(prompt_version, {"content": {}})
        assert result.user_prompt == "[]"