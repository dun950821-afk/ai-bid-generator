# backend/apps/outline/views_onlyoffice_callback.py
"""ONLYOFFICE Document Server 回调接口。"""

import json
import logging
import time

import requests
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.common.services.onlyoffice_jwt import (
    CallbackTokenError,
    verify_callback_body,
)
from apps.outline.models import BidDocument
from apps.outline.services.url_safety import is_safe_external_url, sanitize_filename

logger = logging.getLogger(__name__)


@csrf_exempt
@require_POST
def onlyoffice_callback(request, document_id):
    """ONLYOFFICE 回调接口。

    处理 ONLYOFFICE Document Server 的保存回调。

    状态说明：
    - status=2: 文档编辑完成，正在保存
    - status=6: 文档正在编辑，强制保存（forcesave）

    Args:
        request: HTTP 请求
        document_id: BidDocument ID

    Returns:
        JsonResponse: {"error": 0} 表示成功
    """
    try:
        # 解析请求体
        try:
            data = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            logger.error(f"ONLYOFFICE callback: invalid JSON body")
            return JsonResponse({"error": 1, "message": "Invalid JSON"}, status=400)

        status_code = data.get("status")
        download_url = data.get("url")

        # 记录完整日志
        logger.info(
            f"ONLYOFFICE callback: document_id={document_id}, status={status_code}, "
            f"url={download_url}, key={data.get('key')}"
        )

        # 校验 document_id 存在
        try:
            document = BidDocument.objects.get(id=document_id)
        except BidDocument.DoesNotExist:
            logger.error(f"ONLYOFFICE callback: document_id={document_id} not found")
            return JsonResponse({"error": 1, "message": "Document not found"}, status=404)

        # 更新回调状态
        document.last_callback_status = str(status_code)
        document.last_callback_payload = data

        # JWT 校验（F-12：验签 + payload 必须与 body 一致，防 token 重放投毒）
        try:
            verify_callback_body(data)
        except CallbackTokenError as e:
            logger.warning(
                f"ONLYOFFICE callback: token rejected: {e}, document_id={document_id}"
            )
            return JsonResponse(
                {"error": 1, "message": "JWT validation failed"},
                status=400,
            )

        # 处理不同状态
        if status_code == 2:
            # 编辑完成保存
            if download_url:
                _download_and_save(document, download_url)
                document.status = "saved"
                document.saved_at = timezone.now()
                # 生成新的 file_key
                document.file_key = (
                    f"outline-{document.outline_id}-v{document.version}-"
                    f"{int(time.time() * 1000)}"
                )
                document.version += 1
                logger.info(
                    f"ONLYOFFICE callback: document saved, document_id={document_id}, "
                    f"new_version={document.version}"
                )
            else:
                logger.warning(
                    f"ONLYOFFICE callback: status=2 but no download URL, "
                    f"document_id={document_id}"
                )

        elif status_code == 6:
            # 强制保存
            if download_url:
                _download_and_save(document, download_url)
                document.force_saved_at = timezone.now()
                logger.info(
                    f"ONLYOFFICE callback: force saved, document_id={document_id}"
                )
            else:
                logger.warning(
                    f"ONLYOFFICE callback: status=6 but no download URL, "
                    f"document_id={document_id}"
                )

        else:
            # 其他状态：只记录日志
            logger.info(
                f"ONLYOFFICE callback: unhandled status={status_code}, "
                f"document_id={document_id}"
            )

        document.save()
        return JsonResponse({"error": 0})

    except Exception as e:
        logger.exception(
            f"ONLYOFFICE callback failed: document_id={document_id}, error={str(e)}"
        )
        return JsonResponse({"error": 1, "message": str(e)})


def _download_and_save(document: BidDocument, download_url: str):
    """从 ONLYOFFICE 下载文件并保存到 BidDocument。

    Args:
        document: BidDocument 实例
        download_url: ONLYOFFICE 提供的下载 URL

    Raises:
        ValueError: URL 未通过 SSRF 校验
        requests.RequestException: 下载失败
    """
    # SSRF 校验：防止 ONLYOFFICE 被诱导访问内网
    if not is_safe_external_url(download_url):
        logger.warning(
            f"ONLYOFFICE callback: blocked unsafe URL, document_id={document.id}, "
            f"url={download_url}"
        )
        raise ValueError(f"Unsafe download URL blocked by SSRF protection")

    try:
        response = requests.get(download_url, timeout=60, allow_redirects=False)
        response.raise_for_status()

        # 清洗文件名，防止目录穿越
        raw_name = document.title or f"document_{document.id}.docx"
        filename = sanitize_filename(raw_name)

        # 保存到 MinIO
        document.save_file(response.content, filename)

        logger.info(
            f"Downloaded and saved document: id={document.id}, "
            f"size={len(response.content)} bytes, filename={filename}"
        )
    except requests.RequestException as e:
        logger.exception(
            f"Failed to download from ONLYOFFICE: url={download_url}, error={str(e)}"
        )
        raise


@csrf_exempt
@require_POST
def onlyoffice_template_callback(request, template_id):
    """ONLYOFFICE 模板回调接口。

    与标书文档回调同一安全模型：JWT 强制校验 + SSRF 校验。
    status=2：保存 draft 并自增修订号；status=6：仅覆盖 draft 内容。
    回调永远不产生业务版本（方案 §17/§18）。
    """
    from apps.outline.models import BidWordTemplate
    from apps.outline.services.template import template_service

    try:
        try:
            data = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            logger.error("ONLYOFFICE template callback: invalid JSON body")
            return JsonResponse({"error": 1, "message": "Invalid JSON"}, status=400)

        status_code = data.get("status")
        download_url = data.get("url")

        logger.info(
            f"ONLYOFFICE template callback: template_id={template_id}, "
            f"status={status_code}, key={data.get('key')}"
        )

        try:
            template = BidWordTemplate.objects.get(id=template_id)
        except BidWordTemplate.DoesNotExist:
            logger.error(
                f"ONLYOFFICE template callback: template_id={template_id} not found"
            )
            return JsonResponse({"error": 1, "message": "Template not found"}, status=404)

        # JWT 校验（F-12：验签 + payload 必须与 body 一致，防 token 重放投毒）
        try:
            verify_callback_body(data)
        except CallbackTokenError as e:
            logger.warning(
                f"ONLYOFFICE template callback: token rejected: {e}, "
                f"template_id={template_id}"
            )
            return JsonResponse(
                {"error": 1, "message": "JWT validation failed"}, status=400
            )

        if status_code in (2, 6):
            if download_url:
                content = _download_template_file(template_id, download_url)
                template_service.save_draft_content(
                    template, content, bump_revision=(status_code == 2)
                )
                logger.info(
                    f"ONLYOFFICE template callback: draft saved, "
                    f"template_id={template_id}, revision={template.draft_revision}"
                )
            else:
                logger.warning(
                    f"ONLYOFFICE template callback: status={status_code} but no "
                    f"download URL, template_id={template_id}"
                )
        else:
            logger.info(
                f"ONLYOFFICE template callback: unhandled status={status_code}, "
                f"template_id={template_id}"
            )

        return JsonResponse({"error": 0})

    except Exception as e:
        logger.exception(
            f"ONLYOFFICE template callback failed: template_id={template_id}, "
            f"error={str(e)}"
        )
        return JsonResponse({"error": 1, "message": str(e)})


def _download_template_file(template_id: int, download_url: str) -> bytes:
    """从 ONLYOFFICE 下载模板文件内容。

    Raises:
        ValueError: URL 未通过 SSRF 校验
        requests.RequestException: 下载失败
    """
    if not is_safe_external_url(download_url):
        logger.warning(
            f"ONLYOFFICE template callback: blocked unsafe URL, "
            f"template_id={template_id}, url={download_url}"
        )
        raise ValueError("Unsafe download URL blocked by SSRF protection")

    response = requests.get(download_url, timeout=60, allow_redirects=False)
    response.raise_for_status()
    return response.content
