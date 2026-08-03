"""DocConverter 测试（mock HTTP，不依赖真实 ONLYOFFICE）。"""
import pytest
from unittest.mock import Mock, patch

from apps.common.services.doc_converter import (
    DocConverter,
    DocConversionError,
)


@pytest.fixture
def converter():
    return DocConverter()


class _FakeResponse:
    """urlopen 返回的伪响应：支持 with 上下文，read() 返回固定字节。"""

    def __init__(self, status: int, body: bytes):
        self.status = status
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self._body


class TestConvertDocToDocx:
    def test_success(self, converter):
        doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
        # 转换成功：上传 -> HTTP 返回 FileUrl -> 下载 docx
        with patch(
            "urllib.request.urlopen",
            return_value=_FakeResponse(
                200,
                b"<FileResult><FileUrl>http://onlyoffice/cache/out.docx</FileUrl></FileResult>",
            ),
        ), \
             patch.object(converter, "_upload_tmp", return_value="converted/x.doc"), \
             patch.object(converter, "_download_result", return_value=b"PK\x03\x04 fake docx"):
            result = converter.convert_doc_to_docx(doc_bytes, "招标文件.doc")
        assert result.startswith(b"PK")

    def test_encrypted_file_error(self, converter):
        doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
        with patch(
            "urllib.request.urlopen",
            return_value=_FakeResponse(200, b"<FileResult><Error>-20</Error></FileResult>"),
        ), \
             patch.object(converter, "_upload_tmp", return_value="converted/x.doc"):
            with pytest.raises(DocConversionError) as exc_info:
                converter.convert_doc_to_docx(doc_bytes, "招标文件.doc")
        assert "加密" in str(exc_info.value)

    def test_http_error(self, converter):
        doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
        with patch("urllib.request.urlopen", side_effect=Exception("connection refused")), \
             patch.object(converter, "_upload_tmp", return_value="converted/x.doc"):
            with pytest.raises(DocConversionError):
                converter.convert_doc_to_docx(doc_bytes, "招标文件.doc")
