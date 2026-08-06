"""站内通知：任务终态信号 + API 测试。"""

import pytest
from rest_framework.test import APIClient

from apps.common.models import AsyncTask
from apps.notifications.models import Notification


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def authed_client(admin_user):
    api_client = APIClient()
    api_client.force_authenticate(user=admin_user)
    return api_client


# ============================================================================
# 信号：AsyncTask 终态 → 通知
# ============================================================================


def _make_async_task(user, status=AsyncTask.STATUS_SUCCESS, **kwargs):
    task = AsyncTask.objects.create(
        task_type="outline_generation",
        status=AsyncTask.STATUS_PENDING,
        created_by=user,
        **kwargs,
    )
    task.status = status
    if status in (AsyncTask.STATUS_SUCCESS, AsyncTask.STATUS_FAILED, AsyncTask.STATUS_CANCELLED):
        task.finished_at = None  # 不关心，仅触发 save
    task.save()
    return task


@pytest.mark.django_db
def test_async_task_success_creates_notification(normal_user):
    task = _make_async_task(normal_user, AsyncTask.STATUS_SUCCESS)
    notif = Notification.objects.get(user=normal_user)
    assert notif.title == "任务已完成"
    assert "大纲生成" in notif.message
    assert notif.related_object_type == "async_task"
    assert notif.related_object_id == str(task.pk)
    assert notif.is_read is False


@pytest.mark.django_db
def test_async_task_failed_creates_notification_with_error(normal_user):
    _make_async_task(normal_user, AsyncTask.STATUS_FAILED, error_message="超时")
    notif = Notification.objects.get(user=normal_user)
    assert notif.title == "任务失败"
    assert "超时" in notif.message


@pytest.mark.django_db
def test_async_task_cancelled_creates_notification(normal_user):
    _make_async_task(normal_user, AsyncTask.STATUS_CANCELLED)
    notif = Notification.objects.get(user=normal_user)
    assert notif.title == "任务已取消"


@pytest.mark.django_db
def test_async_task_running_creates_no_notification(normal_user):
    _make_async_task(normal_user, AsyncTask.STATUS_RUNNING)
    assert Notification.objects.count() == 0


@pytest.mark.django_db
def test_async_task_signal_dedup_on_repeated_saves(normal_user):
    task = _make_async_task(normal_user, AsyncTask.STATUS_SUCCESS)
    # 模拟终态后的再次保存（如进度回调），不应重复通知
    task.progress = 100
    task.save()
    assert Notification.objects.filter(user=normal_user).count() == 1


@pytest.mark.django_db
def test_async_task_without_creator_skips(normal_user):
    task = AsyncTask.objects.create(task_type="outline_generation")
    task.status = AsyncTask.STATUS_SUCCESS
    task.save()
    assert Notification.objects.count() == 0


# ============================================================================
# 信号：GenerationTask 终态 → 通知
# ============================================================================


@pytest.fixture
def generation_task(bid_manager_user):
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Outline
    from apps.projects.models import Lot, Project

    project = Project.objects.create(name="测试项目", created_by=bid_manager_user)
    lot = Lot.objects.create(name="测试标段", project=project)
    outline = Outline.objects.create(
        project=project, lot=lot, name="测试大纲", source="preset",
        created_by=bid_manager_user,
    )
    return GenerationTask.objects.create(
        task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
        outline=outline,
        created_by=bid_manager_user,
    )


@pytest.mark.django_db
def test_generation_task_completed_creates_notification(generation_task, bid_manager_user):
    from apps.outline.constants import GenerationTaskStatus

    generation_task.status = GenerationTaskStatus.COMPLETED
    generation_task.success_count = 5
    generation_task.failed_count = 1
    generation_task.save()
    notif = Notification.objects.get(user=bid_manager_user)
    assert notif.title == "生成任务已完成"
    assert "成功 5 项" in notif.message
    assert "失败 1 项" in notif.message
    assert notif.related_object_type == "generation_task"
    assert notif.related_object_id == str(generation_task.pk)


@pytest.mark.django_db
def test_generation_task_running_creates_no_notification(generation_task, bid_manager_user):
    generation_task.save()  # 保持 pending，仅触发一次 save
    assert Notification.objects.count() == 0


# ============================================================================
# API
# ============================================================================


@pytest.mark.django_db
def test_notifications_require_auth(client):
    assert client.get("/api/notifications/").status_code == 401
    assert client.get("/api/notifications/unread-count/").status_code == 401
    assert client.post("/api/notifications/read-all/").status_code == 401


@pytest.mark.django_db
def test_list_returns_own_with_counts(authed_client, admin_user, normal_user):
    Notification.objects.create(user=admin_user, title="A", is_read=False)
    Notification.objects.create(user=admin_user, title="B", is_read=True)
    Notification.objects.create(user=normal_user, title="别人的", is_read=False)

    resp = authed_client.get("/api/notifications/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert body["unread_count"] == 1
    assert [n["title"] for n in body["results"]] == ["B", "A"]  # 新→旧


@pytest.mark.django_db
def test_list_limit_and_unread_only(authed_client, admin_user):
    for i in range(25):
        Notification.objects.create(user=admin_user, title=f"通知{i}", is_read=(i % 2 == 0))

    resp = authed_client.get("/api/notifications/?limit=10")
    assert len(resp.json()["results"]) == 10

    resp = authed_client.get("/api/notifications/?unread_only=1")
    body = resp.json()
    assert body["total"] == 12
    assert all(not n["is_read"] for n in body["results"])

    resp = authed_client.get("/api/notifications/?limit=999")
    assert len(resp.json()["results"]) == 25  # 上限 50 内取全部


@pytest.mark.django_db
def test_unread_count_endpoint(authed_client, admin_user):
    Notification.objects.create(user=admin_user, title="A")
    Notification.objects.create(user=admin_user, title="B")
    resp = authed_client.get("/api/notifications/unread-count/")
    assert resp.json()["unread_count"] == 2


@pytest.mark.django_db
def test_read_all_marks_own_only(authed_client, admin_user, normal_user):
    Notification.objects.create(user=admin_user, title="A")
    Notification.objects.create(user=admin_user, title="B")
    Notification.objects.create(user=normal_user, title="别人的")

    resp = authed_client.post("/api/notifications/read-all/")
    assert resp.json()["updated"] == 2
    assert Notification.objects.filter(user=admin_user, is_read=False).count() == 0
    assert Notification.objects.filter(user=normal_user, is_read=False).count() == 1


@pytest.mark.django_db
def test_read_single_and_foreign_ownership(authed_client, admin_user, normal_user):
    own = Notification.objects.create(user=admin_user, title="A")
    other = Notification.objects.create(user=normal_user, title="别人的")

    resp = authed_client.post(f"/api/notifications/{own.pk}/read/")
    assert resp.status_code == 200
    assert Notification.objects.get(pk=own.pk).is_read is True

    resp = authed_client.post(f"/api/notifications/{other.pk}/read/")
    assert resp.status_code == 404
    assert Notification.objects.get(pk=other.pk).is_read is False
