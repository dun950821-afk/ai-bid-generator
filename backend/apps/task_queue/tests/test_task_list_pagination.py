"""任务列表 SQL 层分页 + celery 快照缓存回归。"""

from unittest import mock

import pytest

from apps.task_queue.services.task_list_service import (
    CELERY_SNAPSHOT_CACHE_KEY,
    build_celery_snapshot,
    list_tasks,
)


@pytest.fixture
def user(django_user_model):
    return django_user_model.objects.create_user(username="pagination-user", password="x")


@pytest.mark.django_db
def test_pagination_slices_across_tables(user):
    from apps.outline.models import GenerationTask, Outline
    from apps.projects.models import Lot, Project

    project = Project.objects.create(name="分页项目", created_by=user)
    lot = Lot.objects.create(project=project, name="分页标段")
    outline = Outline.objects.create(project=project, lot=lot, name="分页大纲", created_by=user)

    for i in range(12):
        GenerationTask.objects.create(
            outline=outline, task_type="matrix_generation",
            status="completed", created_by=user,
        )
    from apps.common.models import AsyncTask

    for i in range(13):
        AsyncTask.objects.create(
            task_type="tender_parse", status="success", created_by=user,
        )

    page1 = list_tasks(page=1, page_size=20)
    page2 = list_tasks(page=2, page_size=20)

    assert page1["total"] == 25
    assert len(page1["items"]) == 20
    assert len(page2["items"]) == 5
    # 合并排序：两表按 created_at 倒序穿插
    created_ats = [r["created_at"] for r in page1["items"]] + [r["created_at"] for r in page2["items"]]
    assert created_ats == sorted(created_ats, reverse=True)
    assert {r["kind"] for r in page1["items"]} <= {"generation", "async"}


@pytest.mark.django_db
def test_duration_seconds_derived_from_started_at(user):
    """执行时长：已完成 = finished - started；运行中 = now - started。"""
    from django.utils import timezone
    from datetime import timedelta

    from apps.outline.models import GenerationTask, Outline
    from apps.projects.models import Lot, Project

    project = Project.objects.create(name="时长项目", created_by=user)
    lot = Lot.objects.create(project=project, name="时长标段")
    outline = Outline.objects.create(project=project, lot=lot, name="时长大纲", created_by=user)

    now = timezone.now()
    done_task = GenerationTask.objects.create(
        outline=outline, task_type="matrix_generation", status="completed",
        created_by=user, started_at=now - timedelta(minutes=5),
        finished_at=now - timedelta(minutes=2),
    )
    running_task = GenerationTask.objects.create(
        outline=outline, task_type="matrix_generation", status="running",
        created_by=user, started_at=now - timedelta(minutes=3),
    )
    legacy_task = GenerationTask.objects.create(
        outline=outline, task_type="matrix_generation", status="completed",
        created_by=user,
    )

    rows = {r["id"]: r["duration_seconds"] for r in list_tasks(kind="generation", page=1, page_size=20)["items"]}
    assert rows[done_task.id] == 180
    # 运行中：now - started_at，允许 1s 时钟误差
    assert 179 <= rows[running_task.id] <= 181
    # 无 started_at 的旧任务不显示时长
    assert rows[legacy_task.id] is None


@pytest.mark.django_db
def test_kind_filter_limits_source_table(user):
    from apps.common.models import AsyncTask

    for i in range(3):
        AsyncTask.objects.create(task_type="tender_parse", status="success", created_by=user)

    data = list_tasks(kind="async", page=1, page_size=20)
    assert data["total"] == 3
    assert all(r["kind"] == "async" for r in data["items"])

    data = list_tasks(kind="generation", page=1, page_size=20)
    assert data["total"] == 0


@pytest.mark.django_db
def test_snapshot_unreachable_result_is_cached():
    """worker 失联的 None 结果也要缓存，避免每次请求都等广播超时。"""
    from django.core.cache import cache

    with mock.patch("config.celery.app.control.inspect", side_effect=Exception("no worker")):
        assert build_celery_snapshot() is None
        assert cache.get(CELERY_SNAPSHOT_CACHE_KEY) is not None
        # 第二次调用命中缓存，不再触发 inspect
        assert build_celery_snapshot() is None

    cache.delete(CELERY_SNAPSHOT_CACHE_KEY)


@pytest.mark.django_db
def test_snapshot_active_reserved_mapping():
    """active/reserved 映射为 celery_state 展示状态。"""
    from django.core.cache import cache

    fake_inspect = mock.MagicMock()
    fake_inspect.active.return_value = {"celery@w1": [{"id": "task-a"}, {"id": "task-b"}]}
    fake_inspect.reserved.return_value = {"celery@w1": [{"id": "task-c"}]}

    with mock.patch("config.celery.app.control.inspect", return_value=fake_inspect):
        snap = build_celery_snapshot()

    assert snap == {"task-a": "active", "task-b": "active", "task-c": "reserved"}
    cache.delete(CELERY_SNAPSHOT_CACHE_KEY)
