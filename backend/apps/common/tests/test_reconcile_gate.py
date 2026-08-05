"""reconcile Redis 门控测试：间隔内二次调用跳过；DB 参数覆盖宽限期。"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.common.tasks import reconcile_stale_async_tasks
from apps.task_queue.models import TaskQueueConfig


@pytest.fixture
def admin_user(django_user_model):
    return django_user_model.objects.create_user(username="gate-admin", password="x")


@pytest.mark.django_db
def test_second_call_within_interval_skips(tender_file):
    """间隔内第二次调用返回 skipped，不重复回收。"""
    from apps.common.models import AsyncTask

    AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_RUNNING,
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
    )
    AsyncTask.objects.filter(task_type="tender_parse").update(
        updated_at=timezone.now() - timedelta(hours=2)
    )

    first = reconcile_stale_async_tasks()
    second = reconcile_stale_async_tasks()

    assert first["reclaimed"] >= 1
    assert second == {"skipped": True}


@pytest.mark.django_db
def test_db_stale_grace_overrides_default(tender_file, admin_user):
    """DB 配置宽限期（5 分钟）生效：超过 5 分钟未完成的任务被回收。"""
    from apps.common.models import AsyncTask

    TaskQueueConfig.objects.create(
        key="stale_task_grace_minutes", value=5, updated_by=admin_user
    )

    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_RUNNING,
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
    )
    # 10 分钟前：超过 5 分钟宽限期
    AsyncTask.objects.filter(pk=task.pk).update(
        updated_at=timezone.now() - timedelta(minutes=10)
    )

    result = reconcile_stale_async_tasks()

    assert result["reclaimed"] >= 1
    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_FAILED


@pytest.mark.django_db
def test_default_grace_keeps_10min_old_task(tender_file):
    """默认宽限期 60 分钟：10 分钟前的任务不被回收。"""
    from apps.common.models import AsyncTask

    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status=AsyncTask.STATUS_RUNNING,
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
    )
    AsyncTask.objects.filter(pk=task.pk).update(
        updated_at=timezone.now() - timedelta(minutes=10)
    )

    result = reconcile_stale_async_tasks()

    assert result["reclaimed"] == 0
    task.refresh_from_db()
    assert task.status == AsyncTask.STATUS_RUNNING
