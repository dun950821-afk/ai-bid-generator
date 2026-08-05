# backend/apps/outline/tasks.py
"""大纲模块 Celery 任务。"""

import logging
from celery import shared_task, group, chord
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.common.tasks_utils import soft_get_async_task, close_old_connections_safely
from apps.outline.constants import (
    ContentGenerationStatus,
    GenerationRecordStatus,
    OutlineSource,
    OutlineStatus,
    SectionGenerationStatus,
    SectionStatus,
    SectionVersionSource,
)
from apps.outline.models import (
    BatchGenerationTaskItem,
    GenerationTask,
    Outline,
    Section,
    SectionVersion,
    SectionGenerationRecord,
)
from apps.outline.services.section_generation_service import SectionGenerationService

User = get_user_model()
logger = logging.getLogger(__name__)

@shared_task(bind=True)
def extract_global_facts_task(self, outline_id: int, async_task_id: int, user_id: int):
    """全局事实变量提取任务（借鉴 OpenBidKit globalFactsTask）。

    五轮流程：招标文件分段提取 → 合并去重 → 知识库补充 → 原方案补充 → 最终整理。
    进度与状态写入 AsyncTask，调用方轮询。
    """
    from apps.outline.services.global_fact_workflow import run_global_fact_extraction

    run_global_fact_extraction(
        outline_id=outline_id,
        async_task_id=async_task_id,
        user_id=user_id,
    )


@shared_task(bind=True)
def refine_outline_task(self, outline_id: int, async_task_id: int, user_id: int):
    """按审核建议完善目录（异步）。

    用 outline.review_suggestions 重跑生成+审核，生成新旧目录 diff。
    diff 存入 AsyncTask.result_payload 供前端预览确认。
    """
    from apps.outline.services.outline_review_service import OutlineReviewService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)
    outline = Outline.objects.get(pk=outline_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "完善目录：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        def progress_cb(progress, step):
            async_task.progress = progress
            async_task.current_step = step
            async_task.save(update_fields=["progress", "current_step"])

        result = OutlineReviewService().refine_with_suggestions(
            outline, user, progress_callback=progress_cb,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "完善目录：完成"
        async_task.result_payload = {
            "outline_id": outline_id,
            "added": result["added"],
            "removed": result["removed"],
            "new_tree": result["new_tree"],
            "review": result["review"],
        }
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("refine_outline failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def consistency_audit_task(self, outline_id: int, async_task_id: int, user_id: int):
    """一致性审计任务（借鉴 OpenBidKit auditing 阶段）。

    按一级目录分组调 AI 审计正文与事实冲突，进度写入 AsyncTask。
    """
    from apps.outline.services.consistency_audit_service import ConsistencyAuditService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "一致性审计：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = ConsistencyAuditService().run_audit(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "一致性审计：完成"
        async_task.result_payload = {
            "outline_id": outline_id,
            "total_groups": result["total_groups"],
            "total_conflicts": result["total_conflicts"],
            "by_severity": result["by_severity"],
        }
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("consistency_audit failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def consistency_repair_task(self, outline_id: int, async_task_id: int, user_id: int):
    """一致性批量修复任务：遍历有未解决冲突的章节逐个修复。"""
    from apps.outline.services.consistency_audit_service import ConsistencyAuditService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "一致性修复：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        ConsistencyAuditService().run_batch_repair(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "一致性修复：完成"
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("consistency_repair failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def generate_section_task(
    self,
    section_id: int,
    record_id: int,
    analysis_result: dict,
    user_prompt: str,
    user_id: int,
):
    """单章节生成任务。

    注意：任务参数不传递大段上下文正文，
    具体上下文在任务内部通过 prepare_generation_context 重新构建。
    """
    from apps.outline.services.section_generation_service import SectionGenerationService
    from apps.outline.services.generation_context_service import GenerationContextService
    from apps.outline.services.generation_result_parser import GenerationResultParser
    from apps.outline.services.generation_quality_service import GenerationQualityService
    from apps.outline.services.content_postprocessor import ContentPostProcessor
    from apps.outline.services.content_revision_service import ContentRevisionService

    try:
        section = Section.objects.get(pk=section_id)
        record = SectionGenerationRecord.objects.get(pk=record_id)
        user = User.objects.get(pk=user_id)

        # 更新状态
        section.generation_status = SectionGenerationStatus.RUNNING
        section.save()
        record.status = GenerationRecordStatus.RUNNING
        record.save()

        # 1. 准备生成上下文（含 RAG 检索 + rag_sources 溯源 + retrieval_meta）
        prepared = SectionGenerationService().prepare_generation_context(
            section_id=section_id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=user_id,
        )
        context_service = GenerationContextService()
        # prepared 已含 build_generation_context 的产物，直接使用
        context = {
            "current_section": prepared["section_info"],
            "content_matrix": prepared["content_matrix"],
            "analysis_points": prepared["analysis_points"],
            "rag_materials": prepared["rag_materials"],
            "context_sections": prepared["context_sections"],
            "outline_structure": prepared["outline_structure"],
            "project_info": prepared["project_info"],
            "generation_mode": prepared.get("generation_mode", "leaf_content"),
            "content_structure_policy": prepared.get("content_structure_policy"),
        }

        # 1.5 编排决策（借鉴 OpenBidKit buildChapterContentPlanMessages）
        # 正文生成前先做编排决策（若 content_plan 为空），失败回退默认 plan 不阻断。
        try:
            if not section.content_plan:
                SectionGenerationService().plan_section_content(section_id, user)
                section.refresh_from_db()
        except Exception as plan_err:
            logger.warning(f"Section content plan failed (non-blocking): {plan_err}")

        # 解析全局事实变量（依据编排决策的 facts.titles）
        selected_facts = SectionGenerationService().resolve_selected_facts(section)

        # 2. 构建提示词变量
        prompt_context = prepared["prompt_context"]

        section_variables = {
            "current_section": context.get("current_section", {}),
            "content_matrix": context.get("content_matrix", {}),
            "generation_mode": context.get("generation_mode", "leaf_content"),
            "global_forbidden_rules": context.get("global_forbidden_rules", ""),
            "strict_generation_rules": context.get("strict_generation_rules", ""),
            "analysis_points": context.get("analysis_points", {}),
            "writing_template": context.get("writing_template") or {},
            "rag_materials": context.get("rag_materials", {}),
            "context_sections": context.get("context_sections", {}),
            "outline_structure": context.get("outline_structure", ""),
            "project_info": context.get("project_info", {}),
            "user_prompt": user_prompt,
            "prompt_context": prompt_context,
            # 反 AI 味增强版 prompt 变量
            "content_plan": section.content_plan or {},
            "selected_facts": selected_facts,
            "knowledge_contents": [],  # 由 rag_materials 转换，可后续填充
            "table_allowed_instruction": "可以使用 Markdown 段落、列表和表格；表格必须服务于内容表达，不要为了形式硬插。" if (section.content_plan or {}).get("table", {}).get("needed") else "只能使用 Markdown 段落、普通列表和加粗引导语，严禁输出 Markdown 表格或 HTML 表格。",
            "table_cell_instruction": "表格单元格内如有多项内容，优先使用编号、顿号、分号或短句，不要使用 HTML <br> 标签。" if (section.content_plan or {}).get("table", {}).get("needed") else "如需表达多项参数、职责、流程或措施，请改用分段文字或普通列表，不要用表格模拟。",
        }

        # 4. 调用 AI 生成
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
        )

        prompt_run = AiTaskExecutionService().execute(
            scenario="section_content_generation",
            variables=section_variables,
            created_by=user,
            business_context={"project_id": section.outline.project_id} if section.outline.project_id else {},
        )

        if prompt_run.status != "succeeded":
            raise Exception(prompt_run.error_message or "AI 生成失败")

        # 5. 解析 LLM 输出
        raw_output = prompt_run.output_text or ""
        parser = GenerationResultParser()
        result = parser.parse(raw_output)

        # 如果 output_json 存在且有效，优先使用
        if prompt_run.output_json and isinstance(prompt_run.output_json, dict):
            if prompt_run.output_json.get("content"):
                result = parser.parse(
                    __import__("json").dumps(prompt_run.output_json)
                )

        # 6. 后处理（清理格式问题）
        postprocessor = ContentPostProcessor()
        generation_mode = context.get("generation_mode", "leaf_content")
        post_result = postprocessor.process(result.get("content", ""), generation_mode)
        result["content"] = post_result["content"]
        result["postprocess_report"] = post_result["report"]

        # 7. 运行质量校验
        quality_service = GenerationQualityService()
        quality_report = quality_service.run_all_checks(context, result)

        # 8. 自动修订流程
        revision_count = 0
        revision_report = None
        final_status = quality_report.get("final_status", "warning")

        if final_status == "fail":
            revision_service = ContentRevisionService()
            if revision_service.can_revise(quality_report, revision_count):
                logger.info(f"Attempting auto-revision for section {section_id}")
                revision_result = revision_service.execute_revision(
                    section=section,
                    content=result.get("content", ""),
                    quality_report=quality_report,
                    context=context,
                )

                if revision_result["success"]:
                    result["content"] = revision_result["revised_content"]
                    result["revision_count"] = 1
                    revision_report = revision_result["revision_report"]
                    quality_report = revision_result["revision_report"].get("quality_report", quality_report)
                    final_status = quality_report.get("final_status", "warning")
                    revision_count = 1
                    logger.info(f"Auto-revision successful for section {section_id}")
                else:
                    revision_report = revision_result["revision_report"]
                    logger.warning(f"Auto-revision failed for section {section_id}: {revision_report.get('error')}")

        # 9. 保存内容（事务内）
        with transaction.atomic():
            section = Section.objects.select_for_update().get(pk=section_id)

            # 记录生成上下文元数据
            generation_meta = {
                "used_analysis_point_ids": result.get("used_analysis_point_ids", []),
                "used_rag_material_ids": result.get("used_rag_material_ids", []),
                "missing_info": result.get("missing_info", []),
                "risk_flags": result.get("risk_flags", []),
                "quality_report": quality_report,
                "postprocess_report": result.get("postprocess_report", {}),
                "revision_count": revision_count,
                "revision_report": revision_report,
                "parse_success": result.get("parse_success", True),
                "generation_mode": generation_mode,
                "context_strategy": context.get("context_strategy", ""),
                "template_key": context.get("writing_template", {}).get("template_key", ""),
                "rag_channels": list(context.get("rag_materials", {}).keys()),
                "context_stats": {
                    "analysis_point_count": len(
                        context.get("analysis_points", {}).get("all_matched", [])
                    ),
                    "rag_material_count": sum(
                        len(items)
                        for items in context.get("rag_materials", {}).values()
                    ),
                    "no_duplicate_count": len(
                        context.get("context_sections", {}).get(
                            "no_duplicate_sections", []
                        )
                    ),
                },
            }

            # 如果质量校验仍为 fail，不覆盖原正文
            if final_status == "fail":
                section.content_generation_status = ContentGenerationStatus.FAILED
                section.content_generation_error = "生成内容未通过质量校验，未覆盖原正文"
                generation_meta["failed_content_preview"] = result.get("content", "")[:3000]
                section.content_generation_meta = generation_meta
                section.generation_status = SectionGenerationStatus.FAILED
                section.save(update_fields=[
                    "content_generation_status",
                    "content_generation_error",
                    "content_generation_meta",
                    "generation_status",
                ])

                # 更新记录
                record.output_summary = {
                    "word_count": result.get("word_count", 0),
                    "quality_status": final_status,
                    "parse_success": result.get("parse_success", True),
                    "revision_count": revision_count,
                    "reason": "质量校验失败，未保存正文",
                }
                record.status = GenerationRecordStatus.FAILED
                record.error_message = "生成内容未通过质量校验"
                record.finished_at = timezone.now()
                record.save()

                logger.warning(
                    f"Section {section_id} generation failed quality check: "
                    f"status={final_status}, mode={generation_mode}"
                )
                return

            # 质量校验 pass 或 warning，保存正文
            section.content = result["content"]
            section.word_count = result.get("word_count", len(result["content"]))
            section.content_summary = result.get("summary", "")
            section.content_word_count = result.get("word_count", len(result["content"]))
            section.content_generation_status = ContentGenerationStatus.SUCCESS
            section.content_generated_at = timezone.now()
            section.content_generation_meta = generation_meta
            section.generation_status = SectionGenerationStatus.SUCCESS
            section.status = SectionStatus.GENERATED
            section.save()

            # 创建版本
            max_version = (
                SectionVersion.objects.filter(section=section)
                .aggregate(max_version=Max("version_no"))["max_version"]
                or 0
            )
            SectionVersion.objects.create(
                section=section,
                content=result["content"],
                version_no=max_version + 1,
                source=SectionVersionSource.AI,
                word_count=result.get("word_count", len(result["content"])),
                created_by=user,
            )

        # 10. 更新记录
        record.prompt_run = prompt_run
        record.prompt_template_id = prompt_run.prompt_template_id
        record.prompt_version = (
            prompt_run.prompt_version.version if prompt_run.prompt_version else ""
        )
        record.llm_model = (
            prompt_run.model_config.display_name if prompt_run.model_config else ""
        )
        record.output_summary = {
            "word_count": result.get("word_count", len(result["content"])),
            "quality_status": quality_report.get("final_status"),
            "parse_success": result.get("parse_success", True),
            "revision_count": revision_count,
        }
        # 落库 RAG 来源与检索 trace
        record.rag_sources = prepared.get("rag_sources", [])
        record.generation_meta = {
            **(record.generation_meta or {}),
            "retrieval": prepared.get("retrieval_meta", {}),
            "generation_mode": prepared.get("generation_mode"),
            "content_structure_policy": prepared.get("content_structure_policy"),
        }
        record.status = GenerationRecordStatus.SUCCESS
        record.finished_at = timezone.now()
        record.save()

    except Exception as e:
        logger.exception(f"Section generation failed: section_id={section_id}")

        section = Section.objects.get(pk=section_id)
        section.generation_status = SectionGenerationStatus.FAILED
        section.content_generation_status = "failed"
        section.content_generation_error = str(e)[:500]
        section.save()

        record = SectionGenerationRecord.objects.get(pk=record_id)
        record.status = GenerationRecordStatus.FAILED
        record.error_message = str(e)[:2000]
        record.finished_at = timezone.now()
        record.save()

        # 更新 AsyncTask 状态（record 可能为陈旧数据，task 找不到时跳过）
        async_task = soft_get_async_task(record.async_task_id)
        if async_task is not None:
            async_task.status = "failed"
            async_task.error_message = str(e)[:2000]
            async_task.finished_at = timezone.now()
            async_task.save()

        raise


@shared_task(bind=True)
def batch_section_generation_task(self, task_id: int):
    """批量正文生成任务（group/chord 并发版）。

    流程：
    1. 收集所有 pending 章节 ID
    2. group(generate_single_section_for_batch.s(sid, task_id) for sid in ids) 并发
    3. chord(group)(on_batch_complete.s(task_id)) 全部完成后回调

    注意：子任务 generate_single_section_for_batch 内部捕获所有异常
    （失败写入 BatchGenerationTaskItem），保证 chord 回调始终执行。
    """
    from apps.outline.constants import GenerationTaskStatus
    from apps.outline.models import GenerationTask

    try:
        try:
            task = GenerationTask.objects.get(pk=task_id)
        except GenerationTask.DoesNotExist:
            logger.error(f"Batch task {task_id} not found")
            return

        # 检查取消请求
        task.refresh_from_db()
        if task.status == GenerationTaskStatus.CANCEL_REQUESTED:
            BatchGenerationTaskItem.objects.filter(
                task=task, status__in=["pending", "running"],
            ).update(status="cancelled")
            task.status = GenerationTaskStatus.CANCELLED
            task.finished_at = timezone.now()
            task.save()
            return

        if task.status != GenerationTaskStatus.RUNNING:
            logger.warning(f"Batch task {task_id} has unexpected status {task.status}")
            return

        # 收集 pending 章节 ID
        pending_items = list(
            BatchGenerationTaskItem.objects.filter(task=task, status="pending").order_by("sort_index")
        )
        if not pending_items:
            _finalize_batch_task(task)
            return

        section_ids = [item.section_id for item in pending_items]
        logger.info(f"Batch task {task_id} dispatching {len(section_ids)} sections via group/chord")

        # group/chord 并发派发
        header = group(
            generate_single_section_for_batch.s(sid, task_id) for sid in section_ids
        )
        callback = on_batch_complete.s(task_id)
        try:
            chord(header)(callback)
        except Exception as e:
            # 派发失败（如 broker 不可用）：子任务未执行，需收尾避免任务卡死
            logger.exception(f"Batch task {task_id} chord dispatch failed")
            BatchGenerationTaskItem.objects.filter(
                task=task, status="pending",
            ).update(
                status="failed",
                error_message=f"任务派发失败: {str(e)[:500]}",
                finished_at=timezone.now(),
            )
            task.status = GenerationTaskStatus.FAILED
            task.error_message = f"任务派发失败: {str(e)[:2000]}"
            task.finished_at = timezone.now()
            task.save()
    finally:
        # worker 长驻，主动归还本任务周期内的空闲连接
        close_old_connections_safely()


def _mark_batch_item_failed(task_id: int, section_id: int, error: str) -> None:
    """将批量生成子项标记为失败并刷新任务失败计数（供子任务异常路径复用）。"""
    BatchGenerationTaskItem.objects.filter(task_id=task_id, section_id=section_id).update(
        status="failed", error_message=error[:2000], finished_at=timezone.now(),
    )
    GenerationTask.objects.filter(pk=task_id).update(
        failed_count=BatchGenerationTaskItem.objects.filter(
            task_id=task_id, status="failed"
        ).count(),
    )


@shared_task(bind=True)
def generate_single_section_for_batch(self, section_id: int, task_id: int):
    """单个章节生成（并发子任务）。

    复用 _execute_single_section_generation，更新 BatchGenerationTaskItem 状态。
    单章失败不阻断其他。

    可靠性设计：
    - 捕获所有异常并写入子项状态，绝不向 chord 抛出，保证 on_batch_complete
      回调始终执行；
    - 瞬时数据库错误（OperationalError/InterfaceError）自动重试，
      最多 BATCH_SECTION_MAX_RETRIES 次，重试次数记入 item.retry_count；
    - 任务开始/结束时调用 close_old_connections，避免并发 worker 占用
      失效的数据库连接。
    """
    from django.db.utils import InterfaceError, OperationalError

    from apps.outline.constants import GenerationTaskStatus
    from apps.outline.models import GenerationTask

    close_old_connections_safely()

    try:
        task = GenerationTask.objects.filter(pk=task_id).first()
        if task is None:
            # 任务已被删除：直接返回（不抛异常，避免 chord 回调不执行）
            logger.error(
                f"generate_single_section_for_batch: task {task_id} not found, "
                f"skip section {section_id}"
            )
            return

        try:
            item = BatchGenerationTaskItem.objects.filter(task=task, section_id=section_id).first()
            if not item:
                logger.warning(f"TaskItem not found: task={task_id}, section={section_id}")
                return

            item.status = "running"
            item.started_at = timezone.now()
            item.save(update_fields=["status", "started_at"])

            GenerationTask.objects.filter(pk=task_id).update(
                current_section_id=section_id,
                current_section_title=item.section.title,
            )

            section = Section.objects.get(pk=section_id)
            user = User.objects.get(pk=task.created_by_id)

            async_task = AsyncTask.objects.create(
                task_type="section_generate",
                related_object_type="Section",
                related_object_id=str(section_id),
                input_payload={"section_id": section_id, "batch_task_id": task_id},
                created_by=user,
            )
            record = SectionGenerationRecord.objects.create(
                section=section,
                async_task=async_task,
                input_summary={"batch_task_id": task_id, "sort_index": item.sort_index},
                status=GenerationRecordStatus.PENDING,
                created_by=user,
            )

            gen_result = _execute_single_section_generation(
                section_id=section_id,
                record_id=record.id,
                user_id=user.id,
                user_prompt=section.user_prompt or task.params.get("user_prompt_default", "") if task.params else "",
            )

            item.refresh_from_db()
            if gen_result.get("success"):
                item.status = "success"
                item.finished_at = timezone.now()
                item.word_count = gen_result.get("word_count", section.content_word_count or 0)
                item.save(update_fields=["status", "finished_at", "word_count"])
                GenerationTask.objects.filter(pk=task_id).update(
                    success_count=BatchGenerationTaskItem.objects.filter(task=task, status="success").count(),
                )
            else:
                item.status = "failed"
                item.error_message = (gen_result.get("error") or "未知错误")[:2000]
                item.finished_at = timezone.now()
                item.save(update_fields=["status", "error_message", "finished_at"])
                GenerationTask.objects.filter(pk=task_id).update(
                    failed_count=BatchGenerationTaskItem.objects.filter(task=task, status="failed").count(),
                )

        except (OperationalError, InterfaceError) as e:
            # 瞬时数据库错误：有限次自动重试（指数退避），重试后仍失败则标记失败
            logger.warning(
                f"Transient DB error in batch section generation: "
                f"section={section_id}, task={task_id}, retries={self.request.retries}: {e}"
            )
            from apps.task_queue.services.config_service import get_task_config

            max_retries = get_task_config("batch_section_max_retries")
            if self.request.retries < max_retries:
                try:
                    BatchGenerationTaskItem.objects.filter(
                        task_id=task_id, section_id=section_id,
                        status__in=["pending", "running"],
                    ).update(
                        status="pending",
                        retry_count=F("retry_count") + 1,
                    )
                except Exception:
                    logger.exception(
                        f"Failed to bump retry_count: section={section_id}, task={task_id}"
                    )
                raise self.retry(exc=e, countdown=5 * (self.request.retries + 1))
            logger.error(
                f"Batch section generation DB retries exhausted: "
                f"section={section_id}, task={task_id}"
            )
            _mark_batch_item_failed(
                task_id, section_id,
                f"数据库连接错误（自动重试 {max_retries} 次后仍失败）: {e}",
            )

        except Exception as e:
            logger.exception(f"generate_single_section_for_batch failed: section={section_id}")
            _mark_batch_item_failed(task_id, section_id, str(e))
    finally:
        close_old_connections_safely()


@shared_task
def on_batch_complete(results, task_id: int):
    """chord 回调：全部子任务完成后收尾。

    1. 调 _finalize_batch_task（已含一致性审计触发）
    2. 触发字数不足扩写

    可靠性设计：
    - 整体 try/except，回调自身异常不外抛（避免 chord 结果污染 worker）；
    - _finalize_batch_task 失败时把任务标记为 FAILED，而不是卡在 RUNNING；
    - 开始/结束时 close_old_connections，归还失效连接。
    """
    from apps.outline.constants import GenerationTaskStatus
    from apps.outline.services.section_expand_service import SectionExpandService

    close_old_connections_safely()

    try:
        # 子任务异常结果防御性日志（正常情况子任务不抛异常，results 为返回值列表）
        if results:
            abnormal = [r for r in results if isinstance(r, Exception)]
            if abnormal:
                logger.warning(
                    f"on_batch_complete: task {task_id} got {len(abnormal)} "
                    f"abnormal subtask result(s): {abnormal[:3]}"
                )

        try:
            task = GenerationTask.objects.get(pk=task_id)
        except GenerationTask.DoesNotExist:
            logger.error(f"on_batch_complete: task {task_id} not found")
            return

        # 1. 收尾批量任务状态 + 触发一致性审计
        try:
            _finalize_batch_task(task)
        except Exception as e:
            logger.exception(f"on_batch_complete: finalize failed for task {task_id}")
            task.status = GenerationTaskStatus.FAILED
            task.error_message = f"批量任务收尾失败: {str(e)[:1800]}"
            task.finished_at = timezone.now()
            task.save()
            return
    except Exception:
        logger.exception(f"on_batch_complete failed unexpectedly: task_id={task_id}")
        return
    finally:
        close_old_connections_safely()

    # 2. 触发字数不足扩写（仅批量成功/部分成功时）
    task.refresh_from_db()
    if task.status in [GenerationTaskStatus.COMPLETED, GenerationTaskStatus.PARTIAL_SUCCESS]:
        try:
            from django.conf import settings
            minimum_words = getattr(settings, "MIN_SECTION_WORDS", 500)
            expand_async = AsyncTask.objects.create(
                task_type="section_expand",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            from apps.common.tasks_utils import dispatch_async_task

            dispatch_async_task(
                expand_async, expand_sections_task,
                task.outline_id, minimum_words, expand_async.id, task.created_by_id,
            )
        except Exception as e:
            logger.warning(f"Failed to trigger section expand for outline {task.outline_id}: {e}")

        # 3. 触发表格清理（批量，mermaid/image 之前；清理低质量表格避免配图误用）
        try:
            table_async = AsyncTask.objects.create(
                task_type="table_cleanup_outline",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            from apps.common.tasks_utils import dispatch_async_task

            dispatch_async_task(
                table_async, table_cleanup_outline_task,
                task.outline_id, table_async.id, task.created_by_id,
            )
        except Exception as e:
            logger.warning(f"Failed to trigger table_cleanup_outline for outline {task.outline_id}: {e}")

        # 4. 触发 Mermaid 配图（P3 新增，失败不阻断后续）
        try:
            mermaid_async = AsyncTask.objects.create(
                task_type="mermaid_illustration",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            from apps.common.tasks_utils import dispatch_async_task

            dispatch_async_task(
                mermaid_async, mermaid_illustration_task,
                task.outline_id, mermaid_async.id, task.created_by_id,
            )
        except Exception as e:
            logger.warning(f"Failed to trigger mermaid_illustration for outline {task.outline_id}: {e}")

        # 5. 触发 AI 生图（P3 新增，失败不阻断）
        try:
            image_async = AsyncTask.objects.create(
                task_type="image_generation",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            from apps.common.tasks_utils import dispatch_async_task

            dispatch_async_task(
                image_async, image_generation_task,
                task.outline_id, image_async.id, task.created_by_id,
            )
        except Exception as e:
            logger.warning(f"Failed to trigger image_generation for outline {task.outline_id}: {e}")


@shared_task(bind=True)
def table_cleanup_task(self, section_id: int, async_task_id: int, user_id: int):
    """单章表格清理任务（手动触发）。

    逐表调 AI 判断 keep/convert，convert 的替换为文字描述。
    """
    from apps.outline.services.table_cleanup_service import TableCleanupService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "表格清理：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = TableCleanupService().cleanup_section(section_id, user, async_task=async_task)

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "表格清理：完成"
        async_task.result_payload = result
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("table_cleanup_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def table_cleanup_outline_task(self, outline_id: int, async_task_id: int, user_id: int):
    """大纲级表格清理批量任务（自动触发）。

    遍历所有正文含 Markdown 表格的章节，逐章调 TableCleanupService.cleanup_section。
    单章失败跳过不阻断其他章节。
    """
    from apps.outline.services.table_cleanup_service import TableCleanupService
    import re

    TABLE_PATTERN = re.compile(r"(?:^[ \t]*\|[^\n]+\|[ \t]*\n)(?:[ \t]*\|[\s:|-]+?\|[ \t]*\n)(?:[ \t]*\|[^\n]+\|[ \t]*\n)+", re.MULTILINE)

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "表格清理：筛选含表格章节"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        sections = list(
            Section.objects.filter(outline_id=outline_id).exclude(content="").order_by("sort_order", "id")
        )
        target_sections = [s for s in sections if TABLE_PATTERN.search(s.content or "")]
        total = len(target_sections)

        if total == 0:
            async_task.status = AsyncTask.STATUS_SUCCESS
            async_task.progress = 100
            async_task.current_step = "表格清理：无表格需处理"
            async_task.result_payload = {
                "outline_id": outline_id, "total": 0, "processed": 0,
                "converted": 0, "section_details": [],
            }
            async_task.finished_at = timezone.now()
            async_task.save()
            return

        service = TableCleanupService()
        processed = 0
        converted_total = 0
        section_details = []
        for idx, section in enumerate(target_sections):
            async_task.progress = int(10 + 85 * idx / total)
            async_task.current_step = f"表格清理：章节 {idx + 1}/{total}"
            async_task.save(update_fields=["progress", "current_step"])
            try:
                result = service.cleanup_section(section.id, user)
                processed += 1
                converted_total += result.get("converted", 0)
                if result.get("converted", 0) > 0 or result.get("total_tables", 0) > 0:
                    section_details.append({
                        "section_id": section.id,
                        "section_title": section.title,
                        "total_tables": result.get("total_tables", 0),
                        "converted": result.get("converted", 0),
                        "kept": result.get("kept", 0),
                    })
            except Exception as e:
                logger.warning(f"table_cleanup_outline section {section.id} failed: {e}")

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "表格清理：完成"
        async_task.result_payload = {
            "outline_id": outline_id,
            "total": total,
            "processed": processed,
            "converted": converted_total,
            "section_details": section_details,
        }
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("table_cleanup_outline_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def outline_expand_task(self, outline_id: int, target_total_words: int, async_task_id: int, user_id: int):
    """大纲级字数补目录任务（手动触发）。

    AI 补二三四级子目录扩展生成空间，不删现有目录，不自动生成正文。
    """
    from apps.outline.services.outline_expand_service import OutlineExpandService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "字数补目录：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = OutlineExpandService().expand_outline(
            outline_id, target_total_words, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "字数补目录：完成"
        async_task.result_payload = result
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("outline_expand_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def mermaid_illustration_task(self, outline_id: int, async_task_id: int, user_id: int):
    """Mermaid 配图任务（批量后自动 + 手动重新触发）。

    扫描 content_plan.mermaid.needed=true 章节统一生成 Mermaid 代码，
    调 mermaid.ink 渲染校验，失败修复 1 次。
    """
    from apps.outline.services.mermaid_illustration_service import MermaidIllustrationService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "Mermaid 配图：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = MermaidIllustrationService().run_illustration(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "Mermaid 配图：完成"
        async_task.result_payload = result
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("mermaid_illustration_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def image_generation_task(self, outline_id: int, async_task_id: int, user_id: int):
    """AI 生图任务（批量后自动 + 手动重新触发）。

    扫描 content_plan.image.needed=true 章节统一处理。
    配置了 IMAGE_GEN_MODEL 则生图存 MinIO+嵌入，否则只生成 prompt。
    """
    from apps.outline.services.image_generation_service import ImageGenerationService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "AI 生图：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = ImageGenerationService().run_generation(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "AI 生图：完成"
        async_task.result_payload = result
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("image_generation_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def expand_sections_task(self, outline_id: int, minimum_words: int, async_task_id: int, user_id: int):
    """字数不足扩写任务。

    多轮扩写字数不足的章节，进度写入 AsyncTask。
    """
    from apps.outline.services.section_expand_service import SectionExpandService

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "字数不足扩写：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = SectionExpandService().run_expand(
            outline_id, minimum_words, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "字数不足扩写：完成"
        async_task.result_payload = {
            "outline_id": outline_id,
            "total": result["total"],
            "expanded": result["expanded"],
            "skipped": result["skipped"],
            "rounds": result["rounds"],
            "details": result["details"],
        }
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("expand_sections_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


def _finalize_batch_task(task: "GenerationTask"):
    """完成批量任务状态更新。"""
    from apps.outline.constants import GenerationTaskStatus

    # 统计各状态数量
    success_count = BatchGenerationTaskItem.objects.filter(
        task=task, status="success"
    ).count()
    failed_count = BatchGenerationTaskItem.objects.filter(
        task=task, status="failed"
    ).count()
    skipped_count = BatchGenerationTaskItem.objects.filter(
        task=task, status="skipped"
    ).count()
    cancelled_count = BatchGenerationTaskItem.objects.filter(
        task=task, status="cancelled"
    ).count()

    task.success_count = success_count
    task.failed_count = failed_count
    task.skipped_count = skipped_count

    # 确定最终状态
    if task.status in [
        GenerationTaskStatus.PAUSE_REQUESTED,
        GenerationTaskStatus.PAUSED,
        GenerationTaskStatus.CANCEL_REQUESTED,
        GenerationTaskStatus.CANCELLED,
    ]:
        # 已经是暂停/取消状态，不更新
        return

    if failed_count == 0 and skipped_count == 0 and cancelled_count == 0:
        task.status = GenerationTaskStatus.COMPLETED
    elif success_count == 0:
        task.status = GenerationTaskStatus.FAILED
    else:
        task.status = GenerationTaskStatus.PARTIAL_SUCCESS

    task.finished_at = timezone.now()
    task.save()

    logger.info(f"Batch task {task.id} finalized with status {task.status}")

    # 批量生成完成后自动触发一致性审计（独立任务，失败不影响批量任务状态）
    if task.status in [GenerationTaskStatus.COMPLETED, GenerationTaskStatus.PARTIAL_SUCCESS]:
        try:
            from apps.outline.tasks import consistency_audit_task
            audit_task = AsyncTask.objects.create(
                task_type="consistency_audit",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            from apps.common.tasks_utils import dispatch_async_task

            dispatch_async_task(audit_task, consistency_audit_task, task.outline_id, audit_task.id, task.created_by_id)
        except Exception as e:
            logger.warning(f"Failed to trigger consistency audit for outline {task.outline_id}: {e}")


def _execute_single_section_generation(
    section_id: int,
    record_id: int,
    user_id: int,
    user_prompt: str,
) -> dict:
    """执行单章节生成（同步版本，供批量任务调用）。

    Returns:
        {"success": bool, "quality_failed": bool, "error": str}

    Raises:
        Exception: 生成过程中发生不可恢复的错误
    """
    from apps.outline.services.section_generation_service import SectionGenerationService
    from apps.outline.services.generation_context_service import GenerationContextService
    from apps.outline.services.generation_result_parser import GenerationResultParser
    from apps.outline.services.generation_quality_service import GenerationQualityService
    from apps.outline.services.content_postprocessor import ContentPostProcessor
    from apps.outline.services.content_revision_service import ContentRevisionService

    section = Section.objects.get(pk=section_id)
    record = SectionGenerationRecord.objects.get(pk=record_id)
    user = User.objects.get(pk=user_id)

    # 更新状态
    section.generation_status = SectionGenerationStatus.RUNNING
    section.save()
    record.status = GenerationRecordStatus.RUNNING
    record.save()

    # 1. 准备生成上下文（含 RAG 检索 + rag_sources 溯源 + retrieval_meta）
    prepared = SectionGenerationService().prepare_generation_context(
        section_id=section_id,
        analysis_result={},
        user_prompt=user_prompt,
        user_id=user_id,
    )
    context_service = GenerationContextService()
    context = {
        "current_section": prepared["section_info"],
        "content_matrix": prepared["content_matrix"],
        "analysis_points": prepared["analysis_points"],
        "rag_materials": prepared["rag_materials"],
        "context_sections": prepared["context_sections"],
        "outline_structure": prepared["outline_structure"],
        "project_info": prepared["project_info"],
        "generation_mode": prepared.get("generation_mode", "leaf_content"),
        "content_structure_policy": prepared.get("content_structure_policy"),
    }

    # 2. 构建提示词变量
    prompt_context = prepared["prompt_context"]

    # 反 AI 味增强版 prompt 所需变量（与单章路径保持一致）
    table_needed = bool((section.content_plan or {}).get("table", {}).get("needed"))
    section_variables = {
        "current_section": context.get("current_section", {}),
        "content_matrix": context.get("content_matrix", {}),
        "generation_mode": context.get("generation_mode", "leaf_content"),
        "global_forbidden_rules": context.get("global_forbidden_rules", ""),
        "strict_generation_rules": context.get("strict_generation_rules", ""),
        "analysis_points": context.get("analysis_points", {}),
        "writing_template": context.get("writing_template") or {},
        "rag_materials": context.get("rag_materials", {}),
        "context_sections": context.get("context_sections", {}),
        "outline_structure": context.get("outline_structure", ""),
        "project_info": context.get("project_info", {}),
        "user_prompt": user_prompt,
        "prompt_context": prompt_context,
        "content_plan": section.content_plan or {},
        "selected_facts": SectionGenerationService().resolve_selected_facts(section),
        "knowledge_contents": [],
        "table_allowed_instruction": "可以使用 Markdown 段落、列表和表格；表格必须服务于内容表达，不要为了形式硬插。" if table_needed else "只能使用 Markdown 段落、普通列表和加粗引导语，严禁输出 Markdown 表格或 HTML 表格。",
        "table_cell_instruction": "表格单元格内如有多项内容，优先使用编号、顿号、分号或短句，不要使用 HTML <br> 标签。" if table_needed else "如需表达多项参数、职责、流程或措施，请改用分段文字或普通列表，不要用表格模拟。",
    }

    # 4. 调用 AI 生成
    from apps.generation.services.ai_task_execution_service import (
        AiTaskExecutionService,
    )

    prompt_run = AiTaskExecutionService().execute(
        scenario="section_content_generation",
        variables=section_variables,
        created_by=user,
        business_context={"project_id": section.outline.project_id} if section.outline.project_id else {},
    )

    if prompt_run.status != "succeeded":
        raise Exception(prompt_run.error_message or "AI 生成失败")

    # 5. 解析 LLM 输出
    raw_output = prompt_run.output_text or ""
    parser = GenerationResultParser()
    result = parser.parse(raw_output)

    # 如果 output_json 存在且有效，优先使用
    if prompt_run.output_json and isinstance(prompt_run.output_json, dict):
        if prompt_run.output_json.get("content"):
            result = parser.parse(
                __import__("json").dumps(prompt_run.output_json)
            )

    # 6. 后处理（清理格式问题）
    postprocessor = ContentPostProcessor()
    generation_mode = context.get("generation_mode", "leaf_content")
    content_structure_policy = context.get("content_structure_policy", None)
    post_result = postprocessor.process(result.get("content", ""), generation_mode, content_structure_policy)
    result["content"] = post_result["content"]
    result["postprocess_report"] = post_result["report"]

    # 7. 运行质量校验
    quality_service = GenerationQualityService()
    quality_report = quality_service.run_all_checks(context, result)

    # 8. 自动修订流程
    revision_count = 0
    revision_report = None
    final_status = quality_report.get("final_status", "warning")

    if final_status == "fail":
        revision_service = ContentRevisionService()
        if revision_service.can_revise(quality_report, revision_count):
            logger.info(f"Attempting auto-revision for section {section_id}")
            try:
                revision_result = revision_service.execute_revision(
                    section=section,
                    content=result.get("content", ""),
                    quality_report=quality_report,
                    context=context,
                )

                if revision_result["success"]:
                    result["content"] = revision_result["revised_content"]
                    result["revision_count"] = 1
                    revision_report = revision_result["revision_report"]
                    quality_report = revision_result["revision_report"].get("quality_report", quality_report)
                    final_status = quality_report.get("final_status", "warning")
                    revision_count = 1
                    logger.info(f"Auto-revision successful for section {section_id}")
                else:
                    revision_report = revision_result["revision_report"]
                    logger.warning(f"Auto-revision failed for section {section_id}: {revision_report.get('error')}")
            except Exception as e:
                logger.warning(f"Auto-revision exception for section {section_id}: {e}")
                revision_report = {"error": str(e)}

    # 9. 保存内容（事务内）
    with transaction.atomic():
        section = Section.objects.select_for_update().get(pk=section_id)

        # 记录生成上下文元数据
        # 使用 .get() 安全访问，防止 context 为 None
        writing_template = context.get("writing_template") if context else None
        template_key = writing_template.get("template_key", "") if writing_template else ""

        generation_meta = {
            "used_analysis_point_ids": result.get("used_analysis_point_ids", []),
            "used_rag_material_ids": result.get("used_rag_material_ids", []),
            "missing_info": result.get("missing_info", []),
            "risk_flags": result.get("risk_flags", []),
            "quality_report": quality_report,
            "postprocess_report": result.get("postprocess_report", {}),
            "revision_count": revision_count,
            "revision_report": revision_report,
            "parse_success": result.get("parse_success", True),
            "generation_mode": generation_mode,
            "context_strategy": context.get("context_strategy", "") if context else "",
            "template_key": template_key,
            "rag_channels": list(context.get("rag_materials", {}).keys()) if context else [],
            "context_stats": {
                "analysis_point_count": len(
                    context.get("analysis_points", {}).get("all_matched", [])
                ) if context else 0,
                "rag_material_count": sum(
                    len(items)
                    for items in context.get("rag_materials", {}).values()
                ) if context else 0,
                "no_duplicate_count": len(
                    context.get("context_sections", {}).get(
                        "no_duplicate_sections", []
                    )
                ) if context else 0,
            },
        }

        # 如果质量校验仍为 fail，不覆盖原正文
        if final_status == "fail":
            section.content_generation_status = ContentGenerationStatus.FAILED
            section.content_generation_error = "生成内容未通过质量校验，未覆盖原正文"
            generation_meta["failed_content_preview"] = result.get("content", "")[:3000]
            section.content_generation_meta = generation_meta
            section.generation_status = SectionGenerationStatus.FAILED
            section.save(update_fields=[
                "content_generation_status",
                "content_generation_error",
                "content_generation_meta",
                "generation_status",
            ])

            # 更新记录
            record.output_summary = {
                "word_count": result.get("word_count", 0),
                "quality_status": final_status,
                "parse_success": result.get("parse_success", True),
                "revision_count": revision_count,
                "reason": "质量校验失败，未保存正文",
            }
            record.status = GenerationRecordStatus.FAILED
            record.error_message = "生成内容未通过质量校验"
            record.finished_at = timezone.now()
            record.save()

            logger.warning(
                f"Section {section_id} generation failed quality check: "
                f"status={final_status}, mode={generation_mode}"
            )
            # 返回质量校验失败状态，不抛出异常（异常会被捕获并记录错误日志）
            return {"success": False, "quality_failed": True, "error": "生成内容未通过质量校验"}

        # 质量校验 pass 或 warning，保存正文
        section.content = result["content"]
        section.word_count = result.get("word_count", len(result["content"]))
        section.content_summary = result.get("summary", "")
        section.content_word_count = result.get("word_count", len(result["content"]))
        section.content_generation_status = ContentGenerationStatus.SUCCESS
        section.content_generated_at = timezone.now()
        section.content_generation_meta = generation_meta
        section.generation_status = SectionGenerationStatus.SUCCESS
        section.status = SectionStatus.GENERATED
        section.save()

        # 创建版本
        max_version = (
            SectionVersion.objects.filter(section=section)
            .aggregate(max_version=Max("version_no"))["max_version"]
            or 0
        )
        SectionVersion.objects.create(
            section=section,
            content=result["content"],
            version_no=max_version + 1,
            source=SectionVersionSource.AI,
            word_count=result.get("word_count", len(result["content"])),
            created_by=user,
        )

    # 10. 更新记录
    record.prompt_run = prompt_run
    record.prompt_template_id = prompt_run.prompt_template_id
    record.prompt_version = (
        prompt_run.prompt_version.version if prompt_run.prompt_version else ""
    )
    record.llm_model = (
        prompt_run.model_config.display_name if prompt_run.model_config else ""
    )
    record.output_summary = {
        "word_count": result.get("word_count", len(result["content"])),
        "quality_status": quality_report.get("final_status"),
        "parse_success": result.get("parse_success", True),
        "revision_count": revision_count,
    }
    # 落库 RAG 来源与检索 trace
    record.rag_sources = prepared.get("rag_sources", [])
    record.generation_meta = {
        **(record.generation_meta or {}),
        "retrieval": prepared.get("retrieval_meta", {}),
        "generation_mode": prepared.get("generation_mode"),
        "content_structure_policy": prepared.get("content_structure_policy"),
    }
    record.status = GenerationRecordStatus.SUCCESS
    record.finished_at = timezone.now()
    record.save()

    return {"success": True, "quality_failed": False, "word_count": result.get("word_count", 0)}


@shared_task(bind=True)
def generate_outline_task(
    self,
    tender_file_id: int,
    async_task_id: int,
    user_id: int,
    custom_name: str = "",
):
    """AI解析招标文件生成大纲任务。

    Args:
        tender_file_id: 招标文件ID
        async_task_id: 异步任务ID
        user_id: 用户ID
        custom_name: 用户自定义的大纲名称，非空时拼接为 '{标段名} - AI解析大纲 - {custom_name}'
    """
    from apps.common.services.storage import StorageService
    from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
    from apps.tender.models import TenderFile, ParsedDocument

    async_task = soft_get_async_task(async_task_id)
    if async_task is None:
        return
    user = User.objects.get(pk=user_id)

    outline = None  # 初始化，避免 create 抛异常时失败分支 NameError 掩盖原始异常
    try:
        async_task.status = "running"
        async_task.current_step = "读取招标文件内容"
        async_task.save()

        # 获取招标文件
        tender_file = TenderFile.objects.select_related("project", "lot").get(
            pk=tender_file_id
        )

        if not tender_file.lot:
            raise ValueError("招标文件必须绑定标段")

        # 获取解析文档
        parsed_doc = ParsedDocument.objects.filter(
            tender_file=tender_file,
            is_active=True,
        ).first()

        if not parsed_doc or not parsed_doc.markdown_uri:
            raise ValueError("招标文件未解析或解析结果不存在")

        # 从 MinIO 加载全文（三步流程内部按需读取，这里仅校验可读性）
        storage = StorageService()
        content = storage.get_object(parsed_doc.markdown_uri)
        if not content:
            raise ValueError("招标文件解析结果为空")

        # 先创建大纲草稿（三步流程需要 outline 作为 business_context 锚点）
        # 大纲名称：用户输入了自定义名 → '{标段名} - AI解析大纲 - {自定义名}'，否则回退到 '{标段名} - AI解析大纲'
        # status=GENERATING：标记生成中，前端隐藏此草稿避免过早显示，任务成功后改为 DRAFT
        base_name = f"{tender_file.lot.name} - AI解析大纲"
        outline_name = f"{base_name} - {custom_name}" if custom_name else base_name
        with transaction.atomic():
            Outline.objects.filter(lot=tender_file.lot, is_current=True).update(
                is_current=False
            )
            outline = Outline.objects.create(
                project=tender_file.project,
                lot=tender_file.lot,
                name=outline_name,
                source=OutlineSource.AI_GENERATED,
                source_tender_file=tender_file,
                status=OutlineStatus.GENERATING,
                is_current=True,
                created_by=user,
            )

        # 三步流程：提取评分大类 → 逐大类生成二三级目录 → 审核一一对应（不通过带建议重试一次）
        from apps.outline.services.outline_review_service import OutlineReviewService

        async_task.current_step = "提取技术评分大类"
        async_task.progress = 20
        async_task.save()

        def _outline_progress(progress: int, step: str):
            async_task.progress = progress
            async_task.current_step = step
            async_task.save(update_fields=["progress", "current_step"])

        outline_tree = OutlineReviewService().generate_with_review(
            tender_file=tender_file,
            outline=outline,
            user=user,
            progress_callback=_outline_progress,
        )

        if not outline_tree:
            raise ValueError("三步流程未生成有效目录")

        # 把树结构递归写入 Section
        async_task.current_step = "写入大纲章节"
        async_task.progress = 90
        async_task.save()

        section_count = _save_outline_tree(outline, outline_tree)

        # 章节写入完成，把 outline 从 GENERATING 改为 DRAFT，前端可展示与编辑
        outline.status = OutlineStatus.DRAFT
        outline.save(update_fields=["status", "updated_at"])

        async_task.status = "success"
        async_task.progress = 100
        async_task.current_step = "大纲生成完成"
        async_task.result_payload = {
            "outline_id": outline.id,
            "section_count": section_count,
            "review_status": outline.review_status,
        }
        async_task.finished_at = timezone.now()
        async_task.save()

    except Exception as e:
        logger.exception(f"Outline generation failed: tender_file_id={tender_file_id}")

        async_task.status = "failed"
        async_task.error_message = str(e)[:2000]
        async_task.finished_at = timezone.now()
        async_task.save()

        # 失败时清理空大纲草稿（无章节的草稿对用户无意义，避免展示"空大纲"）
        # 已写入部分 section 的 outline 改为 DRAFT 保留可见性，避免永远卡在 GENERATING
        try:
            if outline:
                if not Section.objects.filter(outline=outline).exists():
                    outline.delete()
                else:
                    outline.status = OutlineStatus.DRAFT
                    outline.save(update_fields=["status", "updated_at"])
        except Exception:
            logger.warning(f"Failed to cleanup empty outline {outline.id if outline else '?'}")

        raise


def _save_outline_tree(outline, tree: list[dict]) -> int:
    """把三步流程返回的嵌套树递归写入 Section。

    tree 格式：[{id, title, description, children:[{id, title, description, children:[...]}]}]
    返回创建的章节总数。
    """
    from apps.outline.models import Section

    total = 0

    def _create(nodes, parent, level):
        nonlocal total
        for idx, node in enumerate(nodes):
            section = Section.objects.create(
                outline=outline,
                parent=parent,
                title=node.get("title", ""),
                level=level,
                sort_order=idx,
            )
            total += 1
            children = node.get("children") or []
            if children:
                _create(children, section, level + 1)

    _create(tree, None, 1)
    return total


def _parse_outline_response(output_text: str) -> list[dict]:
    """解析 AI 输出的目录结构。

    Args:
        output_text: AI 输出文本

    Returns:
        章节列表 [{"title": "...", "level": 1}, ...]
    """
    import json
    import re

    sections = []

    # 尝试从输出中提取 JSON 格式
    json_patterns = [
        r'\{[\s\S]*"sections"[\s\S]*\}',  # {"sections": [...]}
        r'\[[\s\S]*\]',  # [...]
    ]

    for pattern in json_patterns:
        json_match = re.search(pattern, output_text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                if isinstance(data, list):
                    return _parse_sections_list(data, level=1)
                elif isinstance(data, dict) and "sections" in data:
                    return _parse_sections_list(data["sections"], level=1)
            except json.JSONDecodeError:
                continue

    # 解析文本格式的目录
    lines = output_text.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 去除 Markdown 格式符号（**加粗**、*斜体*等）
        line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        line = re.sub(r"\*(.+?)\*", r"\1", line)
        line = re.sub(r"__(.+?)__", r"\1", line)
        line = re.sub(r"_(.+?)_", r"\1", line)

        level, title = _parse_line_level_title(line)
        if level and title:
            sections.append({"title": title, "level": level})

    return sections


def _parse_sections_list(sections_data: list, level: int = 1) -> list[dict]:
    """递归解析嵌套的章节结构。"""
    result = []
    for item in sections_data:
        if isinstance(item, dict):
            title = item.get("title", "")
            if title:
                result.append({"title": title, "level": level})
            if "children" in item:
                result.extend(_parse_sections_list(item["children"], level + 1))
        elif isinstance(item, str):
            if item.strip():
                result.append({"title": item.strip(), "level": level})
    return result


def _parse_line_level_title(line: str) -> tuple[int | None, str | None]:
    """解析单行的层级和标题。

    Returns:
        (level, title) 或 (None, None)
    """
    import re

    # 一级：一、二、三、四、五、六、七、八、九、十
    match = re.match(r"^[一二三四五六七八九十百]+、\s*(.+)$", line)
    if match:
        return (1, match.group(1))

    # 二级：（一）（二）（三）
    match = re.match(r"^（[一二三四五六七八九十]+）\s*(.+)$", line)
    if match:
        return (2, match.group(1))

    # 三级：1、2、3、
    match = re.match(r"^(\d+)、\s*(.+)$", line)
    if match:
        return (3, match.group(2))

    # 四级：1.1、1.2、
    match = re.match(r"^(\d+\.\d+)\s*(.+)$", line)
    if match:
        return (4, match.group(2))

    # 五级：（1）（2）
    match = re.match(r"^（(\d+)）\s*(.+)$", line)
    if match:
        return (5, match.group(2))

    # 其他编号格式：第X章、第X节
    match = re.match(r"^第[一二三四五六七八九十\d]+[章节]\s*(.+)$", line)
    if match:
        return (1, match.group(1))

    # 纯数字编号：1. 2. 3.
    match = re.match(r"^(\d+)\.\s*(.+)$", line)
    if match:
        return (2, match.group(2))

    return (None, None)


@shared_task(bind=True)
def generate_content_matrix_task(self, outline_id: int, task_id: int):
    """矩阵生成 Celery 任务。

    Args:
        outline_id: 大纲ID
        task_id: GenerationTask ID
    """
    from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Outline, Section
    from apps.outline.services.matrix_service import MatrixService

    matrix_service = MatrixService()
    task = GenerationTask.objects.get(pk=task_id)
    outline = Outline.objects.get(pk=outline_id)

    # 获取任务参数
    params = task.params or {}
    section_ids = params.get("section_ids")
    force_overwrite = params.get("force_overwrite", False)

    lock_acquired = False
    original_statuses = {}

    try:
        # 获取锁
        if not matrix_service.acquire_matrix_generation_lock(outline_id):
            # 锁存在但无 RUNNING 任务 → 上次任务被硬中断未释放锁，清理残留锁重试
            running_task = GenerationTask.objects.filter(
                outline_id=outline_id,
                task_type=GenerationTaskType.MATRIX_GENERATION,
                status=GenerationTaskStatus.RUNNING,
            ).exists()
            if running_task:
                task.status = GenerationTaskStatus.FAILED
                task.error_message = "无法获取任务锁，可能有其他任务正在执行"
                task.finished_at = timezone.now()
                task.save()
                return
            matrix_service.steal_stale_lock(outline_id)
            if not matrix_service.acquire_matrix_generation_lock(outline_id):
                task.status = GenerationTaskStatus.FAILED
                task.error_message = "无法获取任务锁（残留锁清理后仍失败）"
                task.finished_at = timezone.now()
                task.save()
                return

        lock_acquired = True

        # 取消检查：用户在任务真正开始前请求了取消
        if task.status == GenerationTaskStatus.CANCEL_REQUESTED:
            Section.objects.filter(
                outline_id=outline_id,
                content_matrix_status=ContentMatrixStatus.GENERATING,
            ).update(
                content_matrix_status=ContentMatrixStatus.PENDING,
                content_matrix_error="任务已取消",
            )
            task.status = GenerationTaskStatus.CANCELLED
            task.finished_at = timezone.now()
            task.save()
            return

        # 中断容错：锁已获取（无并发任务），仍处于 GENERATING 的章节视为上次任务残留，重置为 PENDING
        Section.objects.filter(
            outline_id=outline_id,
            content_matrix_status=ContentMatrixStatus.GENERATING,
        ).update(
            content_matrix_status=ContentMatrixStatus.PENDING,
            content_matrix_error="",
        )

        # 更新任务状态
        task.status = GenerationTaskStatus.RUNNING
        task.started_at = timezone.now()
        task.save(update_fields=["status", "started_at", "updated_at"])

        # 获取目标章节
        targets = matrix_service.get_matrix_generation_targets(
            outline_id=outline_id,
            force_overwrite=force_overwrite,
            section_ids=section_ids,
        )

        if not targets:
            task.status = GenerationTaskStatus.COMPLETED
            task.error_message = "没有需要生成矩阵的章节"
            task.finished_at = timezone.now()
            task.save()
            return

        task.total_count = len(targets)
        task.save(update_fields=["total_count", "updated_at"])

        # 保存原状态快照
        original_statuses = {
            s.id: {
                "status": s.content_matrix_status,
                "matrix": s.content_matrix.copy() if s.content_matrix else {},
            }
            for s in targets
        }

        # 更新章节状态为 generating
        target_ids = [s.id for s in targets]
        Section.objects.filter(id__in=target_ids).update(
            content_matrix_status=ContentMatrixStatus.GENERATING,
            content_matrix_error="",
        )

        # 获取招标要求摘要（如果有）
        requirements_summary = ""
        if outline.source_tender_file_id:
            from apps.requirements.models import TenderRequirement

            requirements = TenderRequirement.objects.filter(
                tender_file_id=outline.source_tender_file_id
            )[:20]
            if requirements:
                requirements_summary = "\n".join(
                    f"- [{r.requirement_no}] {r.title}: {r.content[:200] if r.content else ''}"
                    for r in requirements
                )

        # 调用 Orchestrator 收集公司材料元数据（零向量调用）
        from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
        from apps.outline.services.content_matrix_context_builder import build_company_context_block

        metadata_snapshot = {}
        metadata_warnings = []
        snapshot_status = "success"
        try:
            orch = RetrievalOrchestrator()
            md_ctx = orch.collect_metadata_snapshot(outline, task.created_by)
            metadata_snapshot = md_ctx.metadata_snapshot
            metadata_warnings = md_ctx.warnings
        except Exception as e:
            logger.warning(f"collect_metadata_snapshot failed: {e}")
            snapshot_status = "failed"

        from django.conf import settings
        scenario = getattr(settings, "CONTENT_MATRIX_SCENARIO_V2", "content_matrix_generation_v2")

        # 分批生成：多文件合并解析后章节可能很多，单次 AI 调用处理全部章节
        # 会非常慢且易超时，因此按批次顺序执行，
        # 每批完成后更新进度，批次间检查取消请求；单批失败不阻断后续批次。
        from apps.task_queue.services.config_service import get_task_config

        batch_size = get_task_config("matrix_generation_batch_size")
        batches = [
            targets[i:i + batch_size]
            for i in range(0, len(targets), batch_size)
        ]
        total_batches = len(batches)
        logger.info(
            f"Matrix generation for outline {outline_id}: "
            f"{len(targets)} sections in {total_batches} batch(es), batch_size={batch_size}"
        )

        success_count = 0
        failed_count = 0
        returned_section_ids = set()
        missing_ids = set()
        all_warnings = []

        # 预取大纲全部章节，避免 enrich_section_references 逐章查询（N+1）
        section_map = {
            s.id: s for s in Section.objects.filter(outline_id=outline_id)
        }

        cancelled = False

        for batch_index, batch_sections in enumerate(batches, start=1):
            # 批次间取消/强制结束检查（force_stopped 兜底无 celery_task_id 的 legacy 任务，
            # 有 celery_task_id 的已被 revoke SIGKILL，不会走到这里）
            task.refresh_from_db(fields=["status", "force_stopped"])
            if task.status == GenerationTaskStatus.CANCEL_REQUESTED or task.force_stopped:
                cancelled = True
                logger.info(
                    f"Matrix generation cancelled before batch "
                    f"{batch_index}/{total_batches}: outline_id={outline_id}"
                )
                break

            batch_ids = [s.id for s in batch_sections]
            GenerationTask.objects.filter(pk=task_id).update(
                current_section_title=f"矩阵生成：第 {batch_index}/{total_batches} 批",
            )

            # 只把本批次章节放进大纲结构，缩小 prompt 加快 AI 调用
            outline_structure = matrix_service.build_outline_structure(
                outline, section_ids=batch_ids
            )

            variables = {
                "project_name": outline.project.name,
                "lot_name": outline.lot.name,
                "outline_structure": outline_structure,
                "requirements_summary": requirements_summary,
                "company_context_block": build_company_context_block(metadata_snapshot),
                "company_snapshot": metadata_snapshot.get("company_snapshot", {}),
                "available_knowledge_bases": metadata_snapshot.get("available_knowledge_bases", []),
                "available_document_titles": metadata_snapshot.get("available_document_titles", []),
                "missing_materials": metadata_snapshot.get("missing_materials", []),
            }

            try:
                prompt_run = AiTaskExecutionService().execute(
                    scenario=scenario,
                    variables=variables,
                    created_by=task.created_by,
                    business_context={"project_id": outline.project_id} if outline.project_id else {},
                )

                if prompt_run.status != "succeeded":
                    raise Exception(prompt_run.error_message or "AI 生成矩阵失败")

                # 解析 AI 输出
                output_text = prompt_run.output_text or ""
                output_json = prompt_run.output_json or {}

                # 如果 output_json 没有 sections，尝试从 output_text 解析
                if not output_json.get("sections"):
                    import json
                    import re

                    json_match = re.search(r"\{[\s\S]*\}", output_text)
                    if json_match:
                        output_json = json.loads(json_match.group())

                # 校验输出
                validated_data, warnings = matrix_service.validate_matrix_output(
                    output_json, outline_id
                )

                # 记录警告
                if warnings:
                    logger.warning(
                        f"Matrix generation warnings for outline {outline_id} "
                        f"batch {batch_index}: {warnings}"
                    )
                all_warnings.extend(warnings)

                # 处理每个章节
                batch_returned_ids = set()
                for section_data in validated_data.get("sections", []):
                    section_id = section_data.get("section_id")

                    if section_id not in batch_ids:
                        # AI 返回了非本批次的章节，忽略，避免覆盖 edited 状态
                        logger.info(
                            f"Ignoring out-of-batch section {section_id} "
                            f"in matrix batch {batch_index}"
                        )
                        continue

                    if section_id in batch_returned_ids:
                        # 同批次重复返回，忽略，避免重复写入造成版本号膨胀
                        continue

                    batch_returned_ids.add(section_id)
                    returned_section_ids.add(section_id)

                    try:
                        section = section_map.get(section_id)
                        if section is None:
                            section = Section.objects.get(pk=section_id)

                        # 补全章节引用信息（ID 数组转对象数组）
                        enriched_data = matrix_service.enrich_section_references(
                            section_data, outline_id, section_map=section_map
                        )

                        # 写入矩阵
                        matrix_service.update_section_matrix(section, enriched_data)
                        success_count += 1

                    except Exception as e:
                        logger.exception(f"Failed to update matrix for section {section_id}")
                        Section.objects.filter(pk=section_id).update(
                            content_matrix_status=ContentMatrixStatus.FAILED,
                            content_matrix_error=str(e)[:500],
                        )
                        failed_count += 1

                # 标记本批次缺失章节为失败
                batch_missing = set(batch_ids) - batch_returned_ids
                if batch_missing:
                    Section.objects.filter(id__in=batch_missing).update(
                        content_matrix_status=ContentMatrixStatus.FAILED,
                        content_matrix_error="AI 未返回此章节的矩阵",
                    )
                    failed_count += len(batch_missing)
                    missing_ids |= batch_missing

            except Exception as e:
                # 单批失败不阻断后续批次，整批标记失败并记录警告
                logger.exception(
                    f"Matrix batch {batch_index}/{total_batches} failed: "
                    f"outline_id={outline_id}"
                )
                Section.objects.filter(id__in=batch_ids).update(
                    content_matrix_status=ContentMatrixStatus.FAILED,
                    content_matrix_error=str(e)[:500],
                )
                failed_count += len(batch_ids)
                missing_ids |= set(batch_ids)
                all_warnings.append(f"第 {batch_index} 批生成失败: {str(e)[:200]}")

            # 批次进度更新（供前端轮询展示）
            task.success_count = success_count
            task.failed_count = failed_count
            task.result = {
                "batch_progress": {
                    "current_batch": batch_index,
                    "total_batches": total_batches,
                },
                "warnings": all_warnings,
            }
            task.save(update_fields=[
                "success_count", "failed_count", "result", "updated_at",
            ])
            logger.info(
                f"Matrix batch {batch_index}/{total_batches} done: "
                f"outline_id={outline_id}, success={success_count}, failed={failed_count}"
            )

        if cancelled:
            # 未处理的章节恢复为 PENDING，便于下次重新生成
            Section.objects.filter(
                outline_id=outline_id,
                content_matrix_status=ContentMatrixStatus.GENERATING,
            ).update(
                content_matrix_status=ContentMatrixStatus.PENDING,
                content_matrix_error="任务已取消",
            )
            task.status = GenerationTaskStatus.CANCELLED
            task.success_count = success_count
            task.failed_count = failed_count
            task.finished_at = timezone.now()
            task.save()
            return

        # 更新任务状态
        task.success_count = success_count
        task.failed_count = failed_count
        task.status = (
            GenerationTaskStatus.COMPLETED
            if failed_count == 0
            else (
                GenerationTaskStatus.FAILED
                if success_count == 0
                else GenerationTaskStatus.PARTIAL_SUCCESS
            )
        )
        task.result = {
            "batch_progress": {
                "current_batch": total_batches,
                "total_batches": total_batches,
            },
            "warnings": all_warnings,
            "missing_ids": list(missing_ids),
            "metadata_snapshot_summary": {
                "has_material_package": metadata_snapshot.get("has_material_package", False),
                "has_kb_bindings": metadata_snapshot.get("has_kb_bindings", False),
                "kb_ids": [kb["kb_id"] for kb in metadata_snapshot.get("available_knowledge_bases", [])],
                "document_title_total_count": metadata_snapshot.get("document_title_total_count", 0),
                "document_title_included_count": metadata_snapshot.get("document_title_included_count", 0),
                "missing_material_count": len(metadata_snapshot.get("missing_materials", [])),
                "snapshot_at": timezone.now().isoformat(),
                "snapshot_status": snapshot_status,
            },
            "metadata_warnings": metadata_warnings,
        }
        task.finished_at = timezone.now()
        task.save()

    except Exception as e:
        logger.exception(f"Matrix generation failed: outline_id={outline_id}")

        # 恢复原状态
        for section_id, original in original_statuses.items():
            Section.objects.filter(pk=section_id).update(
                content_matrix_status=original["status"],
                content_matrix=original["matrix"],
            )

        task.status = GenerationTaskStatus.FAILED
        task.error_message = str(e)[:2000]
        task.finished_at = timezone.now()
        task.save()

    finally:
        if lock_acquired:
            matrix_service.release_matrix_generation_lock(outline_id)