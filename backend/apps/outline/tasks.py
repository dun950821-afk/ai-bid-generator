# backend/apps/outline/tasks.py
"""大纲模块 Celery 任务。"""

import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.outline.constants import (
    GenerationRecordStatus,
    SectionGenerationStatus,
    SectionStatus,
    SectionVersionSource,
)
from apps.outline.models import Outline, Section, SectionVersion, SectionGenerationRecord
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
    try:
        section = Section.objects.get(pk=section_id)
        record = SectionGenerationRecord.objects.get(pk=record_id)
        user = User.objects.get(pk=user_id)

        # 更新状态
        section.generation_status = SectionGenerationStatus.RUNNING
        section.save()
        record.status = GenerationRecordStatus.RUNNING
        record.save()

        # 在任务内部构建上下文
        context = SectionGenerationService().prepare_generation_context(
            section_id=section_id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=user_id,
        )

        # 调用 AI 生成
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
        )

        prompt_run = AiTaskExecutionService().execute(
            scenario="section_writing",
            variables=context,
            created_by=user,
        )

        if prompt_run.status == "succeeded":
            content = prompt_run.output_json.get("content", "")
            word_count = len(content)

            # 保存内容（事务内生成版本号）
            with transaction.atomic():
                section = Section.objects.select_for_update().get(pk=section_id)

                # 更新章节
                section.content = content
                section.word_count = word_count
                section.generation_status = SectionGenerationStatus.SUCCESS
                section.status = SectionStatus.GENERATED
                section.save()

                # 创建版本（version_no 事务内计算）
                max_version = (
                    SectionVersion.objects.filter(section=section)
                    .aggregate(max_version=models.Max("version_no"))["max_version"]
                    or 0
                )
                SectionVersion.objects.create(
                    section=section,
                    content=content,
                    version_no=max_version + 1,
                    source=SectionVersionSource.AI,
                    word_count=word_count,
                    created_by=user,
                )

            # 更新记录（不存完整正文）
            record.prompt_run = prompt_run
            record.prompt_template_id = prompt_run.prompt_template_id
            record.prompt_version = (
                prompt_run.prompt_version.version if prompt_run.prompt_version else ""
            )
            record.llm_model = (
                prompt_run.model_config.display_name if prompt_run.model_config else ""
            )
            record.output_summary = {
                "word_count": word_count,
                "prompt_run_id": prompt_run.id,
            }
            record.status = GenerationRecordStatus.SUCCESS
            record.finished_at = timezone.now()
            record.save()

        else:
            raise Exception(prompt_run.error_message or "AI 生成失败")

    except Exception as e:
        logger.exception(f"Section generation failed: section_id={section_id}")

        section = Section.objects.get(pk=section_id)
        section.generation_status = SectionGenerationStatus.FAILED
        section.save()

        record = SectionGenerationRecord.objects.get(pk=record_id)
        record.status = GenerationRecordStatus.FAILED
        record.error_message = str(e)[:2000]
        record.finished_at = timezone.now()
        record.save()

        raise


@shared_task(bind=True)
def generate_sections_batch_task(
    self,
    outline_id: int,
    async_task_id: int,
    user_id: int,
):
    """批量生成章节任务。"""
    user = User.objects.get(pk=user_id)
    async_task = AsyncTask.objects.get(pk=async_task_id)

    # 获取待生成的记录
    records = (
        SectionGenerationRecord.objects.filter(
            async_task=async_task,
            status=GenerationRecordStatus.PENDING,
        )
        .select_related("section")
        .order_by("section__sort_order")
    )

    total = records.count()
    completed = 0
    failed = 0

    for idx, record in enumerate(records, 1):
        try:
            # 分析需求（同步）
            analysis = SectionGenerationService().analyze_section_needs(
                record.section_id
            )

            # 准备上下文（任务内部构建）
            context = SectionGenerationService().prepare_generation_context(
                section_id=record.section_id,
                analysis_result=analysis,
                user_prompt=record.section.user_prompt or "",
                user_id=user_id,
            )

            # 生成章节
            from apps.generation.services.ai_task_execution_service import (
                AiTaskExecutionService,
            )

            prompt_run = AiTaskExecutionService().execute(
                scenario="section_writing",
                variables=context,
                created_by=user,
            )

            if prompt_run.status == "succeeded":
                content = prompt_run.output_json.get("content", "")
                word_count = len(content)

                # 保存内容（事务内）
                with transaction.atomic():
                    section = Section.objects.select_for_update().get(
                        pk=record.section_id
                    )

                    section.content = content
                    section.word_count = word_count
                    section.generation_status = SectionGenerationStatus.SUCCESS
                    section.status = SectionStatus.GENERATED
                    section.save()

                    max_version = (
                        SectionVersion.objects.filter(section=section)
                        .aggregate(max_version=models.Max("version_no"))["max_version"]
                        or 0
                    )
                    SectionVersion.objects.create(
                        section=section,
                        content=content,
                        version_no=max_version + 1,
                        source=SectionVersionSource.AI,
                        word_count=word_count,
                        created_by=user,
                    )

                record.status = GenerationRecordStatus.SUCCESS
                record.output_summary = {"word_count": word_count}
                completed += 1

            else:
                record.status = GenerationRecordStatus.FAILED
                record.error_message = prompt_run.error_message or "AI 生成失败"
                failed += 1

        except Exception as e:
            logger.exception(
                f"Batch section generation failed: section_id={record.section_id}"
            )
            record.status = GenerationRecordStatus.FAILED
            record.error_message = str(e)[:2000]
            failed += 1

        record.finished_at = timezone.now()
        record.save()

        # 更新整体进度
        progress = int((idx / total) * 100) if total > 0 else 100
        async_task.progress = progress
        async_task.current_step = f"已完成 {completed}/{total}，失败 {failed}"
        async_task.save()

    # 完成任务
    async_task.result_payload = {
        "total": total,
        "completed": completed,
        "failed": failed,
    }
    async_task.status = (
        "success"
        if failed == 0
        else ("failed" if completed == 0 else "success")
    )
    async_task.finished_at = timezone.now()
    async_task.save()