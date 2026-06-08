# backend/apps/outline/tasks.py
"""大纲模块 Celery 任务。"""

import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.outline.constants import (
    ContentGenerationStatus,
    GenerationRecordStatus,
    OutlineSource,
    OutlineStatus,
    SectionGenerationStatus,
    SectionStatus,
    SectionVersionSource,
)
from apps.outline.models import BatchGenerationTaskItem, GenerationTask, Outline, Section, SectionVersion, SectionGenerationRecord
from apps.outline.services.section_generation_service import SectionGenerationService

User = get_user_model()
logger = logging.getLogger(__name__)


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
    from apps.outline.services.generation_context_service import GenerationContextService
    from apps.outline.services.generation_result_parser import GenerationResultParser
    from apps.outline.services.generation_quality_service import GenerationQualityService
    from apps.outline.services.content_postprocessor import ContentPostProcessor
    from apps.outline.services.content_revision_service import ContentRevisionService
    from apps.outline.services.rag_service import RagService

    try:
        section = Section.objects.get(pk=section_id)
        record = SectionGenerationRecord.objects.get(pk=record_id)
        user = User.objects.get(pk=user_id)

        # 更新状态
        section.generation_status = SectionGenerationStatus.RUNNING
        section.save()
        record.status = GenerationRecordStatus.RUNNING
        record.save()

        # 1. RAG 素材检索
        rag_service = RagService()
        rag_materials = rag_service.retrieve_for_section(
            section=section,
            user=user,
            top_k_per_channel=5,
        )

        # 2. 构建完整上下文（包含 generation_mode 识别和上下文策略）
        context_service = GenerationContextService()
        context = context_service.build_generation_context(
            section=section,
            rag_materials=rag_materials,
            include_template=True,
        )

        # 3. 构建提示词变量
        prompt_context = context_service.build_prompt_context(context)

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
        }

        # 4. 调用 AI 生成
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
        )

        prompt_run = AiTaskExecutionService().execute(
            scenario="section_content_generation",
            variables=section_variables,
            created_by=user,
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

        # 更新 AsyncTask 状态
        async_task = AsyncTask.objects.get(pk=record.async_task_id)
        async_task.status = "failed"
        async_task.error_message = str(e)[:2000]
        async_task.finished_at = timezone.now()
        async_task.save()

        raise


@shared_task(bind=True)
def batch_section_generation_task(self, task_id: int):
    """批量正文生成任务。

    复用 generate_section_task 的单章生成能力，负责调度编排：
    - 按预计算的顺序串行生成（使用 BatchGenerationTaskItem）
    - 每章实时构建上下文
    - 更新进度和状态
    - 支持暂停/恢复/取消请求
    """
    from apps.outline.constants import GenerationTaskStatus
    from apps.outline.models import GenerationTask
    from apps.outline.services.batch_generation_service import BatchGenerationService

    task = GenerationTask.objects.select_for_update().get(pk=task_id)

    # 如果是从 PAUSED 恢复，跳过已完成的章节
    if task.status == GenerationTaskStatus.PAUSED:
        task.status = GenerationTaskStatus.RUNNING
        task.save()

    params = task.params or {}
    skip_on_failure = params.get("skip_on_failure", True)

    # 从 BatchGenerationTaskItem 获取待处理章节
    pending_items = BatchGenerationTaskItem.objects.filter(
        task=task,
        status="pending",
    ).order_by("sort_index")

    if not pending_items.exists():
        # 没有待处理的章节，检查是否全部完成
        _finalize_batch_task(task)
        return

    for item in pending_items:
        # 检查暂停/取消请求
        task.refresh_from_db()
        if task.status == GenerationTaskStatus.PAUSE_REQUESTED:
            # 记录暂停位置
            task.paused_at_index = item.sort_index
            task.status = GenerationTaskStatus.PAUSED
            task.save()
            logger.info(f"Batch task {task_id} paused at index {item.sort_index}")
            return

        if task.status == GenerationTaskStatus.CANCEL_REQUESTED:
            # 标记剩余为 cancelled
            BatchGenerationTaskItem.objects.filter(
                task=task,
                status__in=["pending", "running"],
            ).update(status="cancelled")
            task.status = GenerationTaskStatus.CANCELLED
            task.finished_at = timezone.now()
            task.error_message = "用户请求取消"
            task.save()
            logger.info(f"Batch task {task_id} cancelled")
            return

        section_id = item.section_id

        # 更新子项状态为 running
        item.status = "running"
        item.started_at = timezone.now()
        item.save()

        # 更新任务当前处理章节
        task.current_section_id = section_id
        task.current_section_title = item.section.title
        task.save()

        try:
            # 获取章节和用户
            section = Section.objects.get(pk=section_id)
            user = User.objects.get(pk=task.created_by_id)

            # 创建单章生成记录
            async_task = AsyncTask.objects.create(
                task_type="section_generate",
                related_object_type="Section",
                related_object_id=str(section_id),
                input_payload={
                    "section_id": section_id,
                    "batch_task_id": task_id,
                },
                created_by=user,
            )

            record = SectionGenerationRecord.objects.create(
                section=section,
                async_task=async_task,
                input_summary={
                    "batch_task_id": task_id,
                    "sort_index": item.sort_index,
                },
                status=GenerationRecordStatus.PENDING,
                created_by=user,
            )

            # 直接调用单章生成逻辑（不触发新的 Celery 任务）
            _execute_single_section_generation(
                section_id=section_id,
                record_id=record.id,
                user_id=user.id,
                user_prompt=section.user_prompt or params.get("user_prompt_default", ""),
            )

            # 更新子项状态为 success
            item.status = "success"
            item.finished_at = timezone.now()
            item.word_count = section.content_word_count
            item.save()

            task.success_count = BatchGenerationTaskItem.objects.filter(
                task=task, status="success"
            ).count()
            task.save()

        except Exception as e:
            logger.exception(f"Batch generation failed for section {section_id}")

            # 更新子项状态为 failed
            item.status = "failed"
            item.error_message = str(e)[:2000]
            item.finished_at = timezone.now()
            item.save()

            task.failed_count = BatchGenerationTaskItem.objects.filter(
                task=task, status="failed"
            ).count()
            task.save()

            # 记录失败
            Section.objects.filter(pk=section_id).update(
                content_generation_status=ContentGenerationStatus.FAILED,
                content_generation_error=str(e)[:500],
            )

            # 如果不跳过失败，停止任务
            if not skip_on_failure:
                task.status = GenerationTaskStatus.FAILED
                task.error_message = f"章节 {item.section.title} 生成失败: {str(e)[:200]}"
                task.finished_at = timezone.now()
                task.save()

                # 标记剩余为 skipped
                BatchGenerationTaskItem.objects.filter(
                    task=task,
                    status="pending",
                ).update(status="skipped")
                return

    # 完成任务
    _finalize_batch_task(task)


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


def _execute_single_section_generation(
    section_id: int,
    record_id: int,
    user_id: int,
    user_prompt: str,
):
    """执行单章节生成（同步版本，供批量任务调用）。"""
    from apps.outline.services.generation_context_service import GenerationContextService
    from apps.outline.services.generation_result_parser import GenerationResultParser
    from apps.outline.services.generation_quality_service import GenerationQualityService
    from apps.outline.services.content_postprocessor import ContentPostProcessor
    from apps.outline.services.content_revision_service import ContentRevisionService
    from apps.outline.services.rag_service import RagService

    section = Section.objects.get(pk=section_id)
    record = SectionGenerationRecord.objects.get(pk=record_id)
    user = User.objects.get(pk=user_id)

    # 更新状态
    section.generation_status = SectionGenerationStatus.RUNNING
    section.save()
    record.status = GenerationRecordStatus.RUNNING
    record.save()

    # 1. RAG 素材检索
    rag_service = RagService()
    rag_materials = rag_service.retrieve_for_section(
        section=section,
        user=user,
        top_k_per_channel=5,
    )

    # 2. 构建完整上下文（包含 generation_mode 识别和上下文策略）
    context_service = GenerationContextService()
    context = context_service.build_generation_context(
        section=section,
        rag_materials=rag_materials,
        include_template=True,
    )

    # 3. 构建提示词变量
    prompt_context = context_service.build_prompt_context(context)

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
    }

    # 4. 调用 AI 生成
    from apps.generation.services.ai_task_execution_service import (
        AiTaskExecutionService,
    )

    prompt_run = AiTaskExecutionService().execute(
        scenario="section_content_generation",
        variables=section_variables,
        created_by=user,
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
    record.status = GenerationRecordStatus.SUCCESS
    record.finished_at = timezone.now()
    record.save()


@shared_task(bind=True)
def generate_outline_task(
    self,
    tender_file_id: int,
    async_task_id: int,
    user_id: int,
):
    """AI解析招标文件生成大纲任务。

    Args:
        tender_file_id: 招标文件ID
        async_task_id: 异步任务ID
        user_id: 用户ID
    """
    from apps.common.services.storage import StorageService
    from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
    from apps.tender.models import TenderFile, ParsedDocument

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

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

        # 从 MinIO 加载全文
        storage = StorageService()
        content = storage.get_object(parsed_doc.markdown_uri)
        full_text = content.decode("utf-8")

        async_task.current_step = "调用AI生成大纲"
        async_task.progress = 30
        async_task.save()

        # 调用 AI 生成大纲
        variables = {
            "project_name": tender_file.project.name,
            "tender_document_full_text": full_text,
        }

        prompt_run = AiTaskExecutionService().execute(
            scenario="outline_generation",
            variables=variables,
            created_by=user,
        )

        if prompt_run.status != "succeeded":
            raise Exception(prompt_run.error_message or "AI 生成大纲失败")

        async_task.current_step = "解析大纲结构"
        async_task.progress = 70
        async_task.save()

        # 解析 AI 输出
        output_text = prompt_run.output_text or ""
        sections = _parse_outline_response(output_text)

        if not sections:
            raise ValueError("AI 输出中未找到有效的目录结构")

        # 创建大纲
        with transaction.atomic():
            # 置空其他当前大纲
            Outline.objects.filter(lot=tender_file.lot, is_current=True).update(
                is_current=False
            )

            # 创建大纲
            outline = Outline.objects.create(
                project=tender_file.project,
                lot=tender_file.lot,
                name=f"{tender_file.lot.name} - AI解析大纲",
                source=OutlineSource.AI_GENERATED,
                source_tender_file=tender_file,
                status=OutlineStatus.DRAFT,
                is_current=True,
                created_by=user,
            )

            # 创建章节（构建树形结构）
            section_stack = []  # 用于追踪各级父节点
            for idx, section_data in enumerate(sections):
                level = section_data.get("level", 1)
                title = section_data.get("title", "")

                # 根据 level 确定父节点
                # level 1 -> parent=None
                # level 2 -> parent=最近的 level 1 节点
                # level 3 -> parent=最近的 level 2 节点
                # ...
                parent = None
                if level > 1 and section_stack:
                    # 弹出比当前 level 高的节点，保留同级或更低的
                    while section_stack and section_stack[-1]["level"] >= level:
                        section_stack.pop()
                    if section_stack:
                        parent = section_stack[-1]["section"]

                section = Section.objects.create(
                    outline=outline,
                    parent=parent,
                    title=title,
                    level=level,
                    sort_order=idx,
                )

                # 加入栈中，作为后续可能的父节点
                section_stack.append({"level": level, "section": section})

        async_task.status = "success"
        async_task.progress = 100
        async_task.current_step = "大纲生成完成，正在生成内容责任矩阵"
        async_task.result_payload = {
            "outline_id": outline.id,
            "section_count": len(sections),
            "prompt_run_id": prompt_run.id,
        }
        async_task.finished_at = timezone.now()
        async_task.save()

        # 自动触发矩阵生成
        try:
            from apps.outline.services.matrix_service import MatrixService

            MatrixService().start_matrix_generation(
                outline_id=outline.id,
                user=user,
            )
        except Exception as e:
            # 矩阵生成失败不影响大纲创建
            logger.warning(f"Failed to start matrix generation for outline {outline.id}: {e}")

    except Exception as e:
        logger.exception(f"Outline generation failed: tender_file_id={tender_file_id}")

        async_task.status = "failed"
        async_task.error_message = str(e)[:2000]
        async_task.finished_at = timezone.now()
        async_task.save()

        raise


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
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus
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
            task.status = GenerationTaskStatus.FAILED
            task.error_message = "无法获取任务锁，可能有其他任务正在执行"
            task.finished_at = timezone.now()
            task.save()
            return

        lock_acquired = True

        # 更新任务状态
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 获取目标章节
        targets = matrix_service.get_matrix_generation_targets(
            outline_id=outline_id,
            force_overwrite=force_overwrite,
            section_ids=section_ids,
        )

        if not targets:
            task.status = GenerationTaskStatus.SUCCESS
            task.error_message = "没有需要生成矩阵的章节"
            task.finished_at = timezone.now()
            task.save()
            return

        task.total_count = len(targets)
        task.save()

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

        # 构建大纲结构
        outline_structure = matrix_service.build_outline_structure(outline)

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

        # 调用 AI 生成矩阵
        variables = {
            "project_name": outline.project.name,
            "lot_name": outline.lot.name,
            "outline_structure": outline_structure,
            "requirements_summary": requirements_summary,
        }

        prompt_run = AiTaskExecutionService().execute(
            scenario="content_matrix_generation",
            variables=variables,
            created_by=task.created_by,
        )

        if prompt_run.status != "succeeded":
            raise Exception(prompt_run.error_message or "AI 生成矩阵失败")

        # 解析 AI 输出
        output_text = prompt_run.output_text or ""
        output_json = prompt_run.output_json or {}

        # 如果 output_json 没有 sections，尝试从 output_text 解析
        if not output_json.get("sections"):
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
            logger.warning(f"Matrix generation warnings for outline {outline_id}: {warnings}")

        # 处理每个章节
        success_count = 0
        failed_count = 0
        returned_section_ids = set()

        for section_data in validated_data.get("sections", []):
            section_id = section_data.get("section_id")
            returned_section_ids.add(section_id)

            try:
                section = Section.objects.get(pk=section_id)

                # 补全章节引用信息（ID 数组转对象数组）
                enriched_data = matrix_service.enrich_section_references(
                    section_data, outline_id
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

        # 标记缺失章节为失败
        missing_ids = set(target_ids) - returned_section_ids
        if missing_ids:
            Section.objects.filter(id__in=missing_ids).update(
                content_matrix_status=ContentMatrixStatus.FAILED,
                content_matrix_error="AI 未返回此章节的矩阵",
            )
            failed_count += len(missing_ids)

        # 更新任务状态
        task.success_count = success_count
        task.failed_count = failed_count
        task.status = (
            GenerationTaskStatus.SUCCESS
            if failed_count == 0
            else (
                GenerationTaskStatus.FAILED
                if success_count == 0
                else GenerationTaskStatus.PARTIAL_SUCCESS
            )
        )
        task.result = {
            "warnings": warnings,
            "missing_ids": list(missing_ids),
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