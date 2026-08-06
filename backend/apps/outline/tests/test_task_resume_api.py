"""任务恢复 API 测试：全局事实提取幂等 + 矩阵生成已有任务返回 202。

场景：用户点击「提取全局事实」/「生成内容责任矩阵」时已有进行中的任务，
后端不应重复创建任务或返回 400，而应返回已有任务让前端恢复进度。
"""

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.common.models import AsyncTask
from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
from apps.outline.models import GenerationTask, Outline, Section
from apps.projects.models import Lot, Project, ProjectMember, ProjectRole

User = get_user_model()


def _create_owner_membership(project, user):
    """创建项目 owner 成员关系（OutlineViewSet.get_queryset 按成员过滤）。"""
    owner_role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["outline.view"],
        is_builtin=True,
    )
    return ProjectMember.objects.create(project=project, user=user, project_role=owner_role)


@pytest.fixture
def setup(db):
    manager = User.objects.create_superuser(username="manager", password="testpass")
    project = Project.objects.create(name="测试项目", created_by=manager)
    lot = Lot.objects.create(project=project, name="标段一")
    outline = Outline.objects.create(
        project=project, lot=lot, name="测试大纲", source="preset", created_by=manager,
    )
    _create_owner_membership(project, manager)
    client = APIClient()
    client.force_authenticate(manager)
    return {"manager": manager, "project": project, "lot": lot, "outline": outline, "client": client}


@pytest.mark.django_db
class TestGlobalFactExtractResume:
    def test_extract_service_idempotent(self, setup):
        """已有进行中任务时，service 直接返回同一任务，不重复创建。"""
        from apps.outline.services.global_fact_service import GlobalFactService

        outline = setup["outline"]
        user = setup["manager"]
        existing = AsyncTask.objects.create(
            task_type="global_fact_extract",
            status=AsyncTask.STATUS_RUNNING,
            progress=40,
            current_step="第三轮",
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=user,
        )
        with patch(
            "apps.common.tasks_utils.enqueue_after_commit"
        ) as enqueue_mock:
            result = GlobalFactService().extract_global_facts(outline.id, user)
        assert result.id == existing.id
        enqueue_mock.assert_not_called()
        assert AsyncTask.objects.filter(task_type="global_fact_extract").count() == 1

    def test_extract_api_existing_returns_same_task(self, setup):
        """POST extract：已有进行中任务时返回 existing=True + 同一 task_id。"""
        outline = setup["outline"]
        user = setup["manager"]
        client = setup["client"]
        existing = AsyncTask.objects.create(
            task_type="global_fact_extract",
            status=AsyncTask.STATUS_RUNNING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=user,
        )
        with patch("apps.common.tasks_utils.enqueue_after_commit"):
            resp = client.post(f"/api/outlines/{outline.id}/global-facts/extract/")
        assert resp.status_code == 202
        body = resp.json()
        assert body["existing"] is True
        assert body["task_id"] == existing.id
        assert "恢复进度" in body["message"]

    def test_extract_api_no_existing_task(self, setup):
        """无进行中任务时正常提交：existing=False。"""
        outline = setup["outline"]
        client = setup["client"]
        with patch("apps.common.tasks_utils.enqueue_after_commit"):
            resp = client.post(f"/api/outlines/{outline.id}/global-facts/extract/")
        assert resp.status_code == 202
        body = resp.json()
        assert body["existing"] is False
        assert body["status"] == "pending"

    def test_extract_progress_api(self, setup):
        """GET extract-progress：返回进行中任务详情；无任务返回 null。"""
        outline = setup["outline"]
        user = setup["manager"]
        client = setup["client"]
        AsyncTask.objects.create(
            task_type="global_fact_extract",
            status=AsyncTask.STATUS_PENDING,
            progress=10,
            current_step="第一轮",
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=user,
        )
        resp = client.get(f"/api/outlines/{outline.id}/global-facts/extract-progress/")
        assert resp.status_code == 200
        task = resp.json()["task"]
        assert task["status"] == "pending"
        assert task["progress"] == 10
        assert task["current_step"] == "第一轮"

        # 无进行中任务
        AsyncTask.objects.filter(task_type="global_fact_extract").update(
            status=AsyncTask.STATUS_SUCCESS
        )
        resp = client.get(f"/api/outlines/{outline.id}/global-facts/extract-progress/")
        assert resp.json()["task"] is None


@pytest.mark.django_db
class TestMatrixGenerateResume:
    def test_generate_matrix_existing_task_returns_202(self, setup):
        """已有 running 矩阵任务：POST generate_matrix 返回 202 + 该任务 task_id。"""
        outline = setup["outline"]
        client = setup["client"]
        existing = GenerationTask.objects.create(
            outline=outline,
            task_type=GenerationTaskType.MATRIX_GENERATION,
            status=GenerationTaskStatus.RUNNING,
            total_count=10,
            success_count=3,
            created_by=setup["manager"],
        )
        resp = client.post(f"/api/outlines/{outline.id}/generate_matrix/", {}, format="json")
        assert resp.status_code == 202
        body = resp.json()
        assert body["existing"] is True
        assert body["task_id"] == existing.id
        assert body["status"] == "running"

    def test_generate_matrix_no_task_returns_202_existing_false(self, setup):
        """无进行中任务：正常启动新任务。"""
        outline = setup["outline"]
        client = setup["client"]
        from apps.outline.services.matrix_service import MatrixService

        with patch.object(MatrixService, "start_matrix_generation") as start_mock:
            mock_task = GenerationTask(
                id=999, status=GenerationTaskStatus.PENDING, total_count=3,
            )
            start_mock.return_value = mock_task
            resp = client.post(f"/api/outlines/{outline.id}/generate_matrix/", {}, format="json")
        assert resp.status_code == 202
        body = resp.json()
        assert body["existing"] is False
        assert body["task_id"] == 999
        start_mock.assert_called_once()
