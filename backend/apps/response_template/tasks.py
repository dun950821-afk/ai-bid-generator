# -*- coding: utf-8 -*-
"""响应模板异步任务。

- analyze_response_template: 识别响应格式(附件定位 + AI 类型识别)
- fill_response_template:   原位填充生成响应文件

复用 tender 的 PipelineJob 状态模式与 celery 注册方式。
"""

import logging
from hashlib import sha256

from django.utils import timezone

from config.celery import app
from apps.common.models import AsyncTask
from apps.common.services.storage import StorageService
from apps.common.tasks_utils import soft_get_async_task
from apps.response_template.constants import TemplateStatus
from apps.response_template.models import (
    TenderResponseDocument,
    TenderResponseTemplate,
)
from apps.response_template.services.analyzer import ResponseTemplateAnalyzer
from apps.response_template.services.filler import OoxmlFiller

logger = logging.getLogger(__name__)


@app.task(
    name="apps.response_template.analyze_response_template",
    bind=True,
    soft_time_limit=1200,
    time_limit=1500,
)
def analyze_response_template(self, task_id: int, template_id: int):
    """识别招标文件响应模板(纳入 AsyncTask 队列管理)。"""
    task = soft_get_async_task(task_id)
    if task is None:
        return
    template = TenderResponseTemplate.objects.select_related(
        "source_file", "parsed_document"
    ).get(pk=template_id)
    try:
        task.status = AsyncTask.STATUS_RUNNING
        task.progress = 5
        task.current_step = "定位响应文件格式章节"
        task.started_at = timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "started_at"])

        analyzer = ResponseTemplateAnalyzer()

        def progress_cb(pct: int, step: str):
            task.progress = pct
            task.current_step = step
            task.save(update_fields=["progress", "current_step"])

        analyzer.analyze(template, progress_cb=progress_cb)
        # 识别完成后生成 compiled 模板(Content Control 定位)
        from apps.response_template.services.compile_service import compile_template

        compile_template(template)

        task.progress = 100
        task.status = AsyncTask.STATUS_SUCCESS
        task.current_step = "识别完成"
        task.finished_at = timezone.now()
        task.result_payload = {
            "template_id": template.id,
            "blocks": template.blocks.count(),
            "confidence": template.confidence,
        }
        task.save(update_fields=[
            "status", "progress", "current_step", "finished_at", "result_payload",
        ])
    except Exception as exc:
        logger.exception("analyze failed: template=%s", template_id)
        template.status = TemplateStatus.FAILED
        template.error_message = f"{type(exc).__name__}: {exc}"[:1000]
        template.save(update_fields=["status", "error_message", "updated_at"])

        task.status = AsyncTask.STATUS_FAILED
        task.error_message = f"{type(exc).__name__}: {exc}"[:512]
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "error_message", "finished_at"])
        raise


@app.task(
    name="apps.response_template.fill_response_template",
    bind=True,
    soft_time_limit=900,
    time_limit=1200,
)
def fill_response_template(self, task_id: int, template_id: int):
    """生成响应文件(原位填充原始 docx, 纳入 AsyncTask 队列管理)。"""
    task = soft_get_async_task(task_id)
    if task is None:
        return
    template = TenderResponseTemplate.objects.select_related(
        "source_file", "project"
    ).get(pk=template_id)
    if template.status not in (
        TemplateStatus.CONFIRMED,
        TemplateStatus.GENERATED,
        TemplateStatus.FAILED,
    ):
        raise ValueError(f"模板状态不允许生成: {template.status}")

    template.status = TemplateStatus.GENERATING
    template.save(update_fields=["status", "updated_at"])

    try:
        task.status = AsyncTask.STATUS_RUNNING
        task.progress = 10
        task.current_step = "准备原始模板"
        task.started_at = timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "started_at"])

        blocks = list(template.blocks.all())
        main_blocks = [b for b in blocks if not b.is_separate_package]
        separate_blocks = [b for b in blocks if b.is_separate_package]

        storage = StorageService()
        docs = []

        # 1. 主响应文件(排除单独密封块)
        main_doc = TenderResponseDocument.objects.create(
            template=template,
            title=template.name,
            kind="main",
            status=TenderResponseDocument.STATUS_GENERATING,
            created_by=template.updated_by or template.created_by,
        )
        task.progress = 30
        task.current_step = "填充主响应文件(企业数据/案例/材料)"
        task.save(update_fields=["progress", "current_step"])
        content_file, warnings, filled = OoxmlFiller().fill(template, main_blocks)
        object_key = (
            f"projects/{template.project_id}/response/{template.id}/"
            f"response-{main_doc.id}.docx"
        )
        storage.put_object(
            object_key,
            content_file.read(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        main_doc.object_key = object_key
        main_doc.file_name = content_file.name
        main_doc.file_size = content_file.size
        main_doc.status = TenderResponseDocument.STATUS_DONE
        main_doc.save(update_fields=[
            "object_key", "file_name", "file_size", "status", "updated_at",
        ])
        docs.append(main_doc)

        # 2. 单独密封附件(如报价表), 独立文档
        if separate_blocks:
            sep_doc = TenderResponseDocument.objects.create(
                template=template,
                title=f"{template.name} - 单独密封",
                kind="separate",
                status=TenderResponseDocument.STATUS_GENERATING,
                created_by=template.updated_by or template.created_by,
            )
            sep_file, sep_warnings, sep_filled = OoxmlFiller().fill(
                template, separate_blocks, trim_anchor="附件7",
            )
            sep_key = (
                f"projects/{template.project_id}/response/{template.id}/"
                f"separate-{sep_doc.id}.docx"
            )
            storage.put_object(
                sep_key,
                sep_file.read(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
            sep_doc.object_key = sep_key
            sep_doc.file_name = sep_file.name
            sep_doc.file_size = sep_file.size
            sep_doc.status = TenderResponseDocument.STATUS_DONE
            sep_doc.save(update_fields=[
                "object_key", "file_name", "file_size", "status", "updated_at",
            ])
            docs.append(sep_doc)
            warnings += sep_warnings

        template.status = TemplateStatus.GENERATED
        template.save(update_fields=["status", "updated_at"])

        task.progress = 100
        task.status = AsyncTask.STATUS_SUCCESS
        task.current_step = "生成完成"
        task.finished_at = timezone.now()
        task.result_payload = {
            "template_id": template.id,
            "document_ids": [d.id for d in docs],
            "warnings": len(warnings),
        }
        task.save(update_fields=[
            "status", "progress", "current_step", "finished_at", "result_payload",
        ])
        logger.info(
            "response template filled: template=%s docs=%s warnings=%s",
            template_id, [d.id for d in docs], len(warnings),
        )
        return {
            "document_ids": [d.id for d in docs],
            "warnings": warnings,
            "filled_blocks": [b.block_key for b in filled],
        }
    except Exception as exc:
        logger.exception("fill failed: template=%s", template_id)
        # 标记生成中的产物为失败
        TenderResponseDocument.objects.filter(
            template=template, status=TenderResponseDocument.STATUS_GENERATING
        ).update(
            status=TenderResponseDocument.STATUS_FAILED,
            error_message=f"{type(exc).__name__}: {exc}"[:1000],
        )
        template.status = TemplateStatus.FAILED
        template.error_message = f"{type(exc).__name__}: {exc}"[:1000]
        template.save(update_fields=["status", "error_message", "updated_at"])

        task.status = AsyncTask.STATUS_FAILED
        task.error_message = f"{type(exc).__name__}: {exc}"[:512]
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "error_message", "finished_at"])
        raise
