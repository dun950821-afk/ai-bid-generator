# backend/apps/generation/services/prompt_render_service.py
"""提示词渲染服务。"""

from dataclasses import dataclass

import jsonschema
from jinja2 import ChainableUndefined
from jinja2.sandbox import SandboxedEnvironment


class VariableValidationError(Exception):
    """变量校验失败。"""
    pass


class TemplateRenderError(Exception):
    """模板渲染失败。"""
    pass


@dataclass
class RenderedPrompt:
    """渲染后的提示词。"""

    system_prompt: str
    user_prompt: str


class SafeUndefined(ChainableUndefined):
    """安全的未定义变量处理。

    访问未定义变量时返回空字符串，支持链式访问。
    """

    def __str__(self):
        return ""

    def __repr__(self):
        return ""

    def __getattr__(self, name):
        return SafeUndefined()

    def __getitem__(self, name):
        return SafeUndefined()


class PromptRenderService:
    """提示词渲染服务。

    使用 SandboxedEnvironment + SafeUndefined 确保安全，
    同时容忍缺失字段（返回空字符串）。
    """

    def __init__(self):
        self._env = SandboxedEnvironment(undefined=SafeUndefined)

    def render(
        self,
        prompt_version,
        variables: dict,
    ) -> RenderedPrompt:
        """渲染提示词。

        Args:
            prompt_version: 提示词版本
            variables: 输入变量

        Returns:
            RenderedPrompt(system_prompt, user_prompt)

        Raises:
            VariableValidationError: 变量校验失败
            TemplateRenderError: 模板渲染失败（如变量缺失）
        """
        # 1. 校验变量 Schema
        if prompt_version.variable_schema:
            self._validate_variables(prompt_version.variable_schema, variables)

        # 2. 渲染模板
        try:
            system_prompt = self._render_text(
                prompt_version.system_prompt,
                variables,
            )
            user_prompt = self._render_text(
                prompt_version.user_prompt,
                variables,
            )
        except Exception as exc:
            raise TemplateRenderError(f"模板渲染失败: {exc}")

        return RenderedPrompt(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

    def _render_text(self, template: str, variables: dict) -> str:
        """使用 Jinja2 SandboxedEnvironment 渲染模板。"""
        if not template:
            return ""
        tmpl = self._env.from_string(template)
        return tmpl.render(**variables)

    def _validate_variables(self, schema: dict, variables: dict) -> None:
        """校验变量是否符合 Schema。"""
        try:
            jsonschema.validate(variables, schema)
        except jsonschema.ValidationError as exc:
            raise VariableValidationError(str(exc))