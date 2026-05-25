"""ParsedDocument 模型测试。"""

import pytest
from django.db import IntegrityError, transaction

from apps.tender.constants import ParseQuality
from apps.tender.models import ParsedDocument, TenderFile


@pytest.mark.django_db
class TestParsedDocument:
    """ParsedDocument 模型测试。"""

    def test_create_parsed_document(self, tender_file):
        """测试创建解析文档。"""
        doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=True,
            markdown_uri="tender/1.md",
            page_count=50,
            parse_engine="mock",
            parser_version="mock-parser-v1",
            parse_quality=ParseQuality.HIGH,
            input_hash="abc123",
            output_hash="def456",
        )
        assert doc.id is not None
        assert doc.is_active is True

    def test_unique_active_per_tender_file(self, tender_file):
        """测试同一 TenderFile 只能有一个 active ParsedDocument。"""
        doc1 = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=True,
            markdown_uri="tender/1.md",
            page_count=50,
            parse_engine="mock",
            parser_version="v1",
            parse_quality=ParseQuality.HIGH,
        )
        assert doc1.is_active is True

        # 尝试创建第二个 active 文档应该失败
        with pytest.raises(IntegrityError):
            ParsedDocument.objects.create(
                tender_file=tender_file,
                is_active=True,
                markdown_uri="tender/2.md",
                page_count=50,
                parse_engine="mock",
                parser_version="v2",
                parse_quality=ParseQuality.HIGH,
            )

    def test_multiple_versions_same_file(self, tender_file):
        """测试同一文件可以有多个非 active 版本。"""
        ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=True,
            markdown_uri="tender/1.md",
            page_count=50,
            parse_engine="mock",
            parser_version="v1",
            parse_quality=ParseQuality.HIGH,
            input_hash="hash1",
        )
        # 可以创建另一个非 active 版本
        doc2 = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=False,
            markdown_uri="tender/2.md",
            page_count=50,
            parse_engine="mock",
            parser_version="v2",
            parse_quality=ParseQuality.HIGH,
            input_hash="hash2",
        )
        assert doc2.id is not None

    def test_activate_parsed_document(self, tender_file):
        """测试切换活跃版本（事务保护）。"""
        doc1 = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=True,
            markdown_uri="tender/1.md",
            page_count=50,
            parse_engine="mock",
            parser_version="v1",
            parse_quality=ParseQuality.HIGH,
            input_hash="hash1",
        )
        doc2 = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=False,
            markdown_uri="tender/2.md",
            page_count=50,
            parse_engine="mock",
            parser_version="v2",
            parse_quality=ParseQuality.HIGH,
            input_hash="hash2",
        )

        # 切换活跃版本
        with transaction.atomic():
            ParsedDocument.objects.filter(
                tender_file=tender_file
            ).update(is_active=False)
            doc2.is_active = True
            doc2.save(update_fields=["is_active", "updated_at"])

        doc1.refresh_from_db()
        doc2.refresh_from_db()
        assert doc1.is_active is False
        assert doc2.is_active is True

    def test_parsed_document_str(self, tender_file):
        """测试字符串表示。"""
        doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=True,
            markdown_uri="tender/1.md",
            page_count=50,
            parse_engine="mock",
            parser_version="v1",
            parse_quality=ParseQuality.HIGH,
        )
        assert str(doc) == f"ParsedDocument#{doc.id} ({tender_file.original_name})"