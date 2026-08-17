# backend/apps/workflows/tests/test_api.py
"""工作流 API 测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.projects.models import Project, Lot
from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate, LotWorkflow, WorkflowNodeInstance
from apps.workflows.services import TemplateService

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpass")


@pytest.fixture
def project(db, user):
    project = Project.objects.create(
        name="测试项目",
        created_by=user,
    )
    # F-09 后节点接口要求项目成员身份：显式把创建者加入成员
    # （业务接口创建项目时由服务层完成，ORM 直建需手动补）
    from apps.projects.models.project_member import ProjectMember
    from apps.projects.services.role_service import RoleService

    roles = RoleService.initialize_builtin_roles(project)
    owner_role = next(r for r in roles if r.code == "owner")
    ProjectMember.objects.create(project=project, user=user, project_role=owner_role)
    return project


@pytest.fixture
def lot(db, project):
    return Lot.objects.create(
        project=project,
        name="测试标段",
        code="LOT001",
    )


@pytest.fixture
def system_template(db):
    template = WorkflowTemplate.objects.create(
        name="测试模板",
        description="测试用模板",
        scope="system",
        is_builtin=True,
    )
    WorkflowNodeTemplate.objects.create(
        workflow_template=template,
        name="节点1",
        order=1,
    )
    WorkflowNodeTemplate.objects.create(
        workflow_template=template,
        name="节点2",
        order=2,
        requires_approval=True,
    )
    return template


@pytest.mark.django_db
class TestTemplateAPI:
    """模板 API 试。"""

    def test_list_system_templates(self, api_client, user, system_template):
        """测试获取系统模板列表。"""
        api_client.force_authenticate(user=user)
        response = api_client.get("/api/workflows/templates/system/")
        assert response.status_code == 200
        assert len(response.data["results"]) >= 1
        assert response.data["results"][0]["name"] == "测试模板"


@pytest.mark.django_db
class TestWorkflowAPI:
    """工作流 API 试。"""

    def test_initialize_workflow(self, api_client, user, lot, system_template):
        """测试初始化工作流。"""
        api_client.force_authenticate(user=user)
        response = api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        assert response.status_code == 201
        assert response.data["status"] == "not_started"

    def test_initialize_workflow_already_exists(self, api_client, user, lot, system_template):
        """测试重复初始化。"""
        api_client.force_authenticate(user=user)
        # 第一次初始化
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        # 第二次初始化
        response = api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        assert response.status_code == 400

    def test_get_workflow_detail(self, api_client, user, lot, system_template):
        """测试获取工作流详情。"""
        api_client.force_authenticate(user=user)
        # 初始化
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        # 获取详情
        response = api_client.get(f"/api/workflows/instances/{lot.id}/")
        assert response.status_code == 200
        assert "nodes" in response.data

    def test_get_workflow_status(self, api_client, user, lot, system_template):
        """测试获取工作流状态。"""
        api_client.force_authenticate(user=user)
        # 初始化
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        # 获取状态
        response = api_client.get(f"/api/workflows/instances/{lot.id}/status/")
        assert response.status_code == 200
        assert "revision" in response.data
        assert "nodes" in response.data


@pytest.mark.django_db
class TestNodeAPI:
    """节点 API 测试。"""

    def test_start_workflow(self, api_client, user, lot, system_template):
        """测试启动工作流。"""
        api_client.force_authenticate(user=user)
        # 初始化
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        # 启动
        response = api_client.post(f"/api/workflows/instances/{lot.id}/start/")
        assert response.status_code == 200
        assert response.data["status"] == "in_progress"

    def test_node_retry(self, api_client, user, lot, system_template):
        """测试重试节点。"""
        api_client.force_authenticate(user=user)
        # 初始化并启动
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        api_client.post(f"/api/workflows/instances/{lot.id}/start/")

        # 获取节点
        workflow = LotWorkflow.objects.get(lot=lot)
        node = workflow.nodes.first()

        # 标记失败
        node.status = "failed"
        node.save()

        # 重试
        response = api_client.post(
            f"/api/workflows/nodes/{node.id}/retry/",
            {"reason": "测试重试"},
        )
        assert response.status_code == 200
        assert response.data["status"] == "in_progress"

    def test_invalid_state_transition(self, api_client, user, lot, system_template):
        """测试非法状态迁移。"""
        api_client.force_authenticate(user=user)
        # 初始化并启动
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        api_client.post(f"/api/workflows/instances/{lot.id}/start/")

        # 获取节点
        workflow = LotWorkflow.objects.get(lot=lot)
        node = workflow.nodes.first()

        # 标记完成
        node.status = "completed"
        node.save()

        # 尝试再次完成
        response = api_client.post(f"/api/workflows/nodes/{node.id}/complete/")
        assert response.status_code == 409
        # DRF 返回 detail 字段
        assert "detail" in response.data or "error" in response.data

    def test_node_logs(self, api_client, user, lot, system_template):
        """测试获取节点日志。"""
        api_client.force_authenticate(user=user)
        # 初始化并启动
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        api_client.post(f"/api/workflows/instances/{lot.id}/start/")

        workflow = LotWorkflow.objects.get(lot=lot)
        node = workflow.nodes.first()

        response = api_client.get(f"/api/workflows/nodes/{node.id}/logs/")
        assert response.status_code == 200
        assert "results" in response.data

class TestNodeAccessControl:
    """F-09 回归：非项目成员不能读节点、不能执行节点动作。"""

    def _node(self, api_client, user, lot, system_template):
        api_client.force_authenticate(user=user)
        api_client.post(
            f"/api/workflows/instances/{lot.id}/initialize/",
            {"template_id": system_template.id},
        )
        api_client.post(f"/api/workflows/instances/{lot.id}/start/")
        workflow = LotWorkflow.objects.get(lot=lot)
        return workflow.nodes.first()

    def test_stranger_cannot_read_node(self, api_client, user, lot, system_template):
        node = self._node(api_client, user, lot, system_template)
        stranger = User.objects.create_user(username="f09-stranger", password="x")
        api_client.force_authenticate(user=stranger)
        assert api_client.get(f"/api/workflows/nodes/{node.id}/").status_code == 403

    def test_stranger_cannot_approve(self, api_client, user, lot, system_template):
        node = self._node(api_client, user, lot, system_template)
        stranger = User.objects.create_user(username="f09-stranger2", password="x")
        api_client.force_authenticate(user=stranger)
        resp = api_client.post(f"/api/workflows/nodes/{node.id}/approve/", {"comment": "x"})
        # 必须是 403 权限拒绝，而不是穿透到状态机的 409
        assert resp.status_code == 403

    def test_anonymous_rejected(self, api_client, user, lot, system_template):
        node = self._node(api_client, user, lot, system_template)
        api_client.force_authenticate(user=None)
        assert api_client.get(f"/api/workflows/nodes/{node.id}/").status_code in (401, 403)
