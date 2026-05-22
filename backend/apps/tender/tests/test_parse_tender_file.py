"""parse_tender_file 异常处理回归（M1 修复）。"""
import pytest

from apps.common.models import AsyncTask
from apps.projects.models import ProjectMember
from apps.tender.models import TenderFile
from apps.tender.tasks import parse_tender_file


@pytest.fixture
def _ready_for_parse(normal_user, project):
    ProjectMember.objects.create(project=project, user=normal_user, project_role="owner")
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
def test_parse_tender_file_happy_path(_ready_for_parse):
    task, tender_file = _ready_for_parse
    parse_tender_file(task.id, tender_file.id)

    task.refresh_from_db()
    tender_file.refresh_from_db()
    assert task.status == AsyncTask.STATUS_SUCCESS
    assert task.progress == 100
    assert tender_file.status == TenderFile.STATUS_PARSED


@pytest.mark.django_db
def test_parse_tender_file_exception_marks_failed(_ready_for_parse, monkeypatch):
    """解析过程抛错时，AsyncTask 和 TenderFile 都应落到失败态。

    回归：原实现没有 try/except，异常会让 AsyncTask 卡在 running、
    TenderFile 卡在 parsing，前端无法识别失败，无法重试。
    """
    task, tender_file = _ready_for_parse

    original_save = TenderFile.save
    call_count = {"n": 0}

    def flaky_save(self, *args, **kwargs):
        call_count["n"] += 1
        # 第二次写（status=PARSING 之后那次）触发异常，模拟解析中途失败
        if call_count["n"] == 2:
            raise RuntimeError("simulated parse error")
        return original_save(self, *args, **kwargs)

    monkeypatch.setattr(TenderFile, "save", flaky_save)

    with pytest.raises(RuntimeError):
        parse_tender_file(task.id, tender_file.id)

    # 恢复原 save 以便后续 refresh_from_db 后的 save 不再抛
    monkeypatch.setattr(TenderFile, "save", original_save)

    task.refresh_from_db()
    tender_file.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    assert "simulated parse error" in task.error_message
    assert tender_file.status == TenderFile.STATUS_PARSE_FAILED
