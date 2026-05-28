"""parse_tender_file 异常处理回归（M1 修复）。"""
import pytest
from unittest.mock import patch, MagicMock

from apps.common.models import AsyncTask
from apps.projects.models import ProjectMember
from apps.projects.services.role_service import RoleService
from apps.tender.models import TenderFile, ParsedDocument
from apps.tender.tasks import parse_tender_file


@pytest.fixture
def _ready_for_parse(normal_user, project):
    roles = RoleService.initialize_builtin_roles(project)
    owner_role = next(r for r in roles if r.code == "owner")
    ProjectMember.objects.create(project=project, user=normal_user, project_role=owner_role)
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_PENDING,
        progress=0,
        current_step="等待解析",
        created_by=normal_user,
    )
    tender_file = TenderFile.objects.create(
        project=project,
        original_name="招标文件.pdf",
        file_size=1024,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/1/original.pdf",
        status=TenderFile.STATUS_PARSE_PENDING,
        parse_task=task,
        created_by=normal_user,
    )
    return task, tender_file


@pytest.mark.django_db
@patch("apps.tender.tasks.StorageService")
@patch("apps.tender.tasks.ParseService")
@patch("apps.tender.tasks.chunk_parsed_document")
def test_parse_tender_file_happy_path(
    mock_chunk_task, mock_parse_service_class, mock_storage_class, _ready_for_parse
):
    task, tender_file = _ready_for_parse

    # Mock storage
    mock_storage = MagicMock()
    mock_storage_class.return_value = mock_storage
    mock_storage.get_object.return_value = b"test file content"
    mock_storage.put_object.return_value = None

    # Create a real ParsedDocument for the mock to return
    mock_parsed_doc = ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        markdown_uri="parsed/1/document.md",
        page_count=1,
        parse_engine="mock",
        parser_version="mock-v1",
        parse_quality="high",
        input_hash="abc123",
        output_hash="def456",
    )

    # Mock ParseService to return our ParsedDocument
    mock_parser = MagicMock()
    mock_parse_service_class.return_value = mock_parser
    mock_parser.parse.return_value = mock_parsed_doc

    parse_tender_file(task.id, tender_file.id)

    task.refresh_from_db()
    tender_file.refresh_from_db()
    assert task.status == AsyncTask.STATUS_SUCCESS
    assert task.progress == 100
    assert tender_file.status == TenderFile.STATUS_PARSED


@pytest.mark.django_db
@patch("apps.tender.tasks.StorageService")
@patch("apps.tender.tasks.ParseService")
@patch("apps.tender.tasks.chunk_parsed_document")
def test_parse_tender_file_exception_marks_failed(
    mock_chunk_task, mock_parse_service_class, mock_storage_class, _ready_for_parse
):
    """解析过程抛错时，AsyncTask 和 TenderFile 都应落到失败态。

    回归：原实现没有 try/except，异常会让 AsyncTask 卡在 running、
    TenderFile 卡在 parsing，前端无法识别失败，无法重试。
    """
    task, tender_file = _ready_for_parse

    # Mock storage
    mock_storage = MagicMock()
    mock_storage_class.return_value = mock_storage
    mock_storage.get_object.return_value = b"test file content"

    # Mock ParseService to raise exception
    mock_parser = MagicMock()
    mock_parse_service_class.return_value = mock_parser
    mock_parser.parse.side_effect = RuntimeError("simulated parse error")

    with pytest.raises(RuntimeError):
        parse_tender_file(task.id, tender_file.id)

    task.refresh_from_db()
    tender_file.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    assert "simulated parse error" in task.error_message
    assert tender_file.status == TenderFile.STATUS_PARSE_FAILED
