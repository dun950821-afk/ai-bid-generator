# backend/apps/outline/services/global_fact_workflow.py
"""全局事实变量提取 Celery 任务工作流。

严格学习 OpenBidKit globalFactsTask.cjs 五轮流程：
1. 招标文件分段提取候选 → 2. 合并去重 → 3. 知识库补充 → 4. 原方案补充 → 5. 最终整理
"""

import json
import logging

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.common.tasks_utils import soft_get_async_task
from apps.outline.constants import GlobalFactSource, GlobalFactTaskStatus
from apps.outline.models import Outline

User = get_user_model()
logger = logging.getLogger(__name__)


def _business_context(outline) -> dict:
    """把 outline 转成 PromptRun 认可的业务关联字段。

    PromptRun 只有 project / tender_file / parsed_document 三个业务 FK，
    传 outline_id 等会触发 TypeError。这里只传 project_id（+ tender_file_id 若有）。
    """
    ctx = {}
    if outline and getattr(outline, "project_id", None):
        ctx["project_id"] = outline.project_id
    tf = getattr(outline, "source_tender_file", None)
    if tf:
        ctx["tender_file_id"] = tf.id
    return ctx


def run_global_fact_extraction(*, outline_id: int, async_task_id: int, user_id: int) -> None:
    """全局事实变量提取工作流入口。

    由 Celery 任务调用，五轮流程串行执行，每轮调 AiTaskExecutionService。
    """
    from apps.generation.services.ai_task_execution_service import (
        AiTaskExecutionService,
    )
    from apps.outline.services.global_fact_service import GlobalFactService

    service = GlobalFactService()
    ai = AiTaskExecutionService()

    # AsyncTask 缺失时静默返回（任务可能已被删除）：若放 try 内查询，
    # except 块引用未赋值的 async_task 会抛 UnboundLocalError，任务仍停 PENDING
    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return

    try:
        # 查询放在 try 内：大纲/用户被删等边缘场景抛 DoesNotExist 时，
        # 走 except 回写 FAILED，而不是裸抛给 Celery 使任务永远停在 PENDING
        user = User.objects.get(pk=user_id)
        outline = Outline.objects.get(pk=outline_id)
        # ===== 第1轮：招标文件分段提取候选 =====
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = GlobalFactTaskStatus.EXTRACTING + "：读取招标文件"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        tender_segments = service.load_tender_segments(outline)
        if not tender_segments:
            raise ValueError("招标文件未解析或解析结果为空，无法提取全局事实")

        candidate_groups: list[dict] = []
        total = len(tender_segments)
        for idx, seg in enumerate(tender_segments):
            async_task.current_step = f"{GlobalFactTaskStatus.EXTRACTING}：招标文件分段 {seg['index']}/{total}"
            async_task.progress = 5 + int(35 * (idx + 1) / total)
            async_task.save()

            try:
                run = ai.execute(
                    scenario="global_fact_extract",
                    variables={
                        "segment_index": seg["index"],
                        "segment_total": seg["total"],
                        "segment_content": seg["content"],
                    },
                    created_by=user,
                    business_context=_business_context(outline),
                )
                if run.status == "succeeded":
                    seg_groups = (run.output_json or {}).get("groups", [])
                else:
                    logger.warning(f"分段 {seg['index']} 提取失败：{run.error_message}")
                    seg_groups = []
            except Exception as e:
                # 单段失败跳过，不中断整体
                logger.warning(f"分段 {seg['index']} 提取异常：{e}")
                seg_groups = []

            if seg_groups:
                candidate_groups.extend(seg_groups)

        if not candidate_groups:
            raise ValueError("所有分段提取均未返回候选事实变量")

        # ===== 第2轮：合并去重 =====
        async_task.current_step = GlobalFactTaskStatus.MERGING
        async_task.progress = 45
        async_task.save()

        merged_groups = _merge_groups(ai, [], candidate_groups, outline, user)

        # ===== 第3轮：知识库补充 =====
        async_task.current_step = GlobalFactTaskStatus.SUPPLEMENTING + "：知识库"
        async_task.progress = 55
        async_task.save()

        knowledge_segments = service.load_knowledge_segments(outline)
        if knowledge_segments:
            merged_groups = _supplement_groups(
                ai, merged_groups, knowledge_segments,
                source_label="知识库", outline=outline, user=user,
            )

        # ===== 第4轮：原方案补充 =====
        async_task.current_step = GlobalFactTaskStatus.SUPPLEMENTING + "：原方案"
        async_task.progress = 75
        async_task.save()

        original_segments = service.load_original_plan_segments(outline)
        if original_segments:
            merged_groups = _supplement_groups(
                ai, merged_groups, original_segments,
                source_label="原方案", outline=outline, user=user,
            )

        # ===== 第5轮：最终整理 =====
        async_task.current_step = GlobalFactTaskStatus.FINALIZING
        async_task.progress = 88
        async_task.save()

        finalized_groups = _finalize_groups(ai, merged_groups, outline, user)

        # ===== 持久化 =====
        async_task.current_step = "保存事实变量"
        async_task.progress = 95
        async_task.save()

        service.persist_facts(outline_id, finalized_groups, source=GlobalFactSource.TENDER)

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "完成"
        async_task.result_payload = {
            "outline_id": outline_id,
            "fact_count": len(finalized_groups),
        }
        async_task.finished_at = timezone.now()
        async_task.save()

    except Exception as e:
        logger.exception("全局事实提取失败")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


# ----------------------------------------------------------------------
# 五轮内部实现
# ----------------------------------------------------------------------

def _merge_groups(ai, existing: list[dict], candidates: list[dict], outline, user) -> list[dict]:
    """第2轮：合并去重。"""
    try:
        run = ai.execute(
            scenario="global_fact_merge",
            variables={
                "existing_groups_json": json.dumps(existing, ensure_ascii=False),
                "candidate_groups_json": json.dumps(candidates, ensure_ascii=False),
            },
            created_by=user,
            business_context=_business_context(outline),
        )
        if run.status == "succeeded":
            return (run.output_json or {}).get("groups", [])
    except Exception as e:
        logger.warning(f"合并轮失败，回退到候选直接拼接：{e}")
    # 兜底：简单按 key 去重
    return _dedupe_by_key(candidates)


def _supplement_groups(ai, current: list[dict], segments: list[dict], *, source_label: str, outline, user) -> list[dict]:
    """第3/4轮：分段补充。"""
    total = len(segments)
    for idx, seg in enumerate(segments):
        try:
            run = ai.execute(
                scenario="global_fact_supplement",
                variables={
                    "current_groups_json": json.dumps(current, ensure_ascii=False),
                    "supplement_content": seg["content"],
                    "source_label": source_label,
                    "segment_index": seg["index"],
                    "segment_total": seg["total"],
                },
                created_by=user,
                business_context=_business_context(outline),
            )
            if run.status == "succeeded":
                current = (run.output_json or {}).get("groups", current)
        except Exception as e:
            logger.warning(f"{source_label}补充分段 {seg['index']} 失败：{e}")
    return current


def _finalize_groups(ai, groups: list[dict], outline, user) -> list[dict]:
    """第5轮：最终整理。失败兜底返回输入。"""
    try:
        run = ai.execute(
            scenario="global_fact_finalize",
            variables={
                "groups_json": json.dumps(groups, ensure_ascii=False),
            },
            created_by=user,
            business_context=_business_context(outline),
        )
        if run.status == "succeeded":
            finalized = (run.output_json or {}).get("groups", [])
            if finalized:
                return finalized
    except Exception as e:
        logger.warning(f"最终整理失败，保留合并结果：{e}")
    return groups


def _dedupe_by_key(groups: list[dict]) -> list[dict]:
    """简单按 key 去重（合并轮 AI 失败的兜底）。"""
    seen: dict[str, dict] = {}
    for g in groups:
        key = g.get("key") or g.get("title", "").lower().replace(" ", "_")
        if key not in seen:
            seen[key] = g
        else:
            # content 取更长的
            if len(g.get("content", "")) > len(seen[key].get("content", "")):
                seen[key] = g
    return list(seen.values())
