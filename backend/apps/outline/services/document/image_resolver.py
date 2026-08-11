# backend/apps/outline/services/document/image_resolver.py
"""正文图片解析：把 Markdown 图片 URL 还原为图片字节。

章节编辑器插图（uploadEditorImage / 材料库插图）写入内容的是 URL：
- MINIO_PROXY 模式：/minio/{bucket}/{object_key}
- 直连模式：http(s)://{host}/{bucket}/{object_key}[?签名参数]

渲染时只认本系统 MinIO bucket 内的对象；外部 URL 不抓取
（避免 SSRF，方案安全要求），降级为占位文字。
"""

import logging
from typing import Optional
from urllib.parse import urlparse

from django.conf import settings

logger = logging.getLogger(__name__)


def extract_object_key(url: str) -> Optional[str]:
    """从图片 URL 中提取本系统 MinIO 对象键，非本系统 URL 返回 None。"""
    if not url:
        return None

    path = urlparse(url).path
    bucket = settings.MINIO_BUCKET

    # /minio/{bucket}/{key}（nginx 代理形式）
    proxy_prefix = f"/minio/{bucket}/"
    if path.startswith(proxy_prefix):
        return path[len(proxy_prefix):]

    # 直连形式：/{bucket}/{key}
    direct_prefix = f"/{bucket}/"
    if path.startswith(direct_prefix):
        return path[len(direct_prefix):]

    return None


def resolve_image_bytes(url: str) -> Optional[bytes]:
    """解析图片 URL 为字节，失败返回 None。"""
    from apps.common.services.storage import StorageService

    object_key = extract_object_key(url)
    if object_key is None:
        logger.warning(f"Image URL not in system bucket, skipped: {url[:120]}")
        return None
    try:
        return StorageService().get_object(object_key)
    except Exception as exc:
        logger.warning(f"Image resolve failed: {object_key}, {exc}")
        return None
