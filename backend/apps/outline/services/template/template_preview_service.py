# backend/apps/outline/services/template/template_preview_service.py
"""模板预览服务（方案 §54）。

发布版本时经 ONLYOFFICE Conversion API 生成首页 PNG 缩略图和
预览 PDF，存 MinIO；模板列表直接加载缩略图，不做实时转换。
转换失败不阻断发布（记日志，预览字段留空）。
"""

import logging

from apps.common.services.storage import StorageService
from apps.outline.models import BidWordTemplate, BidWordTemplateVersion
from apps.outline.services.onlyoffice.conversion_service import (
    ConversionError,
    build_version_file_url,
    convert_document,
)

logger = logging.getLogger(__name__)

PNG_CONTENT_TYPE = "image/png"
PDF_CONTENT_TYPE = "application/pdf"


def build_preview_keys(template: BidWordTemplate, version_no: int) -> tuple[str, str]:
    base = f"bid-templates/{template.scope_type}/{template.id}/preview"
    return f"{base}/v{version_no}-cover.png", f"{base}/v{version_no}-preview.pdf"


def generate_previews(
    template: BidWordTemplate, version: BidWordTemplateVersion
) -> None:
    """为发布版本生成预览图和预览 PDF（best-effort）。"""
    storage = StorageService()
    cover_key, pdf_key = build_preview_keys(template, version.version_no)
    file_url = build_version_file_url(template.id, version.id)
    cache_key = f"tpl-{template.id}-v{version.version_no}-{version.file_hash[:12]}"

    update_fields = []

    try:
        png = convert_document(
            file_url, key=f"{cache_key}-png", outputtype="png",
            title=version.file_name,
        )
        storage.put_object(cover_key, png, content_type=PNG_CONTENT_TYPE)
        version.preview_image_key = cover_key
        update_fields.append("preview_image_key")
    except ConversionError as exc:
        logger.warning(
            f"Template preview png failed: template_id={template.id}, {exc}"
        )
    except Exception:
        logger.exception(
            f"Template preview png unexpected error: template_id={template.id}"
        )

    try:
        pdf = convert_document(
            file_url, key=f"{cache_key}-pdf", outputtype="pdf",
            title=version.file_name,
        )
        storage.put_object(pdf_key, pdf, content_type=PDF_CONTENT_TYPE)
        version.preview_pdf_key = pdf_key
        update_fields.append("preview_pdf_key")
    except ConversionError as exc:
        logger.warning(
            f"Template preview pdf failed: template_id={template.id}, {exc}"
        )
    except Exception:
        logger.exception(
            f"Template preview pdf unexpected error: template_id={template.id}"
        )

    if update_fields:
        version.save(update_fields=update_fields + ["updated_at"])
