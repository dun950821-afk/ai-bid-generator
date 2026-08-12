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
from apps.common.services.storage import StorageService
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
def analyze_response_template(self, template_id: int):
    """识别招标文件响应模板。"""
    template = TenderResponseTemplate.objects.select_related(
        "source_file", "parsed_document"
    ).get(pk=template_id)
    try:
        ResponseTemplateAnalyzer().analyze(template)
    except Exception as exc:
        logger.exception("analyze failed: template=%s", template_id)
        template.status = TemplateStatus.FAILED
        template.error_message = f"{type(exc).__name__}: {exc}"[:1000]
        template.save(update_fields=["status", "error_message", "updated_at"])
        raise


@app.task(
    name="apps.response_template.fill_response_template",
    bind=True,
    soft_time_limit=900,
    time_limit=1200,
)
def fill_response_template(self, template_id: int):
    """生成响应文件(原位填充原始 docx)。"""
    template = TenderResponseTemplate.objects.select_related(
        "source_file", "project"
    ).get(pk=template_id)
    if template.status != TemplateStatus.CONFIRMED:
        raise ValueError(f"模板状态不允许生成: {template.status}")

    template.status = TemplateStatus.GENERATING
    template.save(update_fields=["status", "updated_at"])

    document = TenderResponseDocument.objects.create(
        template=template,
        title=f"{template.name}",
        kind="main",
        status=TenderResponseDocument.STATUS_GENERATING,
        created_by=template.updated_by or template.created_by,
    )
    try:
        blocks = list(template.blocks.all())
        content_file, warnings, filled = OoxmlFiller().fill(template, blocks)

        storage = StorageService()
        object_key = (
            f"projects/{template.project_id}/response/{template.id}/"
            f"response-{document.id}.docx"
        )
        storage.put_object(object_key, content_file.read(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

        document.object_key = object_key
        document.file_name = content_file.name
        document.file_size = content_file.size
        document.status = TenderResponseDocument.STATUS_DONE
        document.save(update_fields=[
            "object_key", "file_name", "file_size", "status", "updated_at",
        ])

        template.status = TemplateStatus.GENERATED
        template.save(update_fields=["status", "updated_at"])
        logger.info(
            "response template filled: template=%s doc=%s warnings=%s",
            template_id, document.id, len(warnings),
        )
        return {
            "document_id": document.id,
            "warnings": warnings,
            "filled_blocks": [b.block_key for b in filled],
        }
    except Exception as exc:
        logger.exception("fill failed: template=%s", template_id)
        document.status = TenderResponseDocument.STATUS_FAILED
        document.error_message = f"{type(exc).__name__}: {exc}"[:1000]
        document.save(update_fields=["status", "error_message", "updated_at"])
        template.status = TemplateStatus.FAILED
        template.error_message = f"{type(exc).__name__}: {exc}"[:1000]
        template.save(update_fields=["status", "error_message", "updated_at"])
        raise
