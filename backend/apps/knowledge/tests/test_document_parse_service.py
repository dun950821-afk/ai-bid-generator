# backend/apps/knowledge/tests/test_document_parse_service.py
"""知识库文档解析：格式支持与白名单一致性测试。"""

import io

import pytest

from apps.common.exceptions import ValidationError
from apps.knowledge.constants import ALLOWED_FILE_EXTENSIONS
from apps.knowledge.services.document_parse_service import DocumentParseService
from apps.knowledge.services.document_service import DocumentService


def _make_docx_bytes() -> bytes:
    """生成含一段文字的 DOCX 文件字节。"""
    from docx import Document

    doc = Document()
    doc.add_paragraph("招标文件中的资格要求段落")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


class TestDocExtension:
    def test_doc_parses_via_doc_converter(self, monkeypatch):
        """.doc 应通过 DocConverter 转 DOCX 后解析，而非按文本乱码解析。"""
        docx_bytes = _make_docx_bytes()

        def fake_convert(self, content, filename):
            assert filename.endswith(".doc")
            return docx_bytes

        monkeypatch.setattr(
            "apps.common.services.doc_converter.DocConverter.convert_doc_to_docx",
            fake_convert,
        )

        result = DocumentParseService()._do_parse(b"\xd0\xcf\x11\xe0(binary", "招标文件.doc", "doc")

        assert result["parse_engine"] == "docx-python-docx"
        assert "资格要求" in result["markdown"]

    def test_docx_parses_directly(self):
        """.docx 直接解析（不经过转换）。"""
        result = DocumentParseService()._do_parse(_make_docx_bytes(), "文件.docx", "docx")
        assert result["parse_engine"] == "docx-python-docx"
        assert "资格要求" in result["markdown"]

    def test_markdown_extension_parses_as_text(self):
        """.markdown 别名应并入文本解析分支。"""
        result = DocumentParseService()._do_parse("# 标题\n正文".encode("utf-8"), "文件.markdown", "markdown")
        assert result["parse_engine"] == "text"
        assert "# 标题" in result["markdown"]


class TestAllowedExtensionsConsistency:
    """白名单内的扩展名必须有对应解析分支；无解析器的格式不得入白名单。"""

    PARSED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "md", "markdown"}

    def test_whitelist_subset_of_parsed_extensions(self):
        unexpected = ALLOWED_FILE_EXTENSIONS - self.PARSED_EXTENSIONS
        assert not unexpected, f"白名单包含无解析器的格式: {unexpected}"

    def test_xls_rejected(self):
        service = DocumentService()
        for ext in ("xls", "xlsx", "ppt", "pptx"):
            with pytest.raises(ValidationError):
                service._validate_file_type(f"文件.{ext}", "application/octet-stream")

    def test_doc_still_accepted(self):
        DocumentService()._validate_file_type("文件.doc", "application/octet-stream")
