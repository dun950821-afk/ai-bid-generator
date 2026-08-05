"""reconcile_stale_async_tasks 僵尸任务回收测试。"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.common.tasks import reconcile_stale_async_tasks
from apps.requirements.models import RequirementExtractionRun
from apps.tender.constants import PipelineStatus
from apps.tender.models import PipelineJob, TenderFile


@pytest.fixture
def tender_file(db):
    from apps.accounts.models import User
    from apps.projects.models import Project

    user = User.objects.create_user(username="stale-user", password="x")
    project = Project.objects.create(name="回收测试项目", created_by=user)
    return TenderFile.objects.create(
        project=project,
        original_name="招标文件.pdf",
        object_key="stale/test.pdf",
        file_size=100,
        created_by=user,
    )


def _stale_task(tender_file):
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_RUNNING,
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
    )
    # updated_at 是 auto_now，创建后回填历史时间模拟僵尸任务
    AsyncTask.objects.filter(pk=task.pk).update(
        updated_at=timezone.now() - timedelta(hours=2)
    )
    return task


@pytest.mark.django_db
def test_reclaims_stale_running_task(tender_file):
    task = _stale_task(tender_file)

    result = reconcile_stale_async_tasks()

    assert result["reclaimed"] == 1
    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    assert "worker" in task.error_message
    assert task.finished_at is not None


@pytest.mark.django_db
def test_keeps_recent_running_task(tender_file):
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_RUNNING,
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
        updated_at=timezone.now(),
    )

    result = reconcile_stale_async_tasks()

    assert result["reclaimed"] == 0
    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_RUNNING


@pytest.mark.django_db
def test_reclaims_related_run_and_pipeline_job(tender_file):
    task = _stale_task(tender_file)
    run = RequirementExtractionRun.objects.create(
        tender_file=tender_file,
        project=tender_file.project,
        async_task=task,
        status="running",
        extraction_types=["scoring"],
        created_by=tender_file.created_by,
    )
    job = PipelineJob.objects.create(
        tender_file=tender_file,
        stage="parse",
        status=PipelineStatus.RUNNING,
        version="1.0",
    )

    reconcile_stale_async_tasks()

    run.refresh_from_db()
    assert run.status == "failed"
    job.refresh_from_db()
    assert job.status == PipelineStatus.FAILED


@pytest.mark.django_db
def test_reclaims_stuck_parsing_tender_file(tender_file):
    """回收僵尸任务时，必须把卡在 parsing 的 TenderFile 标记为失败。

    回归 BUG：worker 中断后 AsyncTask 被回收，但 TenderFile 状态一直停在
    parsing，前端工作台永远显示"解析中"。
    """
    from apps.tender.models import TenderFile

    task = _stale_task(tender_file)
    tender_file.status = TenderFile.STATUS_PARSING
    tender_file.save(update_fields=["status"])

    reconcile_stale_async_tasks()

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_PARSE_FAILED
    assert "回收" in tender_file.error_message


@pytest.mark.django_db
def test_reclaims_stuck_chunking_tender_file(tender_file):
    """chunking 状态的 TenderFile 也应被回收。"""
    from apps.tender.models import TenderFile

    task = _stale_task(tender_file)
    tender_file.status = TenderFile.STATUS_CHUNKING
    tender_file.save(update_fields=["status"])

    reconcile_stale_async_tasks()

    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_PARSE_FAILED


@pytest.mark.django_db
def test_keeps_ready_tender_file_untouched(tender_file):
    """已就绪的文件不应被误标记。"""
    from apps.tender.models import TenderFile

    task = _stale_task(tender_file)
    tender_file.status = TenderFile.STATUS_READY
    tender_file.save(update_fields=["status"])

    reconcile_stale_async_tasks()

    tender_file.refresh_from_db()
    assert tender_file.status == TenderFile.STATUS_READY


def _generating_outline(tender_file):
    from apps.outline.constants import OutlineSource, OutlineStatus
    from apps.outline.models import Outline
    from apps.projects.models import Lot

    lot = Lot.objects.create(project=tender_file.project, name="回收测试标段")
    outline = Outline.objects.create(
        project=tender_file.project,
        lot=lot,
        name="回收测试大纲",
        source=OutlineSource.AI_GENERATED,
        source_tender_file=tender_file,
        status=OutlineStatus.GENERATING,
        is_current=True,
        created_by=tender_file.created_by,
    )
    # updated_at 是 auto_now，创建后回填历史时间模拟僵尸大纲
    Outline.objects.filter(pk=outline.pk).update(
        updated_at=timezone.now() - timedelta(hours=2)
    )
    return outline


@pytest.mark.django_db
def test_reclaims_generating_outline_deletes_when_no_sections(tender_file):
    from apps.outline.models import Outline

    task = _stale_task(tender_file)
    outline = _generating_outline(tender_file)

    reconcile_stale_async_tasks()

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    assert not Outline.objects.filter(pk=outline.pk).exists()


@pytest.mark.django_db
def test_reclaims_generating_outline_by_lot_related_task(tender_file):
    """大纲生成任务 related_object_type=lot，回收时按 lot 清理 GENERATING 大纲。"""
    from apps.outline.models import Outline

    outline = _generating_outline(tender_file)
    task = AsyncTask.objects.create(
        task_type="outline_generate",
        status=AsyncTask.STATUS_RUNNING,
        related_object_type="lot",
        related_object_id=outline.lot_id,
    )
    AsyncTask.objects.filter(pk=task.pk).update(
        updated_at=timezone.now() - timedelta(hours=2)
    )

    reconcile_stale_async_tasks()

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    assert not Outline.objects.filter(pk=outline.pk).exists()


@pytest.mark.django_db
def test_reclaims_orphan_running_prompt_run(tender_file):
    """无僵尸任务时回收超宽限期的孤立 RUNNING PromptRun。"""
    from apps.generation.constants import PromptRunStatus
    from apps.generation.models import PromptRun

    run = PromptRun.objects.create(
        scenario="outline_children",
        status=PromptRunStatus.RUNNING,
        input_variables={},
    )
    PromptRun.objects.filter(pk=run.pk).update(
        updated_at=timezone.now() - timedelta(hours=2)
    )

    result = reconcile_stale_async_tasks()

    assert result["reclaimed"] == 1
    run.refresh_from_db()
    assert run.status == PromptRunStatus.FAILED
    assert "回收" in run.error_message


@pytest.mark.django_db
def test_keeps_recent_prompt_run(tender_file):
    from apps.generation.constants import PromptRunStatus
    from apps.generation.models import PromptRun

    run = PromptRun.objects.create(
        scenario="outline_children",
        status=PromptRunStatus.RUNNING,
        input_variables={},
        updated_at=timezone.now(),
    )

    result = reconcile_stale_async_tasks()

    assert result["reclaimed"] == 0
    run.refresh_from_db()
    assert run.status == PromptRunStatus.RUNNING


@pytest.mark.django_db
def test_reclaims_generating_outline_drafts_when_has_sections(tender_file):
    from apps.outline.constants import OutlineStatus
    from apps.outline.models import Outline, Section

    task = _stale_task(tender_file)
    outline = _generating_outline(tender_file)
    Section.objects.create(outline=outline, title="第一章", level=1, sort_order=1)

    reconcile_stale_async_tasks()

    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED
    outline.refresh_from_db()
    assert outline.status == OutlineStatus.DRAFT


@pytest.mark.django_db
def test_success_tasks_untouched(tender_file):
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_SUCCESS,
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
        updated_at=timezone.now() - timedelta(hours=2),
    )

    result = reconcile_stale_async_tasks()

    assert result["reclaimed"] == 0
    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_SUCCESS
