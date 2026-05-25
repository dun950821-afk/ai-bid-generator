"""招标文件测试 fixtures。"""

import pytest

from apps.tender.models import TenderFile, ParsedDocument


@pytest.fixture
def tender_file(project, bid_manager_user):
    """创建测试招标文件。"""
    return TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024 * 1024,
        content_type="application/pdf",
        object_key="tender/test.pdf",
        status=TenderFile.STATUS_PARSED,
        created_by=bid_manager_user,
    )


@pytest.fixture
def parsed_document(tender_file):
    """创建测试解析文档。"""
    return ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        markdown_uri="tender/1.md",
        page_count=10,
        parse_engine="mock",
        parser_version="mock-parser-v1",
        parse_quality="high",
        input_hash="abc123",
        output_hash="def456",
    )