"""单场景抽取执行器：AI 调用（含重试）→ 结构解析 → 过滤 → 落库。"""

import json
import logging

from django.db import transaction

from apps.generation.constants import PromptRunStatus
from apps.generation.services.ai_task_execution_service import (
    AiTaskExecutionError,
    PromptVersionNotFoundError,
)
from apps.requirements.constants import TYPE_TO_SCENARIO, EXTRACTION_TYPE_NAMES

from .errors import RequirementExtractionError
from .filter import MisclassificationFilter
from .output_parser import detect_output_mode, group_to_item, salvage_items_from_output
from .writer import RequirementWriter

logger = logging.getLogger(__name__)

# 模型偶发返回空结构/调用失败时的最大尝试次数（首次 + 重试）
MAX_AI_ATTEMPTS = 2


class SingleTypeExtractor:
    """单场景抽取：调用 AI、解析、过滤、落库。

    只依赖显式传入的输入（全文/分块参考/模型配置），自身不做上下文构建，
    保证并发环境下多个场景共享同一份只读上下文。
    """

    def __init__(self, ai_task_service, writer: RequirementWriter | None = None):
        self.ai_task_service = ai_task_service
        self.writer = writer or RequirementWriter()
        self.filter = MisclassificationFilter()

    def extract(
        self,
        *,
        extraction_type: str,
        document_text: str,
        chunk_context: str,
        tender_file,
        extraction_run,
        created_by,
        prompt_version_id: int | None,
        model_config_id: int | None,
    ) -> dict:
        """执行单类型抽取，返回 {count, ids, prompt_version}。"""
        scenario = TYPE_TO_SCENARIO[extraction_type]

        variables = {
            "document_text": document_text,
            "chunk_context": chunk_context,
            "extraction_type": extraction_type,
            "extraction_type_name": EXTRACTION_TYPE_NAMES.get(extraction_type, extraction_type),
        }

        # 注意：不传递 prompt_version_id，让 AI 服务根据 scenario 自动查找 published 版本
        # 生产实测模型偶发返回空结构 {}（约 1/4 任务出现），解析失败后自动重试一次
        prompt_run = None
        last_error = None
        for attempt in range(MAX_AI_ATTEMPTS):
            try:
                prompt_run = self.ai_task_service.execute(
                    scenario=scenario,
                    variables=variables,
                    created_by=created_by,
                    prompt_version_id=None,  # 自动查找场景对应的 published 版本
                    model_config_id=model_config_id,
                    source="requirement_extraction_v2",
                    business_context={
                        "tender_file_id": tender_file.id,
                        "project_id": tender_file.project_id,
                    },
                )
            except PromptVersionNotFoundError as e:
                logger.error(f"PromptVersion not found for scenario={scenario}: {e}")
                raise RequirementExtractionError(f"未找到提示词版本: {scenario}")
            except AiTaskExecutionError as e:
                logger.warning(
                    "AI task execution failed (attempt=%s): %s", attempt + 1, e
                )
                last_error = RequirementExtractionError(f"AI 调用失败: {e}")
                continue

            if prompt_run.status != PromptRunStatus.SUCCEEDED:
                last_error = RequirementExtractionError(
                    f"AI 调用未成功: {prompt_run.error_message}"
                )
                continue

            # 解析输出（兼容三结构：groups 评分大类 / items 扁平条款 / 数组）
            # 注意：空数组 [] 是合法的"无条款"响应，不能用 or {} 转成空 dict
            output = prompt_run.output_json
            if output is None:
                output = {}
            mode = detect_output_mode(output)
            if mode != "unknown":
                break  # 结构合法，跳出重试循环

            # 输出结构异常（空 dict/缺 items 键等）视为模型响应失败而非"没有条款"：
            # 正常"无内容"应输出 {"items": []}，会命中 items 分支走 count=0 成功路径
            summary = json.dumps(output, ensure_ascii=False)[:200]
            last_error = RequirementExtractionError(
                f"AI 输出结构无法识别（type={extraction_type}）: {summary or '(空输出)'}"
            )
            logger.warning(
                "Unrecognized AI output (attempt=%s) type=%s: %s",
                attempt + 1, extraction_type, summary or "(空输出)",
            )
        else:
            # 重试全部失败：区分两种失败
            if prompt_run is None or prompt_run.status != PromptRunStatus.SUCCEEDED:
                # AI 调用本身失败（无输出可抢救），仍按场景失败处理
                raise last_error or RequirementExtractionError("AI 调用失败")
            # 结构无法识别但最后一次调用成功（有输出）：不再让该场景失败，
            # 把输出尽力抢救进「其他」分类（空输出 {} 视为 0 条成功）
            logger.warning(
                "Unrecognized AI output after retries, salvaging into 'other' "
                "(type=%s): %s",
                extraction_type, json.dumps(output, ensure_ascii=False)[:200] or "(空输出)",
            )
            return self._salvage_unrecognized(
                output=output,
                extraction_type=extraction_type,
                tender_file=tender_file,
                extraction_run=extraction_run,
                created_by=created_by,
                prompt_run=prompt_run,
            )

        if mode == "groups":
            items = [
                group_to_item(g, extraction_type)
                for g in output["groups"]
            ]
        elif mode == "items":
            items = output["items"] if isinstance(output, dict) else output

        # 误分类三级过滤：hard 直接丢弃并记日志，suspected 保留并软标记
        items = self.filter.apply(
            items,
            extraction_type=extraction_type,
            tender_file=tender_file,
        )

        if not items:
            logger.info(f"No items extracted for type={extraction_type}")
            return {
                "count": 0,
                "ids": [],
                "prompt_version": self._prompt_version_info(prompt_run),
            }

        # 保存条款
        requirement_ids = []
        with transaction.atomic():
            for item in items:
                requirement = self.writer.create(
                    item=item,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    prompt_run=prompt_run,
                    extraction_type=extraction_type,
                    created_by=created_by,
                )
                if requirement:
                    requirement_ids.append(requirement.id)

        return {
            "count": len(requirement_ids),
            "ids": requirement_ids,
            "prompt_version": self._prompt_version_info(prompt_run),
        }

    def _salvage_unrecognized(
        self,
        *,
        output,
        extraction_type: str,
        tender_file,
        extraction_run,
        created_by,
        prompt_run,
    ) -> dict:
        """把结构无法识别的输出抢救进「其他」分类（尽力而为，不失败该场景）。"""
        items = salvage_items_from_output(output)
        if not items:
            logger.info(
                "Nothing salvageable for type=%s, treat as empty success", extraction_type
            )
            return {
                "count": 0,
                "ids": [],
                "prompt_version": self._prompt_version_info(prompt_run),
            }

        requirement_ids = []
        with transaction.atomic():
            for item in items:
                requirement = self.writer.create(
                    item=item,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    prompt_run=prompt_run,
                    extraction_type="other",
                    created_by=created_by,
                )
                if requirement:
                    requirement_ids.append(requirement.id)

        logger.info(
            "Salvaged %s items into 'other' for type=%s (tender_file=%s)",
            len(requirement_ids), extraction_type, tender_file.id,
        )
        return {
            "count": len(requirement_ids),
            "ids": requirement_ids,
            "prompt_version": self._prompt_version_info(prompt_run),
        }

    def _prompt_version_info(self, prompt_run) -> dict:
        """获取提示词版本信息。"""
        return {
            "template_id": prompt_run.prompt_template_id,
            "version_id": prompt_run.prompt_version_id,
            "version": prompt_run.prompt_version.version if prompt_run.prompt_version else "",
        }
