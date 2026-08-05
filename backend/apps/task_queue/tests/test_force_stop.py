"""force_stop_service 测试：矩阵/批量 GenerationTask、AsyncTask 联动收尾。"""

from unittest import mock

import pytest
from django.core.cache import cache

from apps.task_queue.services.force_stop_service import (
    FORCE_STOP_MESSAGE,
    AlreadyEndedError,
    force_stop_async_task,
    force_stop_generation_task,
)


@pytest.fixture
def user(django_user_model):
    return django_user_model.objects.create_user(username="force-stop-user", password="x")


@pytest.fixture
def tender_file(db, user):
    from apps.projects.models import Project
    from apps.tender.models import TenderFile

    project = Project.objects.create(name="强制结束测试项目", created_by=user)
    return TenderFile.objects.create(
        project=project,
        original_name="招标文件.pdf",
        object_key="force-stop/test.pdf",
        file_size=100,
        created_by=user,
    )


@pytest.fixture
def outline(db, user, tender_file):
    from apps.outline.constants import OutlineSource
    from apps.outline.models import Outline
    from apps.projects.models import Lot

    lot = Lot.objects.create(project=tender_file.project, name="强制结束测试标段")
    return Outline.objects.create(
        project=tender_file.project,
        lot=lot,
        name="强制结束测试大纲",
        source=OutlineSource.MANUAL,
        created_by=user,
    )


# ==================== GenerationTask: matrix ====================


@pytest.mark.django_db
def test_force_stop_matrix_task(outline, user):
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Section

    section = Section.objects.create(
        outline=outline,
        title="第一章",
        level=1,
        sort_order=1,
        content_matrix_status=ContentMatrixStatus.GENERATING,
    )
    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.RUNNING,
        celery_task_id="celery-matrix-1",
        created_by=user,
    )

    with mock.patch("config.celery.app.control.revoke") as revoke:
        result = force_stop_generation_task(task.id, user=user)

    revoke.assert_called_once_with("celery-matrix-1", terminate=True, signal="SIGKILL")
    assert result["success"] is True
    assert result["status"] == GenerationTaskStatus.FAILED

    task.refresh_from_db()
    assert task.status == GenerationTaskStatus.FAILED
    assert task.force_stopped is True
    assert task.force_stopped_at is not None
    assert task.error_message == FORCE_STOP_MESSAGE
    assert task.finished_at is not None

    section.refresh_from_db()
    assert section.content_matrix_status == ContentMatrixStatus.PENDING
    assert section.content_matrix_error == FORCE_STOP_MESSAGE


@pytest.mark.django_db
def test_force_stop_matrix_releases_lock(outline, user):
    """SIGKILL 后任务 finally 不执行，必须显式释放矩阵锁。"""
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Section

    Section.objects.create(outline=outline, title="第一章", level=1, sort_order=1)
    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.RUNNING,
        created_by=user,
    )
    cache.set(f"matrix_gen_lock:{outline.id}", "1")

    with mock.patch("config.celery.app.control.revoke"):
        force_stop_generation_task(task.id, user=user)

    assert cache.get(f"matrix_gen_lock:{outline.id}") is None


@pytest.mark.django_db
def test_force_stop_matrix_revoke_failure_does_not_block(outline, user):
    """revoke 异常不阻断 DB 收尾。"""
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Section

    section = Section.objects.create(
        outline=outline,
        title="第一章",
        level=1,
        sort_order=1,
        content_matrix_status=ContentMatrixStatus.GENERATING,
    )
    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.RUNNING,
        celery_task_id="celery-matrix-2",
        created_by=user,
    )

    with mock.patch(
        "config.celery.app.control.revoke", side_effect=RuntimeError("worker unreachable")
    ):
        result = force_stop_generation_task(task.id, user=user)

    assert result["success"] is True
    assert result["revoked"] is False
    task.refresh_from_db()
    assert task.force_stopped is True
    section.refresh_from_db()
    assert section.content_matrix_status == ContentMatrixStatus.PENDING


# ==================== GenerationTask: batch ====================


@pytest.mark.django_db
def test_force_stop_batch_task_cancels_items(outline, user):
    """批量任务必须置 CANCELLED（_finalize_batch_task 对 CANCELLED early-return）。"""
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import BatchGenerationTaskItem, GenerationTask, Section

    section = Section.objects.create(outline=outline, title="第一章", level=1, sort_order=1)
    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.RUNNING,
        celery_task_id="celery-batch-1",
        created_by=user,
    )
    running_item = BatchGenerationTaskItem.objects.create(
        task=task, section=section, status="running", sort_index=0
    )
    done_item = BatchGenerationTaskItem.objects.create(
        task=task, section=section, status="completed", sort_index=1
    )

    with mock.patch("config.celery.app.control.revoke"):
        result = force_stop_generation_task(task.id, user=user)

    assert result["status"] == GenerationTaskStatus.CANCELLED
    task.refresh_from_db()
    assert task.status == GenerationTaskStatus.CANCELLED
    assert task.force_stopped is True

    running_item.refresh_from_db()
    assert running_item.status == "cancelled"
    assert running_item.finished_at is not None
    done_item.refresh_from_db()
    assert done_item.status == "completed"


@pytest.mark.django_db
def test_force_stop_terminal_task_conflict(outline, user):
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask

    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.COMPLETED,
        created_by=user,
    )

    with pytest.raises(AlreadyEndedError):
        force_stop_generation_task(task.id, user=user)


@pytest.mark.django_db
def test_force_stop_already_force_stopped_conflict(outline, user):
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask

    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.RUNNING,
        force_stopped=True,
        created_by=user,
    )

    with pytest.raises(AlreadyEndedError):
        force_stop_generation_task(task.id, user=user)


# ==================== AsyncTask ====================


@pytest.mark.django_db
def test_force_stop_async_parse_task_reclaims_tender_file(tender_file, user):
    from apps.requirements.models import RequirementExtractionRun
    from apps.tender.constants import PipelineStatus
    from apps.tender.models import PipelineJob, TenderFile

    task = _async_task(user, "TenderFile", tender_file.id, "tender_parse")
    tender_file.status = TenderFile.STATUS_PARSING
    tender_file.save(update_fields=["status"])
    run = RequirementExtractionRun.objects.create(
        tender_file=tender_file,
        project=tender_file.project,
        async_task=task,
        status="running",
        extraction_types=["scoring"],
        created_by=user,
    )
    job = PipelineJob.objects.create(
        tender_file=tender_file,
        stage="parse",
        status=PipelineStatus.RUNNING,
        version="1.0",
    )

    with mock.patch("config.celery.app.control.revoke"):
        result = force_stop_async_task(task.id, user=user)

    assert result["success"] is True
    task.refresh_from_db()
    assert task.status == "cancelled"
    assert task.force_stopped is True

    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_PARSE_FAILED
    assert tender_file.error_message == FORCE_STOP_MESSAGE
    run.refresh_from_db()
    assert run.status == "failed"
    job.refresh_from_db()
    assert job.status == PipelineStatus.FAILED


@pytest.mark.django_db
def test_force_stop_async_outline_task_deletes_when_no_sections(outline, user):
    task = _async_task(user, "Outline", outline.id, "outline_generate")
    from apps.outline.constants import OutlineStatus

    outline.status = OutlineStatus.GENERATING
    outline.save(update_fields=["status"])

    with mock.patch("config.celery.app.control.revoke"):
        force_stop_async_task(task.id, user=user)

    from apps.outline.models import Outline

    assert not Outline.objects.filter(pk=outline.pk).exists()


@pytest.mark.django_db
def test_force_stop_async_outline_task_keeps_draft_when_has_sections(outline, user):
    from apps.outline.constants import OutlineStatus
    from apps.outline.models import Outline, Section

    Section.objects.create(outline=outline, title="第一章", level=1, sort_order=1)
    outline.status = OutlineStatus.GENERATING
    outline.save(update_fields=["status"])
    task = _async_task(user, "Outline", outline.id, "outline_generate")

    with mock.patch("config.celery.app.control.revoke"):
        force_stop_async_task(task.id, user=user)

    outline.refresh_from_db()
    assert outline.status == OutlineStatus.DRAFT


@pytest.mark.django_db
def test_force_stop_async_section_task_reclaims_record(outline, user):
    from apps.outline.constants import (
        ContentGenerationStatus,
        GenerationRecordStatus,
        SectionGenerationStatus,
    )
    from apps.outline.models import Section, SectionGenerationRecord

    section = Section.objects.create(
        outline=outline,
        title="第一章",
        level=1,
        sort_order=1,
        generation_status=SectionGenerationStatus.RUNNING,
        content_generation_status=ContentGenerationStatus.RUNNING,
    )
    task = _async_task(user, "Section", section.id, "section_generate")
    record = SectionGenerationRecord.objects.create(
        section=section,
        async_task=task,
        status=GenerationRecordStatus.RUNNING,
        created_by=user,
    )

    with mock.patch("config.celery.app.control.revoke"):
        force_stop_async_task(task.id, user=user)

    section.refresh_from_db()
    assert section.generation_status == SectionGenerationStatus.FAILED
    assert section.content_generation_status == ContentGenerationStatus.FAILED
    assert section.content_generation_error == FORCE_STOP_MESSAGE
    record.refresh_from_db()
    assert record.status == GenerationRecordStatus.FAILED


@pytest.mark.django_db
def test_force_stop_async_terminal_conflict(tender_file, user):
    task = _async_task(user, "TenderFile", tender_file.id, "tender_parse")
    task.status = "success"
    task.save(update_fields=["status"])

    with pytest.raises(AlreadyEndedError):
        force_stop_async_task(task.id, user=user)


def _async_task(user, related_type, related_id, task_type="tender_parse"):
    from apps.common.models import AsyncTask

    return AsyncTask.objects.create(
        task_type=task_type,
        status=AsyncTask.STATUS_RUNNING,
        related_object_type=related_type,
        related_object_id=str(related_id),
        celery_task_id=f"celery-{task_type}-{related_id}",
        created_by=user,
    )
