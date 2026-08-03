"""ParseService 测试。"""

import io
import zipfile

import pytest
from unittest.mock import patch, MagicMock

from apps.tender.constants import PARSER_VERSION, ParseQuality
from apps.tender.models import ParsedDocument
from apps.tender.services.parse_service import ParseService
from apps.tender.services.parsers.base import ParseResult


def make_min_docx(text: str) -> bytes:
    """构造最小合法 docx（zip 含 [Content_Types].xml 与 word/document.xml）。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
        # python-docx 打开包时必须能在 _rels/.rels 找到 officeDocument 关系
        z.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="word/document.xml"/>'
            "</Relationships>",
        )
        z.writestr(
            "word/document.xml",
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()


@pytest.mark.django_db
class TestParseService:
    """ParseService 测试。"""

    def test_parse_creates_parsed_document(self, tender_file):
        """测试解析创建 ParsedDocument。"""
        service = ParseService()

        with patch.object(service, '_compute_input_hash', return_value='input_hash_123'):
            with patch.object(service, '_upload_to_minio', return_value='tender/1.md'):
                parsed_doc = service.parse(tender_file)

        assert parsed_doc.id is not None
        assert parsed_doc.tender_file == tender_file
        assert parsed_doc.is_active is True
        assert parsed_doc.parse_engine == "mock"
        assert parsed_doc.parser_version == PARSER_VERSION

    def test_parse_activates_new_document(self, tender_file):
        """测试解析激活新文档（关闭旧文档）。"""
        service = ParseService()

        # 创建旧的活跃文档
        old_doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=True,
            markdown_uri="old.md",
            parse_engine="mock",
            parser_version="v0",
            parse_quality=ParseQuality.HIGH,
        )

        with patch.object(service, '_compute_input_hash', return_value='new_hash'):
            with patch.object(service, '_upload_to_minio', return_value='new.md'):
                new_doc = service.parse(tender_file)

        old_doc.refresh_from_db()
        assert old_doc.is_active is False
        assert new_doc.is_active is True

    def test_compute_input_hash(self, tender_file):
        """测试计算输入哈希。"""
        service = ParseService()

        with patch('apps.tender.services.parse_service.StorageService') as MockStorage:
            mock_storage = MagicMock()
            mock_storage.get_object.return_value = b'test content'
            MockStorage.return_value = mock_storage

            hash_value = service._compute_input_hash(tender_file)
            assert len(hash_value) == 64  # SHA256 hex

    def test_compute_output_hash(self):
        """测试计算输出哈希。"""
        service = ParseService()
        hash_value = service._compute_output_hash("test markdown content")
        assert len(hash_value) == 64

    def test_generate_mock_markdown(self, tender_file):
        """测试生成 Mock Markdown。"""
        service = ParseService()
        markdown = service._generate_mock_markdown(tender_file)
        assert len(markdown) > 0
        assert "# 第一章" in markdown

    def test_parse_doc_uses_converter(self, parsed_document, monkeypatch):
        """doc 文件应经 DocConverter 转 docx 后走 DocxParser。

        注意：parse_service 的 doc 分支在函数内
        `from apps.common.services.doc_converter import DocConverter`，
        因此必须 patch 源模块属性（而非 parse_service 模块属性）。
        """
        from apps.tender.services.parse_service import ParseService

        service = ParseService()
        doc_bytes = b"\xd0\xcf\x11\xe0 fake doc"
        fake_docx = make_min_docx("测试文档内容")
        called = {}

        class FakeConverter:
            def convert_doc_to_docx(self, content, filename):
                called["content"] = content
                called["filename"] = filename
                return fake_docx

        fake_converter = FakeConverter()

        monkeypatch.setattr(
            "apps.common.services.doc_converter.DocConverter",
            lambda *a, **kw: fake_converter,
        )

        result = service._do_parse(doc_bytes, "招标文件.doc")

        assert called["content"] == doc_bytes
        assert called["filename"] == "招标文件.doc"
        assert isinstance(result, ParseResult)
        # DocxParser 真实解析转换产物
        assert "测试文档内容" in result.markdown