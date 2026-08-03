# backend/apps/tender/tests/test_tender_tasks.py
"""招标文件流水线任务测试。"""

import pytest

from apps.common.models import AsyncTask
from apps.projects.models import Project
from apps.tender.models import TenderFile, ParsedDocument


def _make_file(db) -> TenderFile:
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(username="tester", password="x")
    project = Project.objects.create(name="测试项目", created_by=user)
    return TenderFile.objects.create(
        project=project,
        original_name="招标文件.pdf",
        file_size=1024,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/1/original.pdf",
        status=TenderFile.STATUS_PARSING,
        created_by=user,
    )


@pytest.mark.django_db
def test_chunk_trigger_extract_with_overwrite_true(monkeypatch, db):
    """自动链路触发条款抽取时必须覆盖旧条款。

    重新解析同一文件时内容不变，requirement_key 去重会跳过全部旧条款，
    overwrite=False 导致条款永远不随新提示词版本更新。
    """
    from apps.tender.tasks import chunk_parsed_document

    tender_file = _make_file(db)
    parsed_doc = ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        markdown_uri="tender/1.md",
        page_count=10,
    )
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_RUNNING,
        related_object_type="TenderFile",
        related_object_id=str(tender_file.id),
    )

    monkeypatch.setattr("apps.tender.tasks.ChunkService", lambda: type(
        "FakeChunkService", (), {"chunk": lambda self, doc: []})())
    captured = {}

    def fake_delay(task_id, tender_file_id, options):
        captured["task_id"] = task_id
        captured["tender_file_id"] = tender_file_id
        captured["options"] = options

    monkeypatch.setattr(
        "apps.requirements.tasks.extract_requirements_v2.delay", fake_delay
    )

    chunk_parsed_document.run(task.id, parsed_doc.id)

    assert captured["task_id"] == task.id
    assert captured["tender_file_id"] == tender_file.id
    assert captured["options"]["overwrite"] is True
    assert captured["options"]["extraction_types"] == [
        "scoring", "mandatory", "qualification",
        "commercial", "technical", "submission",
    ]
