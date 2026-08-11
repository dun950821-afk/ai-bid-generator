# backend/apps/outline/services/onlyoffice/conversion_service.py
"""ONLYOFFICE Conversion API 封装（方案 §34/§54）。

复用现有 Document Server 做 DOCX → PDF / PNG（首页缩略图），
不引入 LibreOffice。

流程：POST {ds}/converter（JWT 签名）→ 返回 fileUrl → GET 下载字节。
file_url 必须对 Document Server 容器可达（走 ONLYOFFICE_PUBLIC_BASE_URL
+ 后端 JWT 代理端点，与编辑器 document.url 同一机制）。
"""

import logging
import time

import jwt
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class ConversionError(Exception):
    """转换失败。"""


def convert_document(
    file_url: str,
    key: str,
    outputtype: str,
    title: str = "document.docx",
    filetype: str = "docx",
    timeout: int = 120,
) -> bytes:
    """把 file_url 指向的文档转换为目标格式，返回转换结果字节。

    Args:
        file_url: 文档下载地址（须对 Document Server 可达）
        key: 转换缓存 key（同一文件同一输出格式应保持一致）
        outputtype: 目标格式（pdf / png ...）
        title: 文件名
        filetype: 源格式

    Raises:
        ConversionError: 转换失败或下载失败
    """
    payload = {
        "async": False,
        "filetype": filetype,
        "key": key,
        "outputtype": outputtype,
        "title": title,
        "url": file_url,
    }
    token = jwt.encode(payload, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
    payload["token"] = token

    convert_url = f"{settings.ONLYOFFICE_DOCUMENT_SERVER_URL.rstrip('/')}/converter"
    try:
        response = requests.post(
            convert_url,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ConversionError(f"ONLYOFFICE 转换请求失败：{exc}") from exc

    if result.get("error"):
        raise ConversionError(f"ONLYOFFICE 转换返回错误码：{result['error']}")
    if not result.get("endConvert") or not result.get("fileUrl"):
        raise ConversionError(f"ONLYOFFICE 转换未完成：{result}")

    try:
        download = requests.get(result["fileUrl"], timeout=timeout)
        download.raise_for_status()
    except requests.RequestException as exc:
        raise ConversionError(f"转换结果下载失败：{exc}") from exc

    logger.info(
        f"ONLYOFFICE conversion ok: outputtype={outputtype}, "
        f"size={len(download.content)}"
    )
    return download.content


def build_version_file_url(template_id: int, version_id: int) -> str:
    """构造模板版本文件的 JWT 代理下载地址（供 Conversion API 抓取）。"""
    token = jwt.encode(
        {
            "template_id": template_id,
            "version_id": version_id,
            "exp": int(time.time()) + 3600,
        },
        settings.ONLYOFFICE_JWT_SECRET,
        algorithm="HS256",
    )
    return (
        f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
        f"/api/bid-word-templates/{template_id}/file/?token={token}"
    )
