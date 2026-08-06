"""task_queue API 视图测试：权限、404、409、列表/配置/批量强制结束接口。"""

from unittest import mock

import pytest
from django.urls import reverse


@pytest.fixture
def admin_api(api_client, admin_user):
    api_client.force_authenticate(admin_user)
    return api_client


@pytest.fixture
def normal_api(api_client, normal_user):
    api_client.force_authenticate(normal_user)
    return api_client


@pytest.mark.django_db
def test_list_tasks_requires_queue_manage(normal_api):
    r = normal_api.get("/api/task-queue/tasks/")
    assert r.status_code == 403


@pytest.mark.django_db
def test_list_tasks_returns_200(admin_api):
    r = admin_api.get("/api/task-queue/tasks/")
    assert r.status_code == 200
    assert "items" in r.data
    assert "total" in r.data


@pytest.mark.django_db
def test_config_requires_queue_manage(normal_api):
    r = normal_api.get("/api/task-queue/config/")
    assert r.status_code == 403


@pytest.mark.django_db
def test_config_list(admin_api):
    r = admin_api.get("/api/task-queue/config/")
    assert r.status_code == 200
    assert len(r.data["items"]) == 8


@pytest.mark.django_db
def test_config_save_invalid_values(admin_api):
    r = admin_api.patch(
        "/api/task-queue/config/",
        {"values": {"stale_task_grace_minutes": 99999}},
        format="json",
    )
    assert r.status_code == 400
    assert "stale_task_grace_minutes" in r.data["errors"]


@pytest.mark.django_db
def test_force_stop_missing_task_404(admin_api):
    r = admin_api.post("/api/task-queue/tasks/generation/999999/force-stop/")
    assert r.status_code == 404
    r = admin_api.post("/api/task-queue/tasks/async/999999/force-stop/")
    assert r.status_code == 404


@pytest.mark.django_db
def test_force_stop_terminal_task_409(admin_api, tender_file_factory, project, bid_manager_user):
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Outline
    from apps.projects.models import Lot

    lot = Lot.objects.create(project=project, name="409测试标段")
    outline = Outline.objects.create(
        project=project, lot=lot, name="409测试大纲", created_by=bid_manager_user
    )
    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.COMPLETED,
        created_by=bid_manager_user,
    )
    r = admin_api.post(f"/api/task-queue/tasks/generation/{task.id}/force-stop/")
    assert r.status_code == 409
    assert "已结束" in r.data["message"]


@pytest.mark.django_db
def test_batch_force_stop_requires_queue_manage(normal_api):
    r = normal_api.post(
        "/api/task-queue/tasks/batch-force-stop/",
        {"items": [{"kind": "generation", "id": 1}]},
        format="json",
    )
    assert r.status_code == 403


@pytest.mark.django_db
def test_batch_force_stop_bad_body(admin_api):
    r = admin_api.post("/api/task-queue/tasks/batch-force-stop/", {"items": []}, format="json")
    assert r.status_code == 400
    r = admin_api.post("/api/task-queue/tasks/batch-force-stop/", {"items": "x"}, format="json")
    assert r.status_code == 400
    r = admin_api.post("/api/task-queue/tasks/batch-force-stop/", {}, format="json")
    assert r.status_code == 400


@pytest.mark.django_db
def test_batch_force_stop_mixed_results(admin_api, project, bid_manager_user):
    """混合场景：成功 1、已结束 1（409 捕获）、不存在 1（404 捕获）、格式错误 1，互不影响。"""
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Outline
    from apps.projects.models import Lot

    lot = Lot.objects.create(project=project, name="批量强制结束测试标段")
    outline = Outline.objects.create(
        project=project, lot=lot, name="批量测试大纲", created_by=bid_manager_user
    )
    running = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.RUNNING,
        celery_task_id="celery-batch-1",
        created_by=bid_manager_user,
    )
    ended = GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.COMPLETED,
        created_by=bid_manager_user,
    )

    with mock.patch("config.celery.app.control.revoke"):
        r = admin_api.post(
            "/api/task-queue/tasks/batch-force-stop/",
            {
                "items": [
                    {"kind": "generation", "id": running.id},
                    {"kind": "generation", "id": ended.id},
                    {"kind": "generation", "id": 999999},
                    {"kind": "async", "id": "bad"},
                ],
                "reason": "测试批量结束",
            },
            format="json",
        )

    assert r.status_code == 200
    assert r.data["success_count"] == 1
    assert r.data["failed_count"] == 3

    by_id = {item["id"]: item for item in r.data["items"]}
    assert by_id[running.id]["success"] is True
    assert by_id[ended.id]["success"] is False
    assert "已结束" in by_id[ended.id]["message"]
    assert by_id[999999]["success"] is False
    assert by_id[999999]["message"] == "任务不存在"
    assert by_id["bad"]["success"] is False
    assert by_id["bad"]["message"] == "参数格式错误"

    running.refresh_from_db()
    assert running.status == GenerationTaskStatus.FAILED
    assert running.force_stopped is True
    assert running.error_message
    ended.refresh_from_db()
    assert ended.status == GenerationTaskStatus.COMPLETED
    assert ended.force_stopped is False


@pytest.mark.django_db
def test_recent_force_stopped_visible_to_any_authed(normal_api, project, bid_manager_user):
    from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Outline
    from apps.projects.models import Lot

    lot = Lot.objects.create(project=project, name="提示测试标段")
    outline = Outline.objects.create(
        project=project, lot=lot, name="提示测试大纲", created_by=bid_manager_user
    )
    GenerationTask.objects.create(
        task_type=GenerationTaskType.MATRIX_GENERATION,
        outline=outline,
        status=GenerationTaskStatus.FAILED,
        force_stopped=True,
        force_stopped_at="2026-08-05T00:00:00Z",
        created_by=bid_manager_user,
    )

    r = normal_api.get("/api/task-queue/force-stopped/recent/")
    assert r.status_code == 200
    assert isinstance(r.data["items"], list)
