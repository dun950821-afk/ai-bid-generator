"""招标文件测试 fixtures。"""

import pytest

from apps.tender.models import TenderFile


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