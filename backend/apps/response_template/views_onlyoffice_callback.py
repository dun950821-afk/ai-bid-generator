# -*- coding: utf-8 -*-
"""响应文件产物 ONLYOFFICE 回调。

与 outline 标书文档回调同一安全模型: JWT 强制校验 + SSRF 校验。
status=2(编辑完成)/status=6(forcesave) 时下载文件回写 MinIO 原 object_key,
并刷新文件大小/哈希(前端"下载"拿到的永远是最新校对版)。
"""

import json
import logging
from hashlib import sha256

import jwt
import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.outline.services.url_safety import is_safe_external_url
from apps.response_template.models import TenderResponseDocument

logger = logging.getLogger(__name__)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@csrf_exempt
@require_POST
def onlyoffice_response_callback(request, document_id):
    """响应文件产物 ONLYOFFICE 保存回调。"""
    try:
        try:
            data = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return JsonResponse({"error": 1, "message": "Invalid JSON"}, status=400)

        status_code = data.get("status")
        download_url = data.get("url")

        logger.info(
            "ONLYOFFICE response callback: document_id=%s, status=%s, key=%s",
            document_id, status_code, data.get("key"),
        )

        try:
            document = TenderResponseDocument.objects.get(id=document_id)
        except TenderResponseDocument.DoesNotExist:
            return JsonResponse({"error": 1, "message": "Document not found"}, status=404)

        # JWT 校验(强制: 缺失或失败一律 400)
        token = data.get("token")
        if not token:
            return JsonResponse({"error": 1, "message": "JWT token missing"}, status=400)
        try:
            jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            logger.warning(
                "ONLYOFFICE response callback: JWT validation failed: document_id=%s",
                document_id,
            )
            return JsonResponse({"error": 1, "message": "JWT validation failed"}, status=400)

        if status_code in (2, 6):
            if download_url and document.object_key:
                _download_and_save(document, download_url)
                logger.info(
                    "ONLYOFFICE response callback: saved, document_id=%s, size=%s",
                    document_id, document.file_size,
                )
            else:
                logger.warning(
                    "ONLYOFFICE response callback: status=%s but no url/object_key: %s",
                    status_code, document_id,
                )
        else:
            logger.info(
                "ONLYOFFICE response callback: unhandled status=%s: %s",
                status_code, document_id,
            )

        return JsonResponse({"error": 0})

    except Exception as exc:
        logger.exception(
            "ONLYOFFICE response callback failed: document_id=%s", document_id,
        )
        return JsonResponse({"error": 1, "message": str(exc)})


def _download_and_save(document: TenderResponseDocument, download_url: str):
    """从 ONLYOFFICE 下载校对后的文件, 回写 MinIO 原 object_key。"""
    from apps.common.services.storage import StorageService

    if not is_safe_external_url(download_url):
        logger.warning(
            "ONLYOFFICE response callback: blocked unsafe URL: document_id=%s",
            document.id,
        )
        raise ValueError("Unsafe download URL blocked by SSRF protection")

    response = requests.get(download_url, timeout=60)
    response.raise_for_status()
    content = response.content

    StorageService().put_object(document.object_key, content, DOCX_MIME)
    document.file_size = len(content)
    document.file_hash = sha256(content).hexdigest()
    document.save(update_fields=["file_size", "file_hash", "updated_at"])
