# backend/apps/generation/services/prompt_execution_service.py
"""提示词执行服务。"""

import json
import time

import jsonschema

from apps.generation.constants import PromptScope, PromptVersionStatus, PromptRunStatus, ModelType
from apps.generation.models import PromptTemplate, PromptVersion, ModelConfig, PromptRun
from apps.generation.services.prompt_render_service import (
    PromptRenderService,
    TemplateRenderError,
    VariableValidationError,
)
from apps.generation.services.llm_service import LLMService


class OutputValidationError(Exception):
    """输出校验失败。"""
    pass


class PromptExecutionService:
    """提示词执行服务。

    组合渲染、调用、日志记录。
    """

    def __init__(self):
        self.render_service = PromptRenderService()
        self.llm_service = LLMService()

    def execute(
        self,
        template_key: str,
        variables: dict,
        model_config=None,
        context: dict | None = None,
    ) -> PromptRun:
        """执行提示词。

        Args:
            template_key: 模板键
            variables: 输入变量
            model_config: 模型配置（可选，默认使用场景默认配置）
            context: 业务上下文（project、tender_file 等）

        Returns:
            PromptRun 运行记录
        """
        # 1. 获取已发布版本
        prompt_version = self._get_published_version(template_key)

        # 2. 渲染提示词
        rendered = self.render_service.render(prompt_version, variables)

        # 3. 确定模型配置
        if model_config is None:
            model_config = self._get_default_model_config()

        # 4. 创建运行记录
        run = PromptRun.objects.create(
            prompt_template=prompt_version.template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=prompt_version.template.scenario,
            input_variables=variables,
            rendered_system_prompt=rendered.system_prompt,
            rendered_user_prompt=rendered.user_prompt,
            status=PromptRunStatus.RUNNING,
            **(context or {}),
        )

        # 5. 执行调用
        start_time = time.time()
        try:
            response = self.llm_service.chat(
                model_config=model_config,
                system_prompt=rendered.system_prompt,
                user_prompt=rendered.user_prompt,
                response_format=prompt_version.output_schema or None,
            )

            # 6. 解析 JSON 输出
            output_json = response.json
            if not output_json and response.text:
                try:
                    output_json = json.loads(response.text)
                except json.JSONDecodeError:
                    output_json = {}

            # 7. 校验输出 Schema
            if prompt_version.output_schema:
                self._validate_output(output_json, prompt_version.output_schema)

            # 8. 更新成功结果
            run.output_text = response.text
            run.output_json = output_json
            run.prompt_tokens = response.prompt_tokens
            run.completion_tokens = response.completion_tokens
            run.total_tokens = response.total_tokens
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.status = PromptRunStatus.SUCCEEDED
            run.save()

        except OutputValidationError as exc:
            run.status = PromptRunStatus.FAILED
            run.error_message = f"输出 JSON 不符合 schema: {exc}"
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.save()
            raise

        except Exception as exc:
            run.status = PromptRunStatus.FAILED
            run.error_message = str(exc)[:2000]
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.save()
            raise

        return run

    def _get_published_version(self, template_key: str) -> PromptVersion:
        """获取已发布版本。"""
        template = PromptTemplate.objects.get(
            key=template_key,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        return PromptVersion.objects.get(
            template=template,
            status=PromptVersionStatus.PUBLISHED,
        )

    def _get_default_model_config(self) -> ModelConfig:
        """获取默认模型配置。"""
        return ModelConfig.objects.get(
            model_type=ModelType.CHAT,
            is_default=True,
            is_active=True,
        )

    def _validate_output(self, output_json: dict, schema: dict) -> None:
        """校验输出是否符合 Schema。"""
        try:
            jsonschema.validate(output_json, schema)
        except jsonschema.ValidationError as exc:
            raise OutputValidationError(str(exc))