"""成员候选用户搜索接口测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.projects.models import Project, ProjectMember, ProjectRole

User = get_user_model()


def _create_owner_membership(project, user):
    """创建项目 owner 成员关系（含 member.manage 权限）。"""
    owner_role = ProjectRole.objects.create(
        project=project,
        name="项目负责人",
        code="owner",
        permissions=["project.view", "project.update", "project.member.manage"],
        is_builtin=True,
    )
    return ProjectMember.objects.create(project=project, user=user, project_role=owner_role)


@pytest.fixture
def setup_data(db):
    """测试数据准备。"""
    user = User.objects.create_user(username="owner", password="testpass")
    project = Project.objects.create(name="测试项目", created_by=user)
    _create_owner_membership(project, user)
    return {"user": user, "project": project}


@pytest.fixture
def client(setup_data):
    """认证客户端。"""
    c = APIClient()
    c.force_authenticate(user=setup_data["user"])
    return c


@pytest.mark.django_db
def test_search_by_keyword(client, setup_data):
    """按关键词搜索用户。"""
    User.objects.create_user(username="zhangsan", real_name="张三", password="testpass")
    User.objects.create_user(username="lisi", real_name="李四", password="testpass")
    project = setup_data["project"]

    response = client.get(f"/api/projects/{project.id}/member-candidates/", {"q": "zhang"})

    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]["username"] == "zhangsan"
    assert response.data[0]["real_name"] == "张三"


@pytest.mark.django_db
def test_search_by_real_name(client, setup_data):
    """支持按真实姓名搜索。"""
    User.objects.create_user(username="user1", real_name="王五", password="testpass")
    project = setup_data["project"]

    response = client.get(f"/api/projects/{project.id}/member-candidates/", {"q": "王五"})

    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]["username"] == "user1"


@pytest.mark.django_db
def test_excludes_existing_members(client, setup_data):
    """排除已是项目成员的用户。"""
    project = setup_data["project"]
    existing = User.objects.create_user(username="existing", password="testpass")
    ProjectMember.objects.create(
        project=project,
        user=existing,
        project_role=ProjectRole.objects.get(project=project, code="owner"),
    )

    response = client.get(
        f"/api/projects/{project.id}/member-candidates/", {"q": "existing"}
    )

    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_excludes_inactive_users(client, setup_data):
    """排除已禁用的用户。"""
    User.objects.create_user(username="disabled", password="testpass", is_active=False)
    project = setup_data["project"]

    response = client.get(f"/api/projects/{project.id}/member-candidates/", {"q": "disabled"})

    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_requires_member_manage_permission(setup_data):
    """无成员管理权限返回 403。"""
    project = setup_data["project"]
    viewer_role = ProjectRole.objects.create(
        project=project,
        name="查看者",
        code="viewer",
        permissions=["project.view"],
        is_builtin=True,
    )
    viewer = User.objects.create_user(username="viewer", password="testpass")
    ProjectMember.objects.create(project=project, user=viewer, project_role=viewer_role)

    client = APIClient()
    client.force_authenticate(user=viewer)

    response = client.get(f"/api/projects/{project.id}/member-candidates/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_empty_keyword_returns_all(client, setup_data):
    """空关键词返回所有候选（不含成员与禁用用户）。"""
    User.objects.create_user(username="zhangsan", password="testpass")
    User.objects.create_user(username="lisi", password="testpass")
    project = setup_data["project"]

    response = client.get(f"/api/projects/{project.id}/member-candidates/")

    assert response.status_code == 200
    assert len(response.data) == 2
