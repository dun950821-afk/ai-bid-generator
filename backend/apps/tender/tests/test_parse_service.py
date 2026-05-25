"""ParseService 测试。"""

import pytest
from unittest.mock import patch, MagicMock

from apps.tender.constants import PARSER_VERSION, ParseQuality
from apps.tender.models import ParsedDocument
from apps.tender.services.parse_service import ParseService


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