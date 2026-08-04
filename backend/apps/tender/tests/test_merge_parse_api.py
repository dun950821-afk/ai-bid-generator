"""merge-parse API 测试。"""

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.common.models import AsyncTask
from apps.projects.models import Lot, Project, ProjectMember, ProjectRole
from apps.tender.models import TenderFile

User = get_user_model()


def _create_owner_membership(project, user):
    """创建项目 owner 成员关系。"""
    owner_role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["project.view", "project.update", "tender.upload", "tender.view", "tender.delete"],
        is_builtin=True,
    )
    return ProjectMember.objects.create(project=project, user=user, project_role=owner_role)


def make_file(project, user, name, lot=None, status=TenderFile.STATUS_PARSED):
    return TenderFile.objects.create(
        project=project, lot=lot, original_name=name, file_size=1024,
        content_type="application/pdf", object_key=f"tender/{name}",
        status=status, created_by=user,
    )


@pytest.fixture
def setup_data(db):
    """测试数据准备。

    manager：超管，具备全局 tender.manage 权限；
    editor：仅项目 owner 角色成员，无全局权限；
    other_project / lot / other_lot：跨项目、跨标段校验用。
    """
    manager = User.objects.create_superuser(username="manager", password="testpass")
    editor = User.objects.create_user(username="editor", password="testpass")
    project = Project.objects.create(name="测试项目", created_by=manager)
    other_project = Project.objects.create(name="其他项目", created_by=manager)
    lot = Lot.objects.create(project=project, name="标段一")
    other_lot = Lot.objects.create(project=project, name="标段二")
    _create_owner_membership(project, editor)
    return {
        "manager": manager,
        "editor": editor,
        "project": project,
        "other_project": other_project,
        "lot": lot,
        "other_lot": other_lot,
    }


@pytest.mark.django_db
class TestMergeParseApi:
    def test_merge_parse_success(self, setup_data):
        """合并解析成功：创建 AsyncTask + 触发 Celery 任务。"""
        project = setup_data["project"]
        manager = setup_data["manager"]
        main = make_file(project, manager, "main.pdf")
        att = make_file(project, manager, "att.pdf")
        client = APIClient()
        client.force_authenticate(manager)

        with patch("apps.tender.views.merge_parse_files") as task_mock:
            resp = client.post(
                f"/api/tender/files/{main.id}/merge-parse",
                {"file_ids": [att.id]},
                format="json",
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "pending"
        task = AsyncTask.objects.get(pk=body["task_id"])
        assert task.task_type == "tender_merge_parse"
        assert task.related_object_id == str(main.id)
        task_mock.delay.assert_called_once_with(task.id, main.id, [att.id])

    def test_merge_parse_missing_file_ids(self, setup_data):
        """缺少 file_ids 返回 400。"""
        project = setup_data["project"]
        manager = setup_data["manager"]
        main = make_file(project, manager, "main.pdf")
        client = APIClient()
        client.force_authenticate(manager)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse", {}, format="json")
        assert resp.status_code == 400

    def test_merge_parse_attachment_wrong_project(self, setup_data):
        """附件与主文件不在同一项目返回 400。"""
        project = setup_data["project"]
        other_project = setup_data["other_project"]
        manager = setup_data["manager"]
        main = make_file(project, manager, "main.pdf")
        att = make_file(other_project, manager, "att.pdf")
        client = APIClient()
        client.force_authenticate(manager)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": [att.id]}, format="json")
        assert resp.status_code == 400

    def test_merge_parse_attachment_wrong_lot(self, setup_data):
        """附件与主文件不在同一标段返回 400。"""
        project = setup_data["project"]
        lot = setup_data["lot"]
        other_lot = setup_data["other_lot"]
        manager = setup_data["manager"]
        main = make_file(project, manager, "main.pdf", lot=lot)
        att = make_file(project, manager, "att.pdf", lot=other_lot)
        client = APIClient()
        client.force_authenticate(manager)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": [att.id]}, format="json")
        assert resp.status_code == 400

    def test_merge_parse_running_status_rejected(self, setup_data):
        """主文件处理中状态拒绝重复触发。

        必须携带有效附件 id，确保请求通过 file_ids 非空校验，
        真实触发 RUNNING_STATUSES 分支（而非空 file_ids 的 400）。
        """
        project = setup_data["project"]
        lot = setup_data["lot"]
        manager = setup_data["manager"]
        main = make_file(project, manager, "main.pdf", lot=lot, status=TenderFile.STATUS_CHUNKING)
        att = make_file(project, manager, "att.pdf", lot=lot)
        client = APIClient()
        client.force_authenticate(manager)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": [att.id]}, format="json")
        assert resp.status_code == 400
        assert "正在处理中" in resp.json()["message"]

    def test_merge_parse_requires_permission(self, setup_data):
        """非 tender.manage 用户 403。"""
        project = setup_data["project"]
        editor = setup_data["editor"]
        main = make_file(project, editor, "main.pdf")
        client = APIClient()
        client.force_authenticate(editor)
        resp = client.post(
            f"/api/tender/files/{main.id}/merge-parse",
            {"file_ids": []}, format="json")
        assert resp.status_code == 403
