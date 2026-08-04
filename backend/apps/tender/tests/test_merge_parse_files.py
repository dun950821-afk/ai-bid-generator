"""merge_parse_files 任务测试。"""

from unittest.mock import patch

import pytest

from apps.common.models import AsyncTask
from apps.tender.models import TenderFile
from apps.tender.tasks import merge_parse_files


@pytest.mark.django_db
def test_merge_parse_files_success(tender_file, project, bid_manager_user, parsed_document):
    att = TenderFile.objects.create(
        project=project, original_name="tech.pdf", file_size=1024,
        content_type="application/pdf", object_key="tender/tech.pdf",
        status=TenderFile.STATUS_PARSE_PENDING, created_by=bid_manager_user,
    )
    task = AsyncTask.objects.create(
        task_type="tender_merge_parse", status=AsyncTask.STATUS_PENDING,
        related_object_type="TenderFile", related_object_id=str(tender_file.id),
        created_by=bid_manager_user,
    )

    with patch("apps.tender.tasks.MergeParseService.merge",
               return_value=(parsed_document, {"文件：tech.pdf（附件）": att})):
        with patch("apps.tender.tasks.ChunkService") as ChunkMock:
            chunk_service = ChunkMock.return_value
            chunk_service.chunk.return_value = []
            merge_parse_files(task.id, tender_file.id, [att.id])

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_SUCCESS
    assert task.progress == 100
    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_CHUNKED
    att.refresh_from_db()
    assert att.status == TenderFile.STATUS_PARSED
    chunk_service.chunk.assert_called_once()
    # 不触发条款抽取：无 requirement_extraction_v2 相关副作用（任务内部不调用 extract）
    from apps.requirements.models import RequirementExtractionRun
    assert not RequirementExtractionRun.objects.filter(tender_file=tender_file).exists()


@pytest.mark.django_db
def test_merge_parse_files_failure_sets_parse_failed(tender_file, project, bid_manager_user):
    task = AsyncTask.objects.create(
        task_type="tender_merge_parse", status=AsyncTask.STATUS_PENDING,
        related_object_type="TenderFile", related_object_id=str(tender_file.id),
        created_by=bid_manager_user,
    )
    with patch("apps.tender.tasks.MergeParseService.merge",
               side_effect=RuntimeError("boom")):
        with pytest.raises(RuntimeError):
            merge_parse_files(task.id, tender_file.id, [])

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    assert "boom" in task.error_message
    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_PARSE_FAILED
