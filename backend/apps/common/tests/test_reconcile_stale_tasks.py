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
