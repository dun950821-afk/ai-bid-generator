# backend/apps/generation/services/prompt_render_service.py
"""提示词渲染服务。"""

from dataclasses import dataclass

import jsonschema
from jinja2 import StrictUndefined
from jinja2.runtime import ChainableUndefined
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


class PromptSandboxedEnvironment(SandboxedEnvironment):
    """沙箱环境：dict 的属性/下标访问按"可选键"处理，缺键返回宽容空值。

    模板经常写 `{{ item.score_info and item.score_info.score }}`、
    `(rag_materials.historical_bid or [])` 这类可选数据守卫——dict 缺键时
    语义上就是"没有该数据"，不应让 StrictUndefined 抛错阻断整个渲染。
    顶层变量缺失仍严格报错（StrictUndefined），防止模板写错必填变量名被静默渲染成空。
    """

    def getattr(self, obj, attribute):
        if isinstance(obj, dict):
            # 键优先（数据胜过方法）；真实方法（get/items 等）走沙箱安全校验
            try:
                return obj[attribute]
            except (KeyError, TypeError):
                pass
            try:
                value = getattr(obj, attribute)
            except AttributeError:
                return ChainableUndefined()
            if self.is_safe_attribute(obj, attribute, value):
                return value
            return ChainableUndefined()
        return super().getattr(obj, attribute)

    def getitem(self, obj, argument):
        if isinstance(obj, dict):
            return obj.get(argument, ChainableUndefined())
        return super().getitem(obj, argument)


class PromptRenderService:
    """提示词渲染服务。

    使用 SandboxedEnvironment + StrictUndefined 确保安全:
    - 沙箱隔离危险操作 (属性访问/方法调用)
    - 顶层缺失变量直接抛 UndefinedError, 让调用方知道变量 schema 不全,
      而不是静默渲染出空字符串 (会污染 AI 输出)
    - dict 的可选键访问（dict.optional_key）宽容处理：缺键渲染为空，
      不阻断整个模板（见 PromptSandboxedEnvironment）
    """

    def __init__(self):
        self._env = PromptSandboxedEnvironment(undefined=StrictUndefined)

    def render(
        self,
        prompt_version,
        variables: dict,
        system_prompt: str = None,
        user_prompt: str = None,
    ) -> RenderedPrompt:
        """渲染提示词。

        Args:
            prompt_version: 提示词版本
            variables: 输入变量
            system_prompt: 调试覆盖文本，非空时跳过版本模板直接用该文本渲染
            user_prompt: 调试覆盖文本，非空时跳过版本模板直接用该文本渲染

        Returns:
            RenderedPrompt(system_prompt, user_prompt)

        Raises:
            VariableValidationError: 变量校验失败
            TemplateRenderError: 模板渲染失败（如变量缺失）
        """
        # 1. 校验变量 Schema
        if prompt_version.variable_schema:
            self._validate_variables(prompt_version.variable_schema, variables)
            # 1.5 可选变量预填：schema 声明但未提供的键按类型补空值，
            # 避免模板引用可选变量（如 {{ extraction_type_name }}）时
            # StrictUndefined 抛错。required 缺失仍在上一步报错。
            variables = self._fill_optional_schema_variables(
                prompt_version.variable_schema, variables
            )

        # 2. 渲染模板
        try:
            system_prompt = self._render_text(
                system_prompt if system_prompt is not None else prompt_version.system_prompt,
                variables,
            )
            user_prompt = self._render_text(
                user_prompt if user_prompt is not None else prompt_version.user_prompt,
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

    @staticmethod
    def _fill_optional_schema_variables(schema: dict, variables: dict) -> dict:
        """为 schema 中可选（非 required）且未提供的属性预填类型空值。

        渲染层使用 StrictUndefined：模板引用顶层缺失变量会抛错。schema 声明的
        可选变量语义上就是"可缺省"，缺省时按类型填空值最符合直觉——
        string→""、number/integer→0、boolean→false、array→[]、object→{}；
        声明 default 的用 default。
        """
        properties = schema.get("properties", {})
        if not properties:
            return variables

        required = set(schema.get("required", []))
        filled = dict(variables)
        for name, prop_schema in properties.items():
            if name in required or name in filled:
                continue
            if "default" in prop_schema:
                filled[name] = prop_schema["default"]
            else:
                filled[name] = {
                    "string": "",
                    "number": 0,
                    "integer": 0,
                    "boolean": False,
                    "array": [],
                    "object": {},
                }.get(prop_schema.get("type"), "")
        return filled