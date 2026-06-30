# backend/apps/bid_check/services/bid_check_workflow.py
"""废标检查 Celery 任务工作流（借鉴 OpenBidKit rejectionCheckTask）。

严格学习 OpenBidKit 的三轮流程：
1. 提取废标项清单
2. 第一轮分析 → 第二轮检查 → 第三轮定稿
"""

import logging

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.bid_check.constants import BidCheckTaskStatus
from apps.bid_check.models import BidCheckTask
from apps.common.models import AsyncTask

User = get_user_model()
logger = logging.getLogger(__name__)


def run_bid_check(*, task_id: int, async_task_id: int, user_id: int) -> None:
    """废标检查工作流入口。"""
    from apps.bid_check.services.bid_check_service import BidCheckService
    from apps.generation.services.ai_task_execution_service import (
        AiTaskExecutionService,
    )
    from apps.outline.models import BidDocument, Outline

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)
    task = BidCheckTask.objects.select_related("outline", "bid_document").get(pk=task_id)
    service = BidCheckService()
    ai = AiTaskExecutionService()

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.started_at = timezone.now()
        async_task.current_step = "读取投标文件与招标文件"
        async_task.progress = 5
        async_task.save()

        outline = task.outline
        bid_document = task.bid_document
        tender_markdown = service._load_tender_markdown(outline)
        bid_content = service._load_bid_content(bid_document)

        if not tender_markdown:
            raise ValueError("招标文件未解析或解析结果为空")
        if not bid_content:
            raise ValueError("投标文件内容为空，无法检查")

        # ===== 阶段1：提取废标项清单 =====
        async_task.current_step = BidCheckTaskStatus.EXTRACTING
        async_task.progress = 10
        task.status = BidCheckTaskStatus.EXTRACTING
        task.save()
        async_task.save()

        try:
            run = ai.execute(
                scenario="bid_invalid_items_extract",
                variables={"tender_markdown": tender_markdown[:60000]},
                created_by=user,
                business_context={"project_id": task.outline.project_id} if task.outline.project_id else {},
            )
            if run.status == "succeeded":
                invalid_items = run.output_text or ""
            else:
                logger.warning(f"废标项清单提取失败：{run.error_message}")
                invalid_items = ""
        except Exception as e:
            logger.warning(f"废标项清单提取异常：{e}")
            invalid_items = ""

        task.invalid_bid_items = invalid_items
        task.save(update_fields=["invalid_bid_items", "updated_at"])

        if not invalid_items:
            raise ValueError("废标项清单提取为空，无法继续检查")

        # ===== 阶段2：第一轮分析 =====
        async_task.current_step = BidCheckTaskStatus.ANALYZING
        async_task.progress = 25
        task.status = BidCheckTaskStatus.ANALYZING
        task.save()
        async_task.save()

        analysis_result = ""
        try:
            run = ai.execute(
                scenario="bid_check_analysis",
                variables={
                    "invalid_bid_items": invalid_items,
                    "custom_check_items": task.custom_check_items,
                    "bid_content": bid_content[:60000],
                },
                created_by=user,
                business_context={"project_id": task.outline.project_id} if task.outline.project_id else {},
            )
            if run.status == "succeeded":
                analysis_result = run.output_text or ""
        except Exception as e:
            logger.warning(f"第一轮分析失败：{e}")

        if not analysis_result:
            raise ValueError("第一轮分析结果为空")

        # ===== 阶段3：第二轮检查 =====
        async_task.current_step = BidCheckTaskStatus.INSPECTING
        async_task.progress = 45
        task.status = BidCheckTaskStatus.INSPECTING
        task.save()
        async_task.save()

        draft_findings = ""
        try:
            run = ai.execute(
                scenario="bid_check_inspection",
                variables={
                    "invalid_bid_items": invalid_items,
                    "custom_check_items": task.custom_check_items,
                    "bid_content": bid_content[:60000],
                    "analysis_result": analysis_result,
                },
                created_by=user,
                business_context={"project_id": task.outline.project_id} if task.outline.project_id else {},
            )
            if run.status == "succeeded":
                draft_findings = run.output_text or ""
        except Exception as e:
            logger.warning(f"第二轮检查失败：{e}")

        if not draft_findings:
            raise ValueError("第二轮检查结果为空")

        # ===== 阶段4：第三轮定稿 =====
        async_task.current_step = BidCheckTaskStatus.FINALIZING
        async_task.progress = 75
        task.status = BidCheckTaskStatus.FINALIZING
        task.save()
        async_task.save()

        findings: list[dict] = []
        try:
            run = ai.execute(
                scenario="bid_check_final",
                variables={
                    "invalid_bid_items": invalid_items,
                    "custom_check_items": task.custom_check_items,
                    "bid_content": bid_content[:60000],
                    "analysis_result": analysis_result,
                    "draft_findings": draft_findings,
                },
                created_by=user,
                business_context={"project_id": task.outline.project_id} if task.outline.project_id else {},
            )
            if run.status == "succeeded":
                findings = (run.output_json or {}).get("findings", [])
        except Exception as e:
            logger.warning(f"第三轮定稿失败：{e}")

        # ===== 持久化 =====
        async_task.current_step = "保存检查结果"
        async_task.progress = 95
        async_task.save()

        service.persist_findings(task, findings)

        task.status = BidCheckTaskStatus.SUCCESS
        task.finished_at = timezone.now()
        task.save()

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "完成"
        async_task.result_payload = {
            "bid_check_task_id": task_id,
            "finding_count": len(findings),
            "summary": task.findings_summary,
        }
        async_task.finished_at = timezone.now()
        async_task.save()

    except Exception as e:
        logger.exception("废标检查失败")
        task.status = BidCheckTaskStatus.FAILED
        task.error_message = str(e)[:2000]
        task.finished_at = timezone.now()
        task.save()

        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise
