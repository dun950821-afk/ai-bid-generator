"""doc → docx 转换服务（复用 ONLYOFFICE Document Server）。

ONLYOFFICE 已随 docker compose 部署（8082 端口），其 ConvertService.ashx
可将旧版 DOC 转为 DOCX，转换结果可直接复用 DocxParser 解析。
"""

import json
import logging
import time
import uuid
from urllib import request

import hmac
import hashlib
import base64

from django.conf import settings

from apps.common.services.storage import StorageService

logger = logging.getLogger(__name__)

# ONLYOFFICE ConvertService.ashx 错误码 → 用户可见中文提示（官方码表）
_ERROR_MESSAGES = {
    "-5": "文件已加密，请取消加密后（Word/WPS 另存为普通 DOCX）再上传",
    "-4": "文件下载失败，请确认文件完整后重试",
    "-8": "ONLYOFFICE 转换服务配置错误，请联系管理员",
}


class DocConversionError(Exception):
    """doc 转换失败。message 为中文提示。"""


def _b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def _make_jwt(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing = _b64url(json.dumps(header, separators=(",", ":")).encode())
    signing += b"." + _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), signing, hashlib.sha256).digest()
    return (signing + b"." + _b64url(sig)).decode()


class DocConverter:
    """把 DOC 字节流转换为 DOCX 字节流。"""

    def __init__(self, storage: StorageService | None = None):
        self.storage = storage or StorageService()

    def convert_doc_to_docx(self, content: bytes, filename: str) -> bytes:
        """转换 doc → docx。失败抛 DocConversionError（中文提示）。"""
        object_key = f"converted/{uuid.uuid4()}.doc"
        try:
            self._upload_tmp(object_key, content)
            result_url = self._request_conversion(object_key, filename)
            return self._download_result(result_url)
        except DocConversionError:
            raise
        except Exception as exc:
            logger.exception("doc conversion failed: %s", filename)
            # 不把底层异常（boto3/urllib 内部地址等）拼进用户可见消息
            raise DocConversionError("DOC 转换失败，请稍后重试或联系管理员") from exc
        finally:
            try:
                self.storage.remove_object(object_key)
            except Exception:
                pass

    def _upload_tmp(self, object_key: str, content: bytes) -> None:
        self.storage.put_object(object_key, content, "application/msword")

    def _request_conversion(self, object_key: str, filename: str) -> str:
        """调 ONLYOFFICE ConvertService.ashx，返回转换后文件 URL。"""
        public_url = (
            f"http://{settings.MINIO_PUBLIC_ENDPOINT}/"
            f"{settings.MINIO_BUCKET}/{object_key}"
        )
        payload = {
            "url": public_url,
            "outputtype": "docx",
            "filetype": "doc",
            "key": str(uuid.uuid4()),
            "title": filename,
        }
        token = _make_jwt(
            {
                "payload": payload,
                "iss": "ai-bid-generator",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
            },
            settings.ONLYOFFICE_JWT_SECRET,
        )
        req = request.Request(
            "http://onlyoffice-document-server/ConvertService.ashx",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        )
        with request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
        return self._parse_result(body)

    def _parse_result(self, body: str) -> str:
        """解析 ConvertService.ashx 的 XML 响应。"""
        import re

        error_match = re.search(r"<Error>(-?\d+)</Error>", body)
        if error_match and error_match.group(1) != "0":
            code = error_match.group(1)
            message = _ERROR_MESSAGES.get(code)
            if message is not None:
                raise DocConversionError(message)
            raise DocConversionError(f"ONLYOFFICE 转换失败（错误码 {code}）")
        url_match = re.search(r"<FileUrl>(.*?)</FileUrl>", body)
        if not url_match:
            raise DocConversionError("ONLYOFFICE 转换失败：响应缺少文件地址")
        return url_match.group(1)

    def _download_result(self, result_url: str) -> bytes:
        with request.urlopen(result_url, timeout=120) as resp:
            return resp.read()
